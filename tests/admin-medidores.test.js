import { test } from 'node:test';
import assert from 'node:assert/strict';
import { medidores, markupMedidores, NOME_DO_MODO } from '../public/js/admin/medidores.js';

/*
 * Os medidores do topo do painel.
 *
 * A queixa que originou isto foi curta: "painel admin ficou muito sei la".
 * O painel tinha tudo o que ele precisa e nada do que ele quer OLHAR: para
 * saber se a live está de pé, quantos votos entraram e quanto falta de
 * rodada, era preciso abrir três abas e ler frases.
 *
 * Daí quatro números grandes no alto, no lugar de onde o operador não
 * precisa sair — e a referência é o painel do projeto dos cavalos, que ele
 * apontou como o certo.
 *
 * O que estes testes prendem é a CONTA, que é a parte que erra em silêncio:
 * um placar que mostra as urnas fora de ordem, uma rodada encerrada que
 * continua contando, um detalhe da fonte que some justamente quando ela cai.
 */

const tally = (urnas, extra = {}) => ({
  urnas: urnas.map(([id, votos, numero]) => ({ id, votos, numero })),
  total: urnas.reduce((s, [, v]) => s + v, 0),
  ...extra,
});

test('sem nada ainda, os medidores mostram zeros e não quebram', () => {
  // O primeiro segundo de vida do painel: o servidor ainda não respondeu.
  // Um `undefined` impresso na tela é o defeito que só aparece na live.
  const lista = medidores({});
  assert.ok(lista.length >= 4, 'faltam medidores');
  const porId = Object.fromEntries(lista.map((m) => [m.id, m]));
  assert.equal(porId.votos.valor, '0');
  assert.equal(porId.rodada.valor, '--:--');
  for (const m of lista) {
    assert.doesNotMatch(String(m.valor), /undefined|NaN|null/, `medidor ${m.id} vazou vazio`);
  }
});

test('o total de votos é o número da rodada', () => {
  const porId = Object.fromEntries(medidores({ tally: tally([['u1', 7], ['u2', 3]]) }).map((m) => [m.id, m]));
  assert.equal(porId.votos.valor, '10');
  assert.match(porId.votos.rotulo, /rodada/i);
});

test('o placar mostra o número da URNA, e não o id dela', () => {
  /*
   * "u1 7 · u2 3" não diz nada a quem está no ar: o que o operador vê na
   * tela são os números 22 e 13, digitados pela mão. É o mesmo motivo pelo
   * qual a etiqueta da vitrine usa o número.
   */
  const porId = Object.fromEntries(medidores({
    tally: tally([['u1', 7, '22'], ['u2', 3, '13']]),
  }).map((m) => [m.id, m]));
  assert.match(porId.placar.valor, /22/);
  assert.match(porId.placar.valor, /13/);
  assert.match(porId.placar.valor, /7/);
  assert.match(porId.placar.valor, /3/);
  assert.doesNotMatch(porId.placar.valor, /u1|u2/, 'mostrou o id interno da urna');
});

test('o placar põe quem está na frente primeiro', () => {
  // Dois números lado a lado não são uma disputa: a ORDEM é a informação.
  const porId = Object.fromEntries(medidores({
    tally: tally([['u1', 2, '22'], ['u2', 9, '13']]),
  }).map((m) => [m.id, m]));
  assert.ok(porId.placar.valor.indexOf('13') < porId.placar.valor.indexOf('22'),
    'a urna com mais votos não veio primeiro');
});

test('a urna sem voto nenhum também aparece', () => {
  // Esconder a urna zerada é o que faz parecer que ela saiu do ar. Com dois
  // candidatos, o zero de um é a informação mais importante do outro.
  const porId = Object.fromEntries(medidores({
    tally: tally([['u1', 4, '22'], ['u2', 0, '13']]),
  }).map((m) => [m.id, m]));
  assert.match(porId.placar.valor, /13/);
  assert.match(porId.placar.valor, /0/);
});

test('a rodada aberta mostra o tempo que falta, em MM:SS', () => {
  const porId = Object.fromEntries(medidores({
    rodada: { estado: 'aberta', restante: 90_000 },
  }).map((m) => [m.id, m]));
  assert.equal(porId.rodada.valor, '01:30');
  assert.match(porId.rodada.rotulo, /aberta/i);
});

test('a rodada encerrada para de contar, e diz que encerrou', () => {
  /*
   * O painel recebe `round.update` a cada segundo enquanto a rodada corre.
   * Depois de encerrada, o servidor manda `restante: 0` — e um painel que
   * continuasse mostrando "00:00" piscando daria a impressão de que ainda
   * falta alguma coisa acontecer.
   */
  const porId = Object.fromEntries(medidores({
    rodada: { estado: 'encerrada', restante: 0 },
  }).map((m) => [m.id, m]));
  assert.equal(porId.rodada.valor, '--:--');
  assert.match(porId.rodada.rotulo, /encerrada/i);
});

test('a fonte conectada fica verde; a caída mostra o motivo em letras', () => {
  /*
   * O motivo é a metade que importa. "TikTok ao vivo" e nada mais é
   * indistinguível de uma fonte que está de pé e não recebe presente — e é
   * exatamente a confusão que este medidor existe para desfazer.
   */
  const conectada = Object.fromEntries(medidores({
    fonte: { modo: 'tiktok', conectado: true, detalhe: 'conectada em @leonardo' },
  }).map((m) => [m.id, m]));
  assert.equal(conectada.fonte.valor, NOME_DO_MODO.tiktok);
  assert.equal(conectada.fonte.tom, 'ok');
  assert.match(conectada.fonte.nota, /conectada em @leonardo/);

  const caida = Object.fromEntries(medidores({
    fonte: { modo: 'tiktok', conectado: false, detalhe: 'não existe usuário @fulano no TikTok' },
  }).map((m) => [m.id, m]));
  assert.equal(caida.fonte.tom, 'off');
  assert.match(caida.fonte.nota, /não existe usuário @fulano no TikTok/,
    'sumiu com o motivo de a fonte não ter conectado');
});

test('o modo do simulador não se confunde com a live', () => {
  const porId = Object.fromEntries(medidores({
    fonte: { modo: 'simulador', conectado: true, detalhe: 'pronto' },
  }).map((m) => [m.id, m]));
  assert.equal(porId.fonte.valor, NOME_DO_MODO.simulador);
  assert.notEqual(NOME_DO_MODO.simulador, NOME_DO_MODO.tiktok);
});

test('o markup desenha cada medidor com o valor, o rótulo e o tom', () => {
  const html = markupMedidores(medidores({
    tally: tally([['u1', 5, '22']]),
    fonte: { modo: 'tiktok', conectado: true, detalhe: 'conectada' },
    rodada: { estado: 'aberta', restante: 60_000 },
  }));
  assert.match(html, /medidor__valor/);
  assert.match(html, /medidor__rotulo/);
  assert.match(html, /data-medidor="votos"/);
  assert.match(html, /data-medidor="placar"/);
  assert.match(html, /data-medidor="fonte"/);
  assert.match(html, /data-medidor="rodada"/);
  assert.match(html, /data-tom="ok"/, 'perdeu o tom da fonte conectada');
});

test('o detalhe da fonte é uma entrada de estranho e sai escapado', () => {
  // O detalhe pode trazer o nome do usuário do TikTok — que é escolhido por
  // outra pessoa. É a mesma regra do painel da tela do ar.
  const html = markupMedidores(medidores({
    fonte: { modo: 'tiktok', conectado: false, detalhe: '<img src=x onerror=alert(1)>' },
  }));
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});

test('medidor sem nota não deixa a marca da nota no HTML', () => {
  // Uma `<span class="medidor__nota"></span>` vazia em cada medidor é lixo
  // que o CSS acaba obrigado a esconder.
  const html = markupMedidores([{ id: 'x', valor: '1', rotulo: 'Um' }]);
  assert.doesNotMatch(html, /medidor__nota/);
});
