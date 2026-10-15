import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT_TECLADO, todasAsTeclas, markupTeclado } from '../public/js/urna.js';

test('a grade numérica é 3x3 mais o zero', () => {
  assert.deepEqual(LAYOUT_TECLADO.grade, ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  assert.equal(LAYOUT_TECLADO.zero, '0');
});

test('as três teclas de ação são BRANCO, CORRIGE e CONFIRMA nessa ordem', () => {
  assert.deepEqual(LAYOUT_TECLADO.acoes.map((t) => t.id), ['BRANCO', 'CORRIGE', 'CONFIRMA']);
});

test('CONFIRMA é a única tecla cujo LED acende verde e fica aceso', () => {
  const confirma = LAYOUT_TECLADO.acoes.find((t) => t.id === 'CONFIRMA');
  const branco = LAYOUT_TECLADO.acoes.find((t) => t.id === 'BRANCO');
  assert.equal(confirma.ledPersistente, true);
  assert.equal(branco.ledPersistente, false);
});

test('todasAsTeclas devolve 13 teclas distintas', () => {
  const t = todasAsTeclas();
  assert.equal(t.length, 13);
  assert.equal(new Set(t).size, 13);
});

test('toda tecla declarada no layout existe de fato no markup', () => {
  // A mão mira `data-tecla` para apertar. Uma tecla que o layout declara
  // mas o markup não renderiza vira um alvo fantasma: a coreografia espera
  // o dedo descer e nada acontece, no ar, ao vivo.
  const html = markupTeclado();
  for (const id of todasAsTeclas()) {
    assert.ok(html.includes(`data-tecla="${id}"`), `tecla ${id} não foi renderizada`);
  }
});

test('o zero é uma tecla própria, centralizado sob a grade', () => {
  const html = markupTeclado();
  const zero = /<button[^>]*data-tecla="0"[^>]*>/.exec(html);
  assert.ok(zero, 'a tecla 0 não existe');
  assert.match(zero[0], /tecla--zero/);
});
