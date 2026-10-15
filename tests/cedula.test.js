import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markupDaCedula } from '../public/js/urna.js';

test('a cédula traz o nome do usuário e do presente', () => {
  const html = markupDaCedula({ usuario: 'João', presente: 'Rosa', votos: 1, numero: '22' });
  assert.match(html, /João/);
  assert.match(html, /Rosa/);
});

test('a cédula mostra a quantidade quando vale mais de um voto', () => {
  const html = markupDaCedula({ usuario: 'Maria', presente: 'Raro', votos: 10, numero: '13' });
  assert.match(html, /10/);
});

test('a cédula omite a quantidade quando vale um voto só', () => {
  const html = markupDaCedula({ usuario: 'Maria', presente: 'Rosa', votos: 1, numero: '13' });
  assert.ok(!html.includes('votos'), 'não deveria mencionar quantidade para 1 voto');
});

test('a cédula escapa HTML do nome do usuário', () => {
  const html = markupDaCedula({ usuario: '<script>alert(1)</script>', presente: 'Rosa', votos: 1, numero: '22' });
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
});

test('a cédula escapa HTML do nome do presente', () => {
  // O nome do presente vem da configuração do usuário, que é digitada no
  // painel — não é dado de terceiro, mas é a mesma string que vai para o
  // DOM, e a mesma regra vale para as duas.
  const html = markupDaCedula({ usuario: 'Ana', presente: '<img onerror=1>', votos: 1, numero: '22' });
  assert.ok(!html.includes('<img'));
  assert.match(html, /&lt;img/);
});

test('a cédula escapa HTML do número da urna', () => {
  const html = markupDaCedula({ usuario: 'Ana', presente: 'Rosa', votos: 1, numero: '2"><b>' });
  assert.ok(!html.includes('<b>'));
});

test('a cédula sobrevive a dados ausentes', () => {
  // A cédula é montada no meio de uma animação; um campo faltando não pode
  // derrubar a timeline e deixar a mão presa na tela.
  assert.doesNotThrow(() => markupDaCedula({}));
  assert.doesNotThrow(() => markupDaCedula());
});

test('a cédula vale um voto por padrão', () => {
  assert.ok(!markupDaCedula({ usuario: 'Ana', presente: 'Rosa' }).includes('votos'));
});
