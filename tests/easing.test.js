import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverEasing, linear, easeInOutCubic, easeOutBack, EASINGS } from '../public/js/anim/easing.js';

test('toda easing começa em 0 e termina em 1', () => {
  // Tolerância de propósito: a forma polinomial de easeOutBack deixa um
  // resíduo de 2.2e-16 no início. É zero para qualquer efeito prático, e
  // apertar o endpoint exigiria um caso especial dentro da função pura.
  for (const [nome, fn] of Object.entries(EASINGS)) {
    assert.ok(Math.abs(fn(0) - 0) < 1e-9, `${nome} não começa em 0: ${fn(0)}`);
    assert.ok(Math.abs(fn(1) - 1) < 1e-9, `${nome} não termina em 1: ${fn(1)}`);
  }
});

test('linear é a identidade', () => {
  assert.equal(linear(0.37), 0.37);
});

test('easeInOutCubic é simétrica em torno do meio', () => {
  assert.equal(easeInOutCubic(0.5), 0.5);
  assert.ok(Math.abs(easeInOutCubic(0.25) + easeInOutCubic(0.75) - 1) < 1e-9);
});

test('easeOutBack ultrapassa 1 no meio do caminho', () => {
  assert.ok(easeOutBack(0.7) > 1, 'deveria passar de 1 para dar o efeito de "estalo"');
});

test('resolve uma easing por nome', () => {
  // Compara valores, não referência: resolverEasing devolve um envoltório
  // que limita o t a 0..1, então nunca é a mesma função do mapa.
  assert.equal(resolverEasing('linear')(0.37), linear(0.37));
  assert.equal(resolverEasing('in-out-cubic')(0.25), easeInOutCubic(0.25));
  assert.equal(resolverEasing('out-back')(0.7), easeOutBack(0.7));
});

test('resolve uma easing passada como função', () => {
  const quadrado = (t) => t * t;
  assert.equal(resolverEasing(quadrado)(0.5), 0.25);
});

test('nome desconhecido cai em linear em vez de quebrar', () => {
  assert.equal(resolverEasing('nao-existe')(0.37), 0.37);
  assert.equal(resolverEasing(undefined)(0.6), 0.6);
  assert.equal(resolverEasing(null)(0.6), 0.6);
});

test('rejeita valores fora de 0..1', () => {
  assert.equal(resolverEasing('linear')(-0.5), 0);
  assert.equal(resolverEasing('linear')(1.5), 1);
  assert.equal(resolverEasing((t) => t)(-3), 0);
  assert.equal(resolverEasing((t) => t)(99), 1);
});

test('o envoltório limita antes de chamar a easing, não depois', () => {
  // Com easeOutElastic, limitar depois não serve: a função já teria
  // oscilado para fora do intervalo e o resultado seria outro.
  const visivel = [];
  const espia = (t) => { visivel.push(t); return t; };
  resolverEasing(espia)(-0.2);
  resolverEasing(espia)(1.7);
  assert.deepEqual(visivel, [0, 1]);
});
