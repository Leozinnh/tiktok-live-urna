import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/*
 * O comentário que engole o desenho.
 *
 * Quase todo markup desta cena nasce dentro de uma template string em JS, e
 * ali os dois comentários convivem: o de bloco do JavaScript e o do HTML.
 * Trocar o fim de um pelo do outro é o erro que se escreve sozinho — a
 * barra-asterisco é o fim de comentário que a mão digita no automático.
 *
 * O estrago é grande e é mudo. O HTML não aninha comentário: um `<!--` fecha
 * no PRIMEIRO `-->` que aparecer, então um comentário fechado com o fim de
 * comentário do JS engole todo o markup seguinte — elementos incluídos — até
 * o próximo `-->`. Nada
 * disso dá erro: um `<linearGradient>` que não existe faz o
 * `fill="url(#aqueleGradiente)"` não pintar NADA, sem uma linha no console.
 *
 * Foi assim, em public/js/hand/hand-svg.js, que `peleVolume`, `unhaGrad` e
 * `mangaGrad` passaram a não existir: os dedos ficaram sem volume, as unhas
 * sumiram e o antebraço ficou transparente, com os testes de texto todos
 * verdes — porque um teste que lê markup como texto não vê o que o parser
 * joga fora (ver o teste irmão em hand-svg.test.js, que lê o markup da mão
 * como o parser lê).
 *
 * Por isso esta varredura é na FONTE e não no markup montado: pega o defeito
 * em qualquer um dos módulos, antes de ele virar desenho.
 */
const arquivosJs = (dir) => readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? arquivosJs(join(dir, e.name)) : [join(dir, e.name)]))
  .filter((f) => f.endsWith('.js'));

test('nenhum módulo fecha comentário HTML com */', () => {
  const quebrados = [];
  for (const arquivo of arquivosJs('public/js')) {
    const fonte = readFileSync(arquivo, 'utf8');
    for (const m of fonte.matchAll(/<!--([\s\S]*?)-->/g)) {
      if (!m[1].includes('*/')) continue;
      const linha = fonte.slice(0, m.index).split('\n').length;
      quebrados.push(`${arquivo}:${linha}`);
    }
  }
  assert.deepEqual(quebrados, [],
    'comentário HTML fechado com */ engole o markup seguinte até o próximo -->; feche com -->');
});

/*
 * O outro lado da mesma moeda: um `<!--` sem `-->` nenhum depois. Não é o
 * defeito que aconteceu, mas é a mesma família — e este, ao contrário do
 * outro, engole o resto do arquivo em silêncio.
 */
test('todo comentário HTML aberto na fonte tem um --> depois', () => {
  const semFim = [];
  for (const arquivo of arquivosJs('public/js')) {
    const fonte = readFileSync(arquivo, 'utf8');
    for (const m of fonte.matchAll(/<!--/g)) {
      if (fonte.indexOf('-->', m.index) < 0) {
        semFim.push(`${arquivo}:${fonte.slice(0, m.index).split('\n').length}`);
      }
    }
  }
  assert.deepEqual(semFim, [], 'comentário HTML aberto sem --> engole o resto do arquivo');
});
