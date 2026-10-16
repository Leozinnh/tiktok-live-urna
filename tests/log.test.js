import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { criarLog } from '../server/log.js';

/*
 * O log da live.
 *
 * Ele existe por uma pergunta que o Leonardo fez depois de mandar um presente
 * pelo painel e não ouvir nada: "por que não falou nada?". Sem log, a resposta
 * morria com o terminal — e a live seguinte repetia o mistério.
 *
 * O formato é o do `tiktok-live-horse`, que é o projeto irmão e o que ele já
 * sabe ler: hora, nível, assunto, mensagem. Os níveis ficam em português
 * porque é assim que o resto deste projeto fala com ele.
 *
 * O console é o destino principal — é onde ele está olhando. O arquivo é o
 * que sobra depois que a tela rola: uma live inteira cabe num arquivo, e é
 * nele que se procura o que aconteceu às 21h de ontem.
 */

/** Um console de mentira, do tamanho exato do que o log usa. */
function consoleFalso() {
  const linhas = { log: [], warn: [], error: [] };
  return {
    linhas,
    log: (t) => linhas.log.push(t),
    warn: (t) => linhas.warn.push(t),
    error: (t) => linhas.error.push(t),
  };
}

const as = (h, m, s) => () => new Date(2026, 9, 15, h, m, s);

test('a linha tem hora, nível, assunto e mensagem', () => {
  const saida = consoleFalso();
  const log = criarLog({ saida, agora: as(21, 4, 9) });
  log.info('hub', '🎁 Ana mandou Rosa');
  assert.equal(saida.linhas.log[0], '21:04:09 [INFO] hub: 🎁 Ana mandou Rosa');
});

test('o aviso e o erro saem marcados, e no canal certo', () => {
  // O canal importa: é o que faz o terminal pintar a linha de amarelo ou de
  // vermelho, e é o que o Leonardo enxerga de longe no meio da live.
  const saida = consoleFalso();
  const log = criarLog({ saida, agora: as(21, 4, 9) });
  log.aviso('voz', 'fila cheia: "Bem-vindo, Ana!" ficou sem voz');
  log.erro('tiktok', 'a ponte caiu');
  assert.equal(saida.linhas.warn[0], '21:04:09 [AVISO] voz: fila cheia: "Bem-vindo, Ana!" ficou sem voz');
  assert.equal(saida.linhas.error[0], '21:04:09 [ERRO] tiktok: a ponte caiu');
});

test('a mesma linha que sai no console é a que vai para o arquivo do dia', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'urna-log-'));
  const saida = consoleFalso();
  const log = criarLog({ pasta, saida, agora: as(21, 4, 9) });
  log.info('voto', '✅ Rosa → Lula (Painel)');
  const arquivo = join(pasta, '2026-10-15.log');
  assert.equal(readFileSync(arquivo, 'utf8'), '21:04:09 [INFO] voto: ✅ Rosa → Lula (Painel)\n');
  assert.equal(saida.linhas.log[0], '21:04:09 [INFO] voto: ✅ Rosa → Lula (Painel)');
});

test('o log não apaga o que já estava no arquivo, e a linha nova entra embaixo', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'urna-log-'));
  const log = criarLog({ pasta, saida: consoleFalso(), agora: as(21, 0, 0) });
  log.info('hub', 'primeira');
  log.info('hub', 'segunda');
  const texto = readFileSync(join(pasta, '2026-10-15.log'), 'utf8');
  assert.equal(texto, '21:00:00 [INFO] hub: primeira\n21:00:00 [INFO] hub: segunda\n');
});

test('o arquivo é o do dia, e a virada do dia abre outro', () => {
  // Uma live que começa 23h e acaba 1h tem que estar partida em dois arquivos,
  // e não empilhada no primeiro: é a data do nome que diz onde procurar.
  const pasta = mkdtempSync(join(tmpdir(), 'urna-log-'));
  let quando = new Date(2026, 9, 15, 23, 59, 0);
  const log = criarLog({ pasta, saida: consoleFalso(), agora: () => quando });
  log.info('hub', 'antes da meia-noite');
  quando = new Date(2026, 9, 16, 0, 1, 0);
  log.info('hub', 'depois da meia-noite');
  const arquivos = readdirSync(pasta).sort();
  assert.deepEqual(arquivos, ['2026-10-15.log', '2026-10-16.log']);
  assert.match(readFileSync(join(pasta, '2026-10-15.log'), 'utf8'), /antes da meia-noite/);
  assert.match(readFileSync(join(pasta, '2026-10-16.log'), 'utf8'), /depois da meia-noite/);
});

test('a pasta que não existe é criada', () => {
  const pasta = join(mkdtempSync(join(tmpdir(), 'urna-log-')), 'logs', 'da-live');
  const log = criarLog({ pasta, saida: consoleFalso(), agora: as(9, 0, 0) });
  log.info('hub', 'oi');
  assert.match(readFileSync(join(pasta, '2026-10-15.log'), 'utf8'), /oi/);
});

test('um arquivo que não dá para escrever não derruba a live', () => {
  /*
   * A regra da seção 7 vale para o log como vale para o áudio: a live não para
   * por causa de um acessório. Disco cheio, pasta apagada no meio da noite,
   * antivírus segurando o arquivo — o console continua contando a história, e
   * o aviso sai UMA vez, e não a cada linha.
   */
  const raiz = mkdtempSync(join(tmpdir(), 'urna-log-'));
  const arquivoNoLugarDaPasta = join(raiz, 'nao-sou-pasta');
  writeFileSync(arquivoNoLugarDaPasta, 'arquivo comum');
  const saida = consoleFalso();
  const log = criarLog({ pasta: arquivoNoLugarDaPasta, saida, agora: as(9, 0, 0) });
  log.info('hub', 'primeira');
  log.info('hub', 'segunda');
  assert.equal(saida.linhas.log.length, 2, 'a linha deixou de sair no console');
  assert.equal(saida.linhas.warn.length, 1, 'o aviso saiu mais de uma vez');
  assert.match(saida.linhas.warn[0], /log/);
});

test('sem pasta, o log é só console — e é isso que a suíte usa', () => {
  const saida = consoleFalso();
  const log = criarLog({ saida, agora: as(9, 0, 0) });
  log.info('hub', 'sem arquivo');
  assert.equal(saida.linhas.log[0], '09:00:00 [INFO] hub: sem arquivo');
});
