import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duracaoDaRodada, DURACAO_PADRAO } from '../public/js/config.js';

/*
 * A duração da rodada, lida da configuração.
 *
 * É a única regra da configuração que vira TEMPO na tela: o cronômetro do
 * placar conta para baixo a partir dela. Um valor que não serve — zero,
 * negativo, texto, ausente — não pode virar um cronômetro que já nasce
 * zerado, porque "0:00" no ar diz que a votação acabou quando ela está
 * aberta.
 */

test('a duração sai da configuração, em segundos', () => {
  assert.equal(duracaoDaRodada({ rodada: { duracaoSegundos: 600 } }), 600);
  assert.equal(duracaoDaRodada({ rodada: { duracaoSegundos: 90.7 } }), 90,
    'o cronômetro desenha segundos inteiros');
});

test('sem configuração, vale o padrão', () => {
  assert.equal(duracaoDaRodada(null), DURACAO_PADRAO);
  assert.equal(duracaoDaRodada(undefined), DURACAO_PADRAO);
  assert.equal(duracaoDaRodada({}), DURACAO_PADRAO);
  assert.equal(duracaoDaRodada({ rodada: {} }), DURACAO_PADRAO);
  assert.equal(duracaoDaRodada({ rodada: { duracaoSegundos: '10 minutos' } }), DURACAO_PADRAO);
});

test('uma duração que não serve não zera o cronômetro', () => {
  // O caso que este teste existe para prender: o painel grava `0` — ou o
  // arquivo é editado à mão com um número torto — e o cronômetro do ar
  // começa em 0:00. Para quem assiste, isso é "a votação acabou", e a
  // votação está aberta.
  assert.equal(duracaoDaRodada({ rodada: { duracaoSegundos: 0 } }), DURACAO_PADRAO);
  assert.equal(duracaoDaRodada({ rodada: { duracaoSegundos: -300 } }), DURACAO_PADRAO);
  assert.equal(duracaoDaRodada({ rodada: { duracaoSegundos: null } }), DURACAO_PADRAO);
  assert.equal(duracaoDaRodada({ rodada: { duracaoSegundos: NaN } }), DURACAO_PADRAO);
  assert.equal(duracaoDaRodada({ rodada: { duracaoSegundos: Infinity } }), DURACAO_PADRAO);
});

test('uma duração absurda é limitada, e não recusada', () => {
  /*
   * Uma live de três horas de votação não é impossível — e recusar o número
   * do Leonardo para pôr cinco minutos no lugar seria pior do que aceitar.
   * O teto é do que a TELA aguenta: acima de 24 horas o cronômetro vira um
   * número que ninguém lê, e isso é quase sempre um zero a mais digitado.
   */
  assert.equal(duracaoDaRodada({ rodada: { duracaoSegundos: 7200 } }), 7200);
  assert.equal(duracaoDaRodada({ rodada: { duracaoSegundos: 999999 } }), DURACAO_PADRAO);
});
