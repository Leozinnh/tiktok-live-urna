import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { abrirBanco } from '../server/db.js';

/*
 * O livro-caixa dos votos.
 *
 * A contagem em memória é rápida e é a que desenha a tela; o banco é a
 * memória longa. A regra da seção 4.5 da especificação é que o disco NUNCA
 * derruba a contagem: se a gravação falhar, o voto continua contado e a
 * gravação é retentada. O banco serve para duas coisas, e as duas são
 * testes críticos da seção 8:
 *
 *   - a página recarregada no meio da rodada reconstrói tudo daqui (teste 5);
 *   - o WebSocket que cai e volta não conta voto em dobro (teste 6), porque
 *     a chave de deduplicação é única no banco, e não só na memória.
 */

async function comBanco(rodar) {
  const pasta = await mkdtemp(join(tmpdir(), 'urna-db-'));
  const db = abrirBanco(join(pasta, 'votos.db'));
  try {
    await rodar(db, join(pasta, 'votos.db'));
  } finally {
    db.fechar();
    await rm(pasta, { recursive: true, force: true });
  }
}

const voto = (extra = {}) => ({
  rodadaId: 1, chave: 'tiktok:ana:2:1700000000:0',
  urnaId: 'u1', usuario: 'ana', presente: 'Rosa', votos: 1,
  em: 1700000000000, ...extra,
});

test('uma rodada aberta vira a rodada atual', async () => {
  await comBanco((db) => {
    const { id } = db.abrirRodada({ iniciadaEm: 1700000000000, duracaoSegundos: 300 });
    const atual = db.rodadaAtual();
    assert.equal(atual.id, id);
    assert.equal(atual.duracaoSegundos, 300);
    assert.equal(atual.encerradaEm, null);
  });
});

test('o mesmo evento registrado duas vezes grava uma vez só', async () => {
  /*
   * É a defesa contra o WebSocket que cai e volta. A TikTok reenvia o que
   * não foi confirmado, e sem esta chave o mesmo presente contaria duas
   * vezes — o espectador manda uma rosa e o placar sobe dois.
   *
   * A chave é do BANCO, e não da memória: uma reconexão que reinicia o
   * processo não pode reabrir a porta para os votos que já entraram.
   */
  await comBanco((db) => {
    db.abrirRodada({ iniciadaEm: 1, duracaoSegundos: 300 });
    assert.equal(db.registrarVoto(voto()), true, 'o primeiro voto não foi gravado');
    assert.equal(db.registrarVoto(voto()), false, 'o voto repetido foi gravado de novo');
    assert.equal(db.contagem(1).u1, 1);
  });
});

test('a contagem soma por urna, e não mistura as rodadas', async () => {
  await comBanco((db) => {
    db.abrirRodada({ iniciadaEm: 1, duracaoSegundos: 300 });
    db.registrarVoto(voto({ chave: 'a', urnaId: 'u1', votos: 2 }));
    db.registrarVoto(voto({ chave: 'b', urnaId: 'u2', votos: 1 }));
    db.registrarVoto(voto({ chave: 'c', urnaId: 'u1', votos: 3 }));
    assert.deepEqual(db.contagem(1), { u1: 5, u2: 1 });
  });
});

test('a rodada nova começa do zero, e a antiga continua no banco', async () => {
  await comBanco((db) => {
    const r1 = db.abrirRodada({ iniciadaEm: 1, duracaoSegundos: 300 });
    db.registrarVoto(voto({ rodadaId: r1.id, chave: 'a' }));
    db.encerrarRodada({ id: r1.id, encerradaEm: 2, motivo: 'tempo' });

    const r2 = db.abrirRodada({ iniciadaEm: 3, duracaoSegundos: 300 });
    assert.notEqual(r1.id, r2.id);
    assert.deepEqual(db.contagem(r2.id), {}, 'a rodada nova herdou votos da anterior');
    assert.equal(db.contagem(r1.id).u1, 1, 'a rodada antiga perdeu os votos dela');
  });
});

test('os votos voltam na ordem em que entraram', async () => {
  /*
   * A ordem importa: é com ela que a página recarregada no meio da rodada
   * reconstrói o placar, e um placar reconstruído fora de ordem mostraria a
   * ultrapassagem acontecendo na hora errada.
   */
  await comBanco((db) => {
    db.abrirRodada({ iniciadaEm: 1, duracaoSegundos: 300 });
    db.registrarVoto(voto({ chave: 'a', em: 1000, usuario: 'ana' }));
    db.registrarVoto(voto({ chave: 'b', em: 2000, usuario: 'bia' }));
    db.registrarVoto(voto({ chave: 'c', em: 3000, usuario: 'caio' }));
    assert.deepEqual(db.votosDaRodada(1).map((v) => v.usuario), ['ana', 'bia', 'caio']);
  });
});

test('quem mais presenteou sai em ordem, do maior para o menor', async () => {
  await comBanco((db) => {
    db.abrirRodada({ iniciadaEm: 1, duracaoSegundos: 300 });
    db.registrarVoto(voto({ chave: 'a', usuario: 'ana', votos: 1 }));
    db.registrarVoto(voto({ chave: 'b', usuario: 'bia', votos: 9 }));
    db.registrarVoto(voto({ chave: 'c', usuario: 'ana', votos: 2 }));
    assert.deepEqual(db.apoiadores(1), [
      { usuario: 'bia', votos: 9, presentes: 1 },
      { usuario: 'ana', votos: 3, presentes: 2 },
    ]);
  });
});

test('a rodada sobrevive a fechar e reabrir o banco', async () => {
  // É o caso do servidor reiniciado no meio da live. Se isto não valesse, a
  // reconstrução da página seria uma promessa que só funciona enquanto o
  // processo não cai.
  const pasta = await mkdtemp(join(tmpdir(), 'urna-db-'));
  const caminho = join(pasta, 'votos.db');
  try {
    const db1 = abrirBanco(caminho);
    db1.abrirRodada({ iniciadaEm: 1, duracaoSegundos: 300 });
    db1.registrarVoto(voto({ chave: 'a', votos: 4 }));
    db1.fechar();

    const db2 = abrirBanco(caminho);
    assert.equal(db2.rodadaAtual().id, 1);
    assert.deepEqual(db2.contagem(1), { u1: 4 });
    assert.equal(db2.registrarVoto(voto({ chave: 'a' })), false, 'a chave não sobreviveu ao reinício');
    db2.fechar();
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
});

test('sem rodada aberta o banco não inventa uma', async () => {
  // A página que abre antes da primeira rodada não pode receber um id
  // inventado e gravar votos numa rodada que ninguém começou.
  await comBanco((db) => {
    assert.equal(db.rodadaAtual(), null);
  });
});

test('um erro de gravação não derruba o banco', async () => {
  /*
   * A seção 7 da especificação: falha ao gravar mantém a contagem em
   * memória. Aqui o que se confere é que o banco não deixa o erro escapar
   * como exceção — quem chama recebe `false` e segue contando.
   */
  await comBanco((db) => {
    db.abrirRodada({ iniciadaEm: 1, duracaoSegundos: 300 });
    db.fechar();
    assert.equal(db.registrarVoto(voto()), false, 'gravar com o banco fechado lançou em vez de devolver false');
  });
});
