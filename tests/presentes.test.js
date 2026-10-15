import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
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
  /*
   * O nome vem de fora — do chat, do TikTok, do painel — e entra no HTML.
   *
   * A asserção é sobre a string CRUA não aparecer, e não sobre a palavra
   * `<img>` não aparecer: o desenho do presente passou a ser um `<img>` de
   * verdade, e a versão anterior deste teste reprovava o próprio desenho
   * enquanto deixava passar o caso que ele existe para pegar.
   */
  const nome = '<img src=x onerror=alert(1)>';
  const html = markupPresente({ nome, numero: '22' });
  assert.ok(!html.includes(nome), 'o nome do presente entrou cru no HTML');
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('cada presente tem o seu desenho, e não um retângulo genérico', () => {
  /*
   * O desenho é o que se reconhece antes de ler. Um quadrado colorido no
   * lugar do desenho obriga a ler a etiqueta, e a etiqueta está lá
   * justamente para quem já reconheceu o presente.
   */
  /*
   * Pelos presentes PADRÃO, e não por dois objetos escritos aqui: o
   * `markupPresente` cai na rosa quando ninguém diz qual é o desenho, então
   * um teste que monta os próprios objetos passa com os dois iguais e não
   * prova nada sobre o que a vitrine mostra.
   */
  const [coracao, rosa] = PRESENTES_PADRAO.map((p) => markupPresente(p));
  assert.match(rosa, /<img[^>]+src="\/img\/rose\.webp"/, 'a rosa ficou sem desenho');
  assert.match(coracao, /<img[^>]+src="\/img\/heart_me\.webp"/,
    'o Heart Me ficou sem desenho');
  assert.notEqual(rosa, coracao, 'os dois presentes estão com o mesmo desenho');
});

test('todo desenho da vitrine aponta para um arquivo que o servidor entrega', () => {
  /*
   * Este teste existe por um erro que passou batido: o `src` foi escrito
   * como `public/img/rose.webp`, relativo à RAIZ DO PROJETO, enquanto o
   * servidor serve a partir de `public/`. O navegador pedia
   * `/public/img/rose.webp`, o servidor procurava `public/public/img/...`,
   * e devolvia 404 — com a página inteira funcionando em volta e nenhum
   * erro no console além da imagem quebrada.
   *
   * São duas coisas, e as duas quebram o desenho em silêncio: o caminho ser
   * absoluto a partir de `/`, e o arquivo existir de verdade.
   */
  for (const presente of PRESENTES_PADRAO) {
    const html = markupPresente(presente);
    const src = html.match(/<img[^>]*\ssrc="([^"]+)"/)?.[1];
    assert.ok(src, `o presente "${presente.nome}" ficou sem desenho`);
    assert.ok(src.startsWith('/'),
      `o desenho de "${presente.nome}" aponta para "${src}", que é relativo: `
      + 'o servidor serve a partir de public/, então o navegador vai pedir /public/... e levar 404');
    assert.ok(existsSync(new URL(`../public${src}`, import.meta.url)),
      `o desenho de "${presente.nome}" aponta para ${src}, que não existe em public/`);
  }
});

test('os presentes padrão cobrem as duas urnas, sem repetir nenhuma', () => {
  const urnas = PRESENTES_PADRAO.map((p) => p.urnaId);
  assert.deepEqual([...urnas].sort(), ['u1', 'u2']);
});
