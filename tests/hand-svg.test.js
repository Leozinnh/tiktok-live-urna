import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

/*
 * O markup lido como o PARSER lê, e não como o arquivo escreve.
 *
 * O teste acima — "declara os gradientes de pele" — ficou verde enquanto
 * `unhaGrad` não existia na página: ele procura a string `id="unhaGrad"`, e
 * a string estava lá, dentro de um comentário. Um comentário HTML fechado com
 * o fim de comentário do JS — que é o que a mão digita no automático, num
 * arquivo que monta SVG numa template string — não fecha coisa nenhuma: HTML
 * não aninha comentário, então o parser segue engolindo tudo, elementos
 * inclusive, até o próximo `-->`.
 *
 * Aconteceu quatro vezes neste arquivo. `peleVolume`, `unhaGrad` e
 * `mangaGrad` foram parar dentro de um comentário e nunca chegaram ao DOM, e
 * um `fill="url(#x)"` que não resolve não pinta NADA e não avisa no console:
 * os dedos ficaram sem volume, as unhas sumiram e o antebraço ficou
 * transparente — três defeitos que nenhum teste de texto via.
 */
const semComentarios = (html) => html.replace(/<!--[\s\S]*?-->/g, '');

test('toda referência url(#id) da mão resolve fora de comentário', () => {
  const html = markupDaMao();
  const alvos = [...new Set([...html.matchAll(/url\(#([\w-]+)\)/g)].map((m) => m[1]))];
  assert.ok(alvos.length >= 10, `a mão usa gradientes e recortes; ${alvos.length} alvos é markup vazio`);
  const visivel = semComentarios(html);
  for (const id of alvos) {
    assert.ok(visivel.includes(`id="${id}"`),
      `url(#${id}) não resolve: ou o id não existe, ou está dentro de um comentário`);
  }
});

test('nenhum comentário HTML do markup fecha com */', () => {
  // A causa, e não o efeito: mesmo um comentário que engula só texto tira do
  // ar o que vier depois dele, e o defeito aparece longe daqui.
  for (const [nome, html] of [['mão', markupDaMao()], ['sombra', markupDaSombra()]]) {
    for (const m of html.matchAll(/<!--([\s\S]*?)-->/g)) {
      assert.ok(!m[1].includes('*/'),
        `comentário da ${nome} fechado com */: ele engole o que vier depois até o próximo -->`);
    }
  }
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

/*
 * A etiqueta que nasce e cresce.
 *
 * Ela é pendurada pela borda DIREITA no `--bx`, e o `posicionar` prende o
 * número dentro do palco usando a largura MEDIDA NO NASCIMENTO — a margem de
 * 24px das laterais, menos a largura, mais a largura do palco. O que mede é a
 * conta até o dia em que alguma coisa muda o CONTEÚDO depois de nascer: em
 * 2026-10-16 a etiqueta crescia 41px quando o CONFIRMA trocava o rótulo
 * "votos" por "no placar", com a medida antiga ainda valendo — e saía 17px
 * para fora do enquadramento, na frente da live inteira.
 *
 * Remedir no navegador é barato aqui (uma leitura de layout por voto, e não
 * por quadro); o caro seria medir a cada quadro, e é por isso que o
 * `posicionar` continua só fazendo conta.
 */
const JS_DA_MAO = readFileSync(new URL('../public/js/hand/hand-svg.js', import.meta.url), 'utf8');

test('a etiqueta é remedida quando o rótulo muda no CONFIRMA', () => {
  const confirmar = /confirmarBadge\(\)\s*\{([\s\S]*?)\n    \},/.exec(JS_DA_MAO);
  assert.ok(confirmar, 'confirmarBadge sumiu do hand-svg.js');
  assert.ok(/badgeEl\.offsetWidth/.test(confirmar[1]),
    'confirmarBadge troca o rótulo sem remedir: a etiqueta cresce depois de ' +
    'nascida e o --bx continua valendo a medida antiga');
});

test('a medida do nascimento continua presa no mostrarBadge', () => {
  // O guarda acima verifica a segunda medida; este verifica a primeira. Sem
  // ela, o clamp do posicionar prende com largura zero e a etiqueta encosta
  // em tudo quanto é borda desde o primeiro voto.
  const mostrar = /mostrarBadge\(nome, cor, \{([\s\S]*?)\n    \},/.exec(JS_DA_MAO);
  assert.ok(mostrar, 'mostrarBadge sumiu do hand-svg.js');
  assert.ok(/largura = badgeEl\.offsetWidth/.test(mostrar[1]),
    'mostrarBadge deixou de medir a etiqueta no nascimento');
});
