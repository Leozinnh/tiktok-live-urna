import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markupPresente, PRESENTES_PADRAO } from '../public/js/presentes.js';

/*
 * Os dois presentes na vitrine embaixo da mesa.
 *
 * Eles são a legenda da votação: dizem, sem ninguém precisar explicar, que
 * mandar aquele presente vale um voto naquela urna. Sem eles, quem chega na
 * live vê duas urnas e não sabe o que fazer para votar.
 */
test('o presente diz o nome do presente e o número da urna', () => {
  const html = markupPresente({ nome: 'Rosa', numero: '13', cor: '#e02020' });
  assert.match(html, /Rosa/);
  assert.match(html, /13/);
  assert.match(html, /votar/i);
});

test('a cor da urna entra na etiqueta, e não fica fixa em código', () => {
  // A etiqueta é o que liga o presente à urna. Com a cor fixa, a Rosa
  // apareceria com a cor da outra urna e a legenda ensinaria errado.
  const html = markupPresente({ nome: 'Rosa', numero: '13', cor: '#e02020' });
  assert.match(html, /--cor-urna:\s*#e02020/);
});

test('o nome do presente vem da configuração e é escapado', () => {
  const html = markupPresente({ nome: '<img src=x onerror=alert(1)>', numero: '22' });
  assert.ok(!html.includes('<img'), 'o nome do presente entrou cru no HTML');
  assert.match(html, /&lt;img/);
});

test('cada presente tem o seu desenho, e não um retângulo genérico', () => {
  /*
   * O desenho é o que se reconhece antes de ler. Um quadrado colorido no
   * lugar do desenho obriga a ler a etiqueta, e a etiqueta está lá
   * justamente para quem já reconheceu o presente.
   */
  const rosa = markupPresente({ nome: 'Rosa', numero: '13' });
  const joinha = markupPresente({ nome: 'Joinha', numero: '22' });
  assert.match(rosa, /<svg/, 'a rosa ficou sem desenho');
  assert.match(joinha, /<svg/, 'o joinha ficou sem desenho');
  assert.notEqual(rosa, joinha, 'os dois presentes estão com o mesmo desenho');
});

test('os presentes padrão cobrem as duas urnas, sem repetir nenhuma', () => {
  const urnas = PRESENTES_PADRAO.map((p) => p.urnaId);
  assert.deepEqual([...urnas].sort(), ['u1', 'u2']);
});
