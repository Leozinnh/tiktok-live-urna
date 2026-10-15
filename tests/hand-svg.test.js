import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MARCA_DE_JUNTA, markupDaMao, markupDaSombra, PIVOS } from '../public/js/hand/hand-svg.js';
import { JUNTAS } from '../public/js/hand/poses.js';

test('o markup da mão contém um grupo para cada junta', () => {
  const html = markupDaMao();
  for (const junta of JUNTAS) {
    assert.ok(html.includes(`data-junta="${junta}"`), `falta o grupo da junta ${junta}`);
  }
});

test('o markup da mão não usa emoji', () => {
  const html = markupDaMao();
  assert.ok(!/\p{Extended_Pictographic}/u.test(html), 'a mão não pode conter emoji');
});

test('o markup declara os gradientes de pele', () => {
  const html = markupDaMao();
  for (const id of ['peleBase', 'peleSombra', 'peleLuz', 'unhaGrad']) {
    assert.ok(html.includes(`id="${id}"`), `falta o gradiente ${id}`);
  }
});

test('o markup declara o filtro de textura de pele', () => {
  assert.ok(markupDaMao().includes('id="texturaPele"'));
});

test('a sombra projetada é um elemento separado da mão', () => {
  const sombra = markupDaSombra();
  assert.ok(sombra.includes('data-sombra'));
  assert.ok(!sombra.includes('data-junta'), 'a sombra não tem juntas');
});

test('MARCA_DE_JUNTA segue o padrão data-junta', () => {
  assert.equal(MARCA_DE_JUNTA('pipIndicador'), 'data-junta="pipIndicador"');
});

test('o pivô de cada junta vai escrito no próprio markup', () => {
  // Um pivô declarado no CSS e outro desenhado no SVG saem de sincronia
  // no primeiro ajuste de desenho, e o dedo passa a deslizar em vez de
  // dobrar. Escrever a origem junto do grupo torna isso impossível.
  const html = markupDaMao();
  for (const junta of JUNTAS) {
    const esperado = `transform-origin: ${PIVOS[junta].x}px ${PIVOS[junta].y}px`;
    const grupo = new RegExp(`<g[^>]*data-junta="${junta}"[^>]*>`).exec(html);
    assert.ok(grupo, `falta o grupo da junta ${junta}`);
    assert.ok(grupo[0].includes(esperado),
      `o grupo ${junta} não declara "${esperado}": ${grupo[0]}`);
  }
});

test('PIVOS cobre exatamente as juntas conhecidas', () => {
  assert.deepEqual(Object.keys(PIVOS).sort(), [...JUNTAS].sort());
});

/*
 * A checagem de que os dedos nascem da palma vive em mao-geometria.test.js,
 * contra a geometria real da palma (PALMA). A versão que existia aqui
 * comparava com uma faixa de y escrita à mão, e por isso continuava verde
 * enquanto o desenho mudava por baixo — foi uma das que deixaram passar a
 * mão desmanchada.
 */
test('as juntas de um dedo descem na ordem nó, pip, dip', () => {
  for (const nome of ['Indicador', 'Medio', 'Anel', 'Mindinho']) {
    const mcp = PIVOS[`mcp${nome}`];
    assert.ok(PIVOS[`pip${nome}`].y < mcp.y, `pip${nome} deveria estar acima do nó`);
    assert.ok(PIVOS[`dip${nome}`].y < PIVOS[`pip${nome}`].y, `dip${nome} deveria estar acima da pip`);
  }
});

test('cada falange tem comprimento positivo', () => {
  for (const nome of ['Indicador', 'Medio', 'Anel', 'Mindinho']) {
    const alturas = [
      PIVOS[`mcp${nome}`].y - PIVOS[`pip${nome}`].y,
      PIVOS[`pip${nome}`].y - PIVOS[`dip${nome}`].y,
    ];
    for (const h of alturas) assert.ok(h > 20, `falange curta demais em ${nome}: ${h}`);
  }
});

test('as falanges têm preenchimento de pele declarado', () => {
  // Sem fill, um path SVG é preto sólido: os quatro dedos apareceriam
  // como tarjas pretas sobre a palma.
  const html = markupDaMao();
  const falanges = [...html.matchAll(/<path class="falange"[^>]*>/g)];
  assert.ok(falanges.length >= 14, `poucas falanges: ${falanges.length}`);
  for (const [tag] of falanges) {
    assert.ok(tag.includes('fill="url(#peleBase)"'), `falange sem pele: ${tag}`);
  }
});
