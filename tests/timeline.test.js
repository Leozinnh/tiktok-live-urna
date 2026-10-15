import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timeline, Ticker, PoolDeTimelines, DELTA_MAXIMO_MS } from '../public/js/anim/timeline.js';

/**
 * Avança em passos de um frame real.
 *
 * Um tick com delta enorme é justamente o caso da aba em segundo plano,
 * que a timeline limita de propósito. Testar o percurso normal com um
 * tick único de 500ms testaria o limitador, não o percurso.
 */
function avancar(t, total, passo = 50) {
  let restante = total;
  while (restante > 0) {
    const d = Math.min(passo, restante);
    t.tick(d);
    restante -= d;
  }
}

test('anima de um valor a outro ao longo da duração', () => {
  const t = new Timeline();
  const vistos = [];
  t.add('mover', { at: 0, dur: 1000, from: 0, to: 100, onUpdate: (v) => vistos.push(v) });
  t.play();

  avancar(t, 500);
  assert.equal(vistos.at(-1), 50);

  avancar(t, 500);
  assert.equal(vistos.at(-1), 100);
  assert.ok(t.concluida);
});

test('respeita o atraso (at) antes de começar', () => {
  const t = new Timeline();
  const vistos = [];
  t.add('depois', { at: 300, dur: 100, from: 0, to: 10, onUpdate: (v) => vistos.push(v) });
  t.play();

  avancar(t, 200);
  assert.equal(vistos.length, 0, 'não deveria ter começado ainda');

  avancar(t, 150);
  assert.ok(vistos.length > 0, 'deveria ter começado');
});

test('dispara onStart e onComplete exatamente uma vez', () => {
  const t = new Timeline();
  let inicios = 0;
  let fins = 0;
  t.add('x', { at: 0, dur: 100, onStart: () => inicios++, onComplete: () => fins++ });
  t.play();

  avancar(t, 200);
  assert.equal(inicios, 1);
  assert.equal(fins, 1);
});

test('chamar() executa no instante marcado, uma vez só', () => {
  const t = new Timeline();
  const marcos = [];
  t.chamar('a', { at: 200, fn: () => marcos.push('a') });
  t.chamar('b', { at: 400, fn: () => marcos.push('b') });
  t.play();

  avancar(t, 300);
  assert.deepEqual(marcos, ['a']);
  avancar(t, 200);
  assert.deepEqual(marcos, ['a', 'b']);
});

test('a duração é o fim do último item', () => {
  const t = new Timeline();
  t.add('a', { at: 0, dur: 500 });
  t.add('b', { at: 200, dur: 900 });
  assert.equal(t.duracao, 1100);
});

test('velocidade 2x percorre a timeline na metade do tempo', () => {
  const lenta = new Timeline();
  lenta.add('a', { at: 0, dur: 1000, from: 0, to: 100, onUpdate: () => {} });
  lenta.play();
  avancar(lenta, 500);
  assert.ok(!lenta.concluida, 'a 1x, 500ms não bastam para 1000ms');

  const rapida = new Timeline();
  const vistos = [];
  rapida.add('a', { at: 0, dur: 1000, from: 0, to: 100, onUpdate: (v) => vistos.push(v) });
  rapida.play();
  rapida.setVelocidade(2);

  avancar(rapida, 500);
  assert.equal(vistos.at(-1), 100);
  assert.ok(rapida.concluida);
});

test('um delta gigante avança no máximo um passo curto (aba em segundo plano)', () => {
  const t = new Timeline();
  const vistos = [];
  t.add('a', { at: 0, dur: 1000, from: 0, to: 100, onUpdate: (v) => vistos.push(v) });
  t.play();

  // Aba ficou 3 minutos em segundo plano e volta com um delta enorme.
  t.tick(180_000);

  assert.ok(vistos.at(-1) <= 40, `avançou demais: ${vistos.at(-1)}`);
  assert.ok(!t.concluida, 'não deveria ter saltado para o fim');
});

test('o limite do delta é o que o teste acima afirma', () => {
  const t = new Timeline();
  const vistos = [];
  t.add('a', { at: 0, dur: DELTA_MAXIMO_MS * 10, from: 0, to: 100, onUpdate: (v) => vistos.push(v) });
  t.play();
  t.tick(1e9);
  assert.equal(vistos.at(-1), 10, 'um tick não pode avançar mais que DELTA_MAXIMO_MS');
});

test('cancelar para a timeline e não dispara onComplete', () => {
  const t = new Timeline();
  let fim = 0;
  t.add('a', { at: 0, dur: 1000, onComplete: () => fim++ });
  t.play();
  avancar(t, 100);
  t.cancelar();
  t.tick(2000);
  assert.equal(fim, 0);
  assert.ok(t.cancelada);
});

test('uma exceção em onUpdate não impede os outros itens de rodar', () => {
  const t = new Timeline();
  const marcos = [];
  const original = console.error;
  console.error = () => {};
  try {
    t.add('ruim', { at: 0, dur: 100, onUpdate: () => { throw new Error('boom'); } });
    t.add('bom',  { at: 0, dur: 100, onComplete: () => marcos.push('bom') });
    t.play();
    avancar(t, 200);
  } finally {
    console.error = original;
  }
  assert.deepEqual(marcos, ['bom']);
});

test('reset devolve a timeline limpa para o pool', () => {
  const t = new Timeline();
  t.add('a', { at: 0, dur: 100, from: 0, to: 1, onUpdate: () => {} });
  t.play();
  avancar(t, 200);
  t.reset();

  assert.equal(t.duracao, 0);
  assert.equal(t.concluida, false);
  assert.equal(t.cancelada, false);
});

test('o pool reaproveita instâncias em vez de criar novas', () => {
  const pool = new PoolDeTimelines({ max: 2 });
  const a = pool.obter();
  pool.devolver(a);
  assert.equal(pool.obter(), a);
});

test('o pool não cresce sem limite', () => {
  const pool = new PoolDeTimelines({ max: 2 });
  const itens = [pool.obter(), pool.obter(), pool.obter()];
  for (const i of itens) pool.devolver(i);
  assert.equal(pool.tamanho, 2);
});

test('passos por frame recebem o delta e sobrevivem a uma exceção', () => {
  const ticker = new Ticker({ raf: () => {}, agora: () => 0 });
  const vistos = [];
  const original = console.error;
  console.error = () => {};
  try {
    ticker.registrarPasso(() => { throw new Error('boom'); });
    ticker.registrarPasso((d) => vistos.push(d));
    ticker.avancar(16);
  } finally {
    console.error = original;
  }

  assert.deepEqual(vistos, [16], 'o segundo passo deveria ter rodado mesmo com o primeiro falhando');
});

test('timelines concluídas saem do ticker sozinhas', () => {
  const ticker = new Ticker({ raf: () => {}, agora: () => 0 });
  const t = new Timeline();
  t.add('a', { at: 0, dur: 100 });
  t.play();
  ticker.registrar(t);

  ticker.avancar(50);
  assert.equal(ticker.timelines.size, 1, 'ainda está rodando');
  ticker.avancar(60);
  assert.equal(ticker.timelines.size, 0, 'deveria ter saído sozinha');
});

test('o ticker não duplica passo registrado duas vezes', () => {
  const ticker = new Ticker({ raf: () => {}, agora: () => 0 });
  let contagem = 0;
  const fn = () => contagem++;
  ticker.registrarPasso(fn);
  ticker.registrarPasso(fn);
  ticker.avancar(16);
  assert.equal(contagem, 1);
});
