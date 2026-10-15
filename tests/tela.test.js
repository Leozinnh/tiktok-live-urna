import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderizarTela } from '../public/js/urna.js';

test('ocioso mostra número, nome e total de votos', () => {
  const html = renderizarTela({ tipo: 'ocioso', numero: '22', nome: 'URNA 1', votos: 61 });
  assert.match(html, /22/);
  assert.match(html, /URNA 1/);
  assert.match(html, /61/);
});

test('digitando mostra os dígitos já digitados, alinhados à direita', () => {
  const html = renderizarTela({ tipo: 'digitando', numeroDigitado: '2', numero: '22', votos: 0 });
  assert.match(html, /tela__digito/);
  assert.match(html, />2</);
});

test('confirmado mostra a mensagem e a contagem', () => {
  const html = renderizarTela({ tipo: 'confirmado', numero: '22', votos: 62, votosAdicionados: 1 });
  assert.match(html, /VOTO CONFIRMADO/);
  assert.match(html, /62/);
});

test('escapa HTML vindo do nome da urna', () => {
  const html = renderizarTela({ tipo: 'ocioso', numero: '22', nome: '<img src=x onerror=alert(1)>', votos: 0 });
  assert.ok(!html.includes('<img'));
  assert.match(html, /&lt;img/);
});

test('estado desconhecido não quebra nem some da tela', () => {
  // Um estado a mais chegando de uma integração futura não pode deixar
  // a tela em branco no meio da live: cai no ocioso.
  const html = renderizarTela({ tipo: 'inexistente', numero: '22', nome: 'URNA 1', votos: 7 });
  assert.match(html, /URNA 1/);
  assert.match(html, /7/);
});

test('o dígito ainda não digitado fica apagado, e o digitado aceso', () => {
  const html = renderizarTela({ tipo: 'digitando', numeroDigitado: '1', numero: '13', votos: 0 });
  const spans = [...html.matchAll(/<span class="tela__digito([^"]*)">([^<]*)<\/span>/g)];
  assert.equal(spans.length, 2);
  assert.match(spans[0][1], /is-preenchido/);
  assert.equal(spans[0][2], '1');
  assert.ok(!spans[1][1].includes('is-preenchido'));
});
