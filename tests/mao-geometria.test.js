/*
 * Invariantes da geometria da mão.
 *
 * Estes testes existem por um motivo específico: a mão passou catorze
 * tarefas com a suíte inteira verde e mesmo assim apareceu na tela como
 * uma massa de pastilhas soltas. Os testes que havia checavam que cada
 * pivô *existia* e que cada junta *tinha* um grupo — nunca que o pivô
 * caía sobre a junta desenhada, nem que uma falange começava onde a
 * anterior terminava. Um pivô no lugar errado não quebra nada: só faz o
 * dedo girar em volta de um ponto no ar.
 *
 * Por isso aqui a asserção é sobre o MARKUP, não sobre a tabela que o
 * gera. Conferir a tabela contra ela mesma seria tautologia.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { markupDaMao, PIVOS, PONTAS, PONTA, ANCORA, OSSOS, DEDOS, PALMA } from '../public/js/hand/hand-svg.js';

/** Lê os atributos de posição que o markup declara em cada falange. */
function ossosDoMarkup(html) {
  // `.*?` até `/>` e não `[^>]*`: o nome do osso é "mcpIndicador>pipIndicador"
  // e o `>` do meio fecharia a tag na hora errada.
  const tag = /<path class="falange".*?\/>/gs;
  const pontos = (s) => {
    const m = /(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(s ?? '');
    return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
  };
  return [...html.matchAll(tag)].map(([t]) => ({
    tag: t,
    nome: /data-osso="([^"]+)"/.exec(t)?.[1] ?? null,
    de: pontos(/data-de="([^"]+)"/.exec(t)?.[1]),
    ate: pontos(/data-ate="([^"]+)"/.exec(t)?.[1]),
  }));
}

test('toda falange declara onde começa e onde termina', () => {
  const ossos = ossosDoMarkup(markupDaMao());
  assert.ok(ossos.length >= 14, `poucas falanges: ${ossos.length}`);
  for (const o of ossos) {
    assert.ok(o.nome, `falange sem data-osso: ${o.tag}`);
    assert.ok(o.de, `falange ${o.nome} não declara data-de`);
    assert.ok(o.ate, `falange ${o.nome} não declara data-ate`);
  }
});

test('a ponta de uma falange é a raiz da seguinte', () => {
  /*
   * É o defeito que apareceu na tela: as falanges de um dedo estavam
   * desenhadas em pontos que não se tocavam, e o dedo virou uma pilha de
   * pastilhas flutuando sobre a palma.
   */
  const ossos = ossosDoMarkup(markupDaMao());
  const porNome = new Map(ossos.map((o) => [o.nome, o]));
  const encadeados = ossos.filter((o) => /^pip/.test(o.nome));

  assert.ok(encadeados.length >= 4, 'esperava ao menos uma cadeia por dedo');
  for (const filho of encadeados) {
    const pai = [...porNome.values()].find((o) => o.ate
      && Math.hypot(o.ate.x - filho.de.x, o.ate.y - filho.de.y) < 0.01
      && o.nome !== filho.nome);
    assert.ok(pai,
      `${filho.nome} começa em (${filho.de.x},${filho.de.y}) e nenhuma falange termina aí`);
  }
});

test('o pivô de cada falange é onde ela é desenhada', () => {
  /*
   * O `transform-origin` do grupo e o início da falange saem da mesma
   * tabela PIVOS. Se divergirem, o dedo gira em volta de um ponto no ar
   * — que foi exatamente o que os círculos de diagnóstico mostraram.
   */
  const html = markupDaMao();
  const ossos = ossosDoMarkup(html);
  for (const o of ossos) {
    const junta = o.nome.split('>')[0];
    const pivo = PIVOS[junta];
    assert.ok(pivo, `não há pivô declarado para ${junta}`);
    assert.ok(Math.hypot(pivo.x - o.de.x, pivo.y - o.de.y) < 0.01,
      `${junta}: pivô em (${pivo.x},${pivo.y}) mas a falange começa em (${o.de.x},${o.de.y})`);

    const grupo = new RegExp(`<g[^>]*data-junta="${junta}"[^>]*>`).exec(html);
    assert.ok(grupo[0].includes(`transform-origin: ${pivo.x}px ${pivo.y}px`),
      `${junta} não gira em torno do próprio pivô`);
  }
});

test('os dedos não se sobrepõem na linha dos nós', () => {
  /*
   * Com os quatro dedos empilhados no mesmo intervalo de x, cada
   * falange cobre a vizinha e o resultado lê como uma massa só. Aqui a
   * checagem é de vizinhança: a borda direita de um dedo não passa da
   * borda esquerda do seguinte.
   */
  const nomes = ['Indicador', 'Medio', 'Anel', 'Mindinho'];
  const faixas = nomes.map((n) => {
    const mcp = PIVOS[`mcp${n}`];
    const largura = OSSOS.find((o) => o.de === `mcp${n}`).largura;
    return { nome: n, esquerda: mcp.x - largura / 2, direita: mcp.x + largura / 2 };
  });

  for (let i = 0; i < faixas.length - 1; i++) {
    const a = faixas[i];
    const b = faixas[i + 1];
    assert.ok(a.direita <= b.esquerda + 2,
      `${a.nome} (até ${a.direita}) invade ${b.nome} (a partir de ${b.esquerda})`);
  }
});

test('a mão desenhada cabe no viewBox', () => {
  const margem = 4;
  const xs = [...Object.values(PIVOS), ...Object.values(PONTAS)].map((p) => p.x);
  const ys = [...Object.values(PIVOS), ...Object.values(PONTAS)].map((p) => p.y);
  for (const o of OSSOS) {
    xs.push(o.raiz.x - o.largura / 2, o.raiz.x + o.largura / 2);
    ys.push(o.raiz.y - o.largura / 2, o.ponta.y - o.largura / 2);
  }
  assert.ok(Math.min(...xs) >= margem, `a mão passa da borda esquerda: ${Math.min(...xs)}`);
  assert.ok(Math.max(...xs) <= 420 - margem, `a mão passa da borda direita: ${Math.max(...xs)}`);
  assert.ok(Math.min(...ys) >= margem, `a mão passa do topo: ${Math.min(...ys)}`);
});

test('a âncora da mão é a ponta do indicador', () => {
  /*
   * O ator mira o centro da tecla com esta coordenada: se ela não for a
   * ponta do dedo, o dedo chega deslocado em toda tecla da cena.
   *
   * A asserção é contra o osso distal, e não contra "o pivô menos o
   * comprimento": com os dedos em leque, o indicador está inclinado e a
   * ponta não cai na vertical do pivô.
   */
  const distal = OSSOS.find((o) => o.de === 'dipIndicador');
  assert.deepEqual(PONTAS.Indicador, distal.ponta);
  assert.equal(distal.ate, 'pontaIndicador');
});

test('a âncora de fallback do CSS é a mesma de ANCORA', () => {
  /*
   * O CSS precisa de um valor para `--ponta-x`/`--ponta-y` antes de o JS
   * escrever os reais. Esse valor é a âncora do desenho, então sai de
   * ANCORA — e quando os dedos se movem ele fica para trás em silêncio: o
   * desenho continua certo, só a âncora mente, e a mão inteira aparece
   * deslocada na cena sem nenhum erro no console. Foi o que aconteceu:
   * o CSS ainda dizia 214/118 com a ponta do indicador em 141.7/153.1.
   *
   * Os dois elementos que usam a âncora (a mão e a sombra) são conferidos
   * separadamente, porque são declarações independentes e uma pode
   * envelhecer sem a outra.
   */
  const css = readFileSync(new URL('../public/css/hand.css', import.meta.url), 'utf8');
  const declaracoes = (nome) => [...css.matchAll(
    new RegExp(`--${nome}:\\s*(-?[\\d.]+)px`, 'g'))].map((m) => Number(m[1]));

  const xs = declaracoes('ponta-x');
  const ys = declaracoes('ponta-y');
  assert.equal(xs.length, 2, 'esperava a âncora declarada no .mao e no .mao__sombra');
  assert.equal(ys.length, 2, 'esperava a âncora declarada no .mao e no .mao__sombra');

  const arredondado = (v) => Math.round(v * 100) / 100;
  for (const x of xs) assert.equal(x, arredondado(ANCORA.x), `--ponta-x do CSS: ${x}`);
  for (const y of ys) assert.equal(y, arredondado(ANCORA.y), `--ponta-y do CSS: ${y}`);
});

test('a âncora fica meia largura além da extremidade do osso', () => {
  /*
   * A distinção que custou 30 frames de dedo apertando o ar: PONTA é onde o
   * OSSO termina, ANCORA é onde o DESENHO termina. A tampa redonda da
   * falange avança meia largura além do osso, e é essa a ponta que a câmera
   * mostra. Se as duas voltarem a ser o mesmo ponto, a mão inteira desloca
   * meia largura de dedo na cena e nada mais reclama.
   */
  const d = Math.hypot(ANCORA.x - PONTA.x, ANCORA.y - PONTA.y);
  assert.ok(Math.abs(d - DEDOS.Indicador.largura / 2) < 0.01,
    `a âncora está a ${d.toFixed(2)} da ponta do osso, esperado ${DEDOS.Indicador.largura / 2}`);
});

test('os dedos nascem da palma, não do ar', () => {
  /*
   * O teste antigo checava isto com uma faixa de y escrita à mão. A
   * faixa passou a valer por si mesma em vez de valer pelo desenho: o
   * mindinho podia estar fora da palma e o teste continuava verde desde
   * que o número coubesse no intervalo. Aqui a referência é a palma de
   * verdade, a mesma que hand-svg.js desenha.
   */
  for (const nome of Object.keys(DEDOS)) {
    const mcp = PIVOS[`mcp${nome}`];
    assert.ok(mcp.x > PALMA.esquerda && mcp.x < PALMA.direita,
      `mcp${nome} em x=${mcp.x} cai fora da palma (${PALMA.esquerda}..${PALMA.direita})`);
    assert.ok(mcp.y > PALMA.topo - 16 && mcp.y < PALMA.topo + 16,
      `mcp${nome} em y=${mcp.y} não está na linha dos nós (${PALMA.topo})`);
  }
  const raiz = PIVOS.mcpPolegar;
  assert.ok(raiz.x > PALMA.esquerda - 4 && raiz.x < PALMA.direita && raiz.y > PALMA.topo
    && raiz.y < PALMA.base, 'a raiz do polegar deveria sair da lateral da palma');
});

/** A aridade de cada comando de path SVG, em números. */
const ARIDADE = { M: 2, L: 2, Q: 4, C: 6, Z: 0 };

/**
 * Confere que cada comando do `d` recebeu exatamente os números que aceita.
 *
 * Um par a mais num `Q` não é erro de sintaxe: o SVG repete o comando e
 * consome o par seguinte. O desenho sai errado e nada reclama — foi
 * assim que as falanges viraram cunhas afiadas com a suíte inteira verde,
 * porque os testes checavam os atributos `data-de`/`data-ate` e nunca o
 * próprio `d`.
 */
function comandosDoPath(d) {
  const tokens = d.match(/[MLQCZ]|-?\d+(?:\.\d+)?/g) ?? [];
  const comandos = [];
  let i = 0;
  while (i < tokens.length) {
    const letra = tokens[i];
    if (!(letra in ARIDADE)) throw new Error(`comando desconhecido em "${d}": ${letra}`);
    const aridade = ARIDADE[letra];
    const valores = tokens.slice(i + 1, i + 1 + aridade).map(Number);
    if (valores.length !== aridade || valores.some(Number.isNaN)) {
      throw new Error(`"${letra}" esperava ${aridade} números em "${d}"`);
    }
    comandos.push({ letra, valores });
    i += 1 + aridade;
  }
  return comandos;
}

test('todo comando do path de uma falange recebe os números que aceita', () => {
  const html = markupDaMao();
  const paths = [...html.matchAll(/<path class="falange".*?\/>/gs)].map(([t]) => t);
  assert.ok(paths.length >= 14, `poucas falanges: ${paths.length}`);
  for (const tag of paths) {
    const d = /d="([^"]+)"/.exec(tag)?.[1];
    assert.ok(d, `falange sem d: ${tag}`);
    assert.doesNotThrow(() => comandosDoPath(d), `path malformado: ${d}`);
    assert.equal(comandosDoPath(d)[0].letra, 'M', 'um path começa com M');
  }
});

test('a falange desenhada tem a largura e o comprimento do osso', () => {
  /*
   * O teste que faltava. Sem ele, uma falange pode estar desenhada como
   * um triângulo de ponta fina e continuar passando, porque os atributos
   * de posição continuam certos. Aqui a checagem é sobre a caixa do
   * desenho: ela tem que ser do tamanho do osso.
   */
  const html = markupDaMao();
  const paths = [...html.matchAll(/<path class="falange".*?\/>/gs)].map(([t]) => t);
  const porNome = new Map(OSSOS.map((o) => [o.nome, o]));

  for (const tag of paths) {
    const nome = /data-osso="([^"]+)"/.exec(tag)[1];
    const osso = porNome.get(nome);
    const pontos = comandosDoPath(/d="([^"]+)"/.exec(tag)[1])
      .flatMap((c) => c.valores).reduce((acc, _, i, arr) =>
        (i % 2 === 0 ? acc.push({ x: arr[i], y: arr[i + 1] }) : null, acc), []);

    const eixo = { x: Math.cos(osso.angulo * Math.PI / 180), y: Math.sin(osso.angulo * Math.PI / 180) };
    const aoLongo = pontos.map((p) => (p.x - osso.raiz.x) * eixo.x + (p.y - osso.raiz.y) * eixo.y);
    const atraves = pontos.map((p) => -(p.x - osso.raiz.x) * eixo.y + (p.y - osso.raiz.y) * eixo.x);

    const comprimento = Math.max(...aoLongo) - Math.min(...aoLongo);
    const largura = Math.max(...atraves) - Math.min(...atraves);

    /*
     * Os dois números são exatos, e não faixas: a largura é a do osso, e o
     * comprimento do polígono de controle é o do osso mais o bojo das duas
     * pontas. Os bojos são DIFERENTES de propósito (ver hand-svg.js): a
     * ponta avança uma largura inteira, para o ápice da quadrática cair em
     * meia largura e o dedo terminar em meia-circunferência; a base avança
     * `largura * 0,42`, só o bastante para cobrir a junta por trás do pivô.
     * Uma falange afinada, ou com a ponta reta de antes, falha aqui.
     */
    const bojoPonta = osso.largura;
    const bojoBase = osso.largura * 0.42;
    assert.ok(Math.abs(comprimento - (osso.comprimento + bojoPonta + bojoBase)) < 0.5,
      `${nome}: comprimento desenhado ${comprimento.toFixed(1)}, esperado ${(osso.comprimento + bojoPonta + bojoBase).toFixed(1)}`);
    assert.ok(Math.abs(largura - osso.largura) < 0.5,
      `${nome}: largura desenhada ${largura.toFixed(1)}, esperada ${osso.largura}`);
  }
});
