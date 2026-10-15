/**
 * O livro-caixa dos votos — node:sqlite.
 *
 * A contagem em memória é rápida e é a que desenha a tela; o banco é a
 * memória longa. A regra da seção 4.5 da especificação é que o disco NUNCA
 * derruba a contagem: se a gravação falhar, o voto continua contado e o erro
 * é registrado.
 *
 * O banco serve para duas coisas, e as duas são testes críticos da seção 8:
 *
 *   - a página recarregada no meio da rodada reconstrói tudo daqui;
 *   - o adaptador que cai e volta não conta voto em dobro, porque a chave de
 *     deduplicação é ÚNICA NO BANCO. Guardá-la só na memória deixaria uma
 *     reconexão que reinicia o processo reabrir a porta para os votos que já
 *     entraram.
 *
 * Sem ORM e sem dependência: `node:sqlite` vem no Node 22+, e o projeto tem
 * zero dependências de execução desde o primeiro commit.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** O esquema da seção 5 da especificação. */
const ESQUEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS rodadas (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    iniciada_em       INTEGER NOT NULL,
    encerrada_em      INTEGER,
    duracao_segundos  INTEGER NOT NULL DEFAULT 0,
    motivo            TEXT
  );

  CREATE TABLE IF NOT EXISTS votos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    rodada_id   INTEGER NOT NULL,
    chave       TEXT    NOT NULL UNIQUE,
    urna_id     TEXT    NOT NULL,
    usuario     TEXT    NOT NULL DEFAULT '',
    presente    TEXT    NOT NULL DEFAULT '',
    votos       INTEGER NOT NULL DEFAULT 1,
    em          INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_votos_rodada ON votos (rodada_id, id);
  CREATE INDEX IF NOT EXISTS idx_votos_usuario ON votos (rodada_id, usuario);
`;

/**
 * Abre (ou cria) o banco.
 *
 * `:memory:` é o padrão, e é o que os testes usam — um banco de verdade, com
 * as mesmas restrições, sem tocar no disco.
 */
export function abrirBanco(caminho = ':memory:') {
  if (caminho !== ':memory:') mkdirSync(dirname(caminho), { recursive: true });
  const db = new DatabaseSync(caminho);
  db.exec(ESQUEMA);

  let fechado = false;

  /*
   * A muralha.
   *
   * Toda escrita passa por aqui, e nada sai daqui como exceção. A seção 7 da
   * especificação é explícita: falha ao gravar NÃO pode interromper a
   * contagem. Um `throw` num caminho de escrita do meio de uma live
   * derrubaria o processo e, com ele, a rodada inteira que estava só na
   * memória.
   */
  const tentar = (rotulo, fn, padrao = null) => {
    try {
      return fn();
    } catch (erro) {
      console.error(`[banco] ${rotulo}: ${erro.message}`);
      return padrao;
    }
  };

  const linhaParaRodada = (l) => (l ? {
    id: Number(l.id),
    iniciadaEm: Number(l.iniciada_em),
    encerradaEm: l.encerrada_em == null ? null : Number(l.encerrada_em),
    duracaoSegundos: Number(l.duracao_segundos),
    motivo: l.motivo ?? null,
  } : null);

  const linhaParaVoto = (l) => ({
    chave: l.chave,
    urnaId: l.urna_id,
    usuario: l.usuario,
    presente: l.presente,
    votos: Number(l.votos),
    em: Number(l.em),
  });

  return {
    caminho,

    /** Abre uma rodada e devolve ela. A anterior NÃO é encerrada sozinha. */
    abrirRodada({ iniciadaEm = Date.now(), duracaoSegundos = 0 } = {}) {
      return tentar('abrir rodada', () => {
        const r = db.prepare(
          'INSERT INTO rodadas (iniciada_em, duracao_segundos) VALUES (?, ?)',
        ).run(iniciadaEm, duracaoSegundos);
        return this.rodadaPorId(Number(r.lastInsertRowid));
      }, null);
    },

    encerrarRodada({ id, encerradaEm = Date.now(), motivo = null } = {}) {
      return tentar('encerrar rodada', () => {
        db.prepare('UPDATE rodadas SET encerrada_em = ?, motivo = ? WHERE id = ?')
          .run(encerradaEm, motivo, id);
        return this.rodadaPorId(id);
      }, null);
    },

    rodadaPorId(id) {
      return tentar('ler rodada', () =>
        linhaParaRodada(db.prepare('SELECT * FROM rodadas WHERE id = ?').get(id)), null);
    },

    /** A rodada mais recente, aberta ou não. `null` antes da primeira. */
    rodadaAtual() {
      return tentar('ler a rodada atual', () =>
        linhaParaRodada(db.prepare('SELECT * FROM rodadas ORDER BY id DESC LIMIT 1').get()), null);
    },

    /**
     * Grava um voto. `false` quando a chave já estava lá.
     *
     * Quem chama conta o voto em memória do mesmo jeito: um `false` aqui
     * significa "isto já foi contado antes", e não "isto não vale".
     */
    registrarVoto({ rodadaId, chave, urnaId, usuario = '', presente = '', votos = 1, em = Date.now() }) {
      return tentar('gravar voto', () => {
        db.prepare(`
          INSERT OR IGNORE INTO votos (rodada_id, chave, urna_id, usuario, presente, votos, em)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(rodadaId, chave, urnaId, usuario, presente, votos, em);
        return db.prepare('SELECT changes() AS n').get().n > 0;
      }, false);
    },

    /** A chave já foi gravada nesta ou em qualquer outra rodada? */
    jaContado(chave) {
      return tentar('procurar a chave', () =>
        Boolean(db.prepare('SELECT 1 FROM votos WHERE chave = ?').get(chave)), false);
    },

    /** `{ urnaId: votos }` da rodada. */
    contagem(rodadaId) {
      const linhas = tentar('somar a rodada', () =>
        db.prepare(
          'SELECT urna_id, SUM(votos) AS total FROM votos WHERE rodada_id = ? GROUP BY urna_id',
        ).all(rodadaId), []);
      const saida = {};
      for (const l of linhas) saida[l.urna_id] = Number(l.total);
      return saida;
    },

    /** Os votos da rodada, na ordem em que entraram. */
    votosDaRodada(rodadaId, limite = 0) {
      const linhas = tentar('ler os votos', () => (limite > 0
        ? db.prepare('SELECT * FROM votos WHERE rodada_id = ? ORDER BY id DESC LIMIT ?').all(rodadaId, limite).reverse()
        : db.prepare('SELECT * FROM votos WHERE rodada_id = ? ORDER BY id ASC').all(rodadaId)), []);
      return linhas.map(linhaParaVoto);
    },

    /** Quem mais presenteou, do maior para o menor. */
    apoiadores(rodadaId, limite = 10) {
      const linhas = tentar('ler os apoiadores', () =>
        db.prepare(`
          SELECT usuario, SUM(votos) AS votos, COUNT(*) AS presentes
          FROM votos WHERE rodada_id = ? AND usuario <> ''
          GROUP BY usuario ORDER BY votos DESC, usuario ASC LIMIT ?
        `).all(rodadaId, limite), []);
      return linhas.map((l) => ({
        usuario: l.usuario, votos: Number(l.votos), presentes: Number(l.presentes),
      }));
    },

    /**
     * Apaga o que é velho.
     *
     * A especificação pede memória estável em lives de várias horas. O banco
     * não é o problema principal — o log rotativo e as timelines recicladas
     * são —, mas uma tabela que cresce sem fim num servidor que fica de pé a
     * noite inteira acaba doendo.
     */
    podar({ manterRodadas = 20 } = {}) {
      return tentar('podar rodadas antigas', () => {
        db.prepare(`
          DELETE FROM votos WHERE rodada_id NOT IN (
            SELECT id FROM rodadas ORDER BY id DESC LIMIT ?
          )
        `).run(manterRodadas);
        db.prepare(`
          DELETE FROM rodadas WHERE id NOT IN (
            SELECT id FROM rodadas ORDER BY id DESC LIMIT ?
          )
        `).run(manterRodadas);
      });
    },

    fechar() {
      if (fechado) return;
      fechado = true;
      tentar('fechar o banco', () => db.close());
    },
  };
}
