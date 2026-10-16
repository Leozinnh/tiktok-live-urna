/*
 * O volume do gabinete: o topo, a lateral, e de que lado ela cai.
 *
 * O defeito que estes testes prendem é o que o Leonardo viu na live — "a urna
 * não está 3d". Medido no navegador, o gabinete tinha três peças de volume e
 * nenhuma delas desenhava volume:
 *
 *   .urna__topo   502x16 px   uma tira girada para LONGE da câmera, que o
 *                             corpo opaco cobria; sobrava um chanfro no canto
 *   .urna__lado    20x326 px  (na urna da direita, 9x326) — uma face presa
 *                             DENTRO do corpo, varrendo para a frente
 *
 * Nenhuma das duas dá erro em console nenhum. A urna só fica com cara de
 * cartaz impresso, e é por isso que a asserção aqui é sobre a GEOMETRIA
 * declarada — de que aresta a peça nasce e para que lado ela gira — e não
 * sobre uma cópia dos números, que concordaria consigo mesma para sempre.
 *
 * Os mesmos números, no navegador, saem da sonda `.superpowers/sonda/urna.js`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ladoVisivel, LARGURA_DA_URNA, PERSPECTIVA } from '../public/js/urna.js';

const CSS = readFileSync(new URL('../public/css/urna.css', import.meta.url), 'utf8');
const TOKENS = readFileSync(new URL('../public/css/tokens.css', import.meta.url), 'utf8');
const AO_VIVO = readFileSync(new URL('../public/js/ao-vivo.js', import.meta.url), 'utf8');

/** Separa o CSS em regras, descartando comentários. */
function regras(css) {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, sel, corpo]) => ({ seletores: sel.split(',').map((s) => s.trim()), corpo }));
}

function declaracao(css, seletor, prop) {
  const regra = regras(css).find((r) => r.seletores.includes(seletor));
  if (!regra) throw new Error(`regra não encontrada: ${seletor}`);
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(regra.corpo);
  if (!m) throw new Error(`${seletor} não declara ${prop}`);
  return m[1].trim();
}

function tokens(css) {
  const raiz = regras(css).find((r) => r.seletores.includes(':root'));
  const mapa = {};
  for (const m of raiz.corpo.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) mapa[m[1]] = m[2].trim();
  return mapa;
}

/** O ângulo de um `rotateX`/`rotateY`, em graus, com o sinal. */
function angulo(valor) {
  const m = /rotate[XY]\(\s*(-?[\d.]+)deg\s*\)/.exec(valor);
  assert.ok(m, `a transformação não tem rotação em graus: ${valor}`);
  return Number(m[1]);
}

test('o topo nasce na aresta de cima do corpo e recua para trás', () => {
  /*
   * As duas metades da asserção são a mesma coisa dita duas vezes, de
   * propósito: a peça tem que estar PRESA na aresta de cima (`bottom: 100%`,
   * com a origem embaixo) e girar para o lado do fundo.
   *
   * O sinal é o que estava errado antes — a tira girava em -72°, ia para trás
   * do corpo, e o corpo opaco cobria. Um `rotateX` positivo, com a origem na
   * borda de baixo, levanta a peça acima da aresta e a empurra para longe, que
   * é como o tampo da mesa já era desenhado.
   */
  assert.equal(declaracao(CSS, '.urna__topo', 'bottom'), '100%',
    'o topo precisa nascer na aresta de cima do corpo');
  assert.equal(declaracao(CSS, '.urna__topo', 'height'), 'var(--urna-profundidade)',
    'a profundidade do topo é a do gabinete, e não um número solto');
  assert.match(declaracao(CSS, '.urna__topo', 'transform-origin'), /bottom/,
    'girando pela borda de baixo, a aresta da frente fica parada no lugar');
  const giro = angulo(declaracao(CSS, '.urna__topo', 'transform'));
  assert.ok(giro > 0, `o topo gira para trás do corpo, e não para fora dele (${giro}°)`);
  assert.ok(giro < 90, `em 90° o topo fica de perfil e some (${giro}°)`);
});

test('o topo pega mais luz que o corpo', () => {
  /*
   * A lâmpada está no teto. O topo é a única face da urna virada para ela de
   * frente, então ele é a face MAIS CLARA do gabinete — e é esse degrau de
   * valor, e não a forma, que o olho lê como "esta superfície está deitada".
   * Um topo da mesma cor do corpo é um topo que não existe.
   */
  const luminancia = (hex) => {
    const [, r, g, b] = /#(..)(..)(..)/.exec(hex).map((v, i) => (i ? parseInt(v, 16) / 255 : 0));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const clara = /#([0-9a-f]{6})/i.exec(declaracao(CSS, '.urna__topo', 'background'));
  assert.ok(clara, 'o topo não declara nenhuma cor literal para comparar');
  const corpo = luminancia(tokens(TOKENS)['--urna-plastico']);
  assert.ok(luminancia('#' + clara[1]) > corpo,
    `o topo (${luminancia('#' + clara[1]).toFixed(3)}) não pode ser mais escuro que o corpo (${corpo.toFixed(3)})`);
});

test('a lateral nasce FORA do corpo, e recua', () => {
  /*
   * O erro de antes era de lugar, não de ângulo: a face morava dentro do
   * corpo (`right: -1px`) e girava em +76°, o que a varria para a FRENTE. Em
   * vez de uma face lateral, o que aparecia era um chanfro de 13px colado na
   * borda de dentro — e um corpo opaco em z=0 cobre tudo o que não sai para
   * fora dele.
   *
   * Por isso a asserção prende a âncora: a peça começa em `left: 100%` (ou
   * `right: 100%`, na outra mão) e gira para trás. Onde ela encosta é o que
   * decide se ela é uma face ou um chanfro.
   */
  assert.equal(declaracao(CSS, '.urna__lado', 'left'), '100%',
    'a lateral da direita começa na aresta direita do corpo, e não dentro dele');
  assert.equal(declaracao(CSS, '.urna__lado', 'width'), 'var(--urna-profundidade)',
    'a lateral tem a profundidade do gabinete');
  assert.match(declaracao(CSS, '.urna__lado', 'transform-origin'), /left/,
    'girando pela aresta da frente, a quina do corpo fica parada');
  const giro = angulo(declaracao(CSS, '.urna__lado', 'transform'));
  assert.ok(giro > 0 && giro < 90,
    `a lateral da direita gira para trás, entre 0° e 90° (${giro}°)`);

  // E a variante espelhada existe: sem ela, a urna da direita mostraria a
  // face do lado errado do palco.
  const espelho = '.urna--lado-esq .urna__lado';
  assert.equal(declaracao(CSS, espelho, 'right'), '100%',
    'a lateral da esquerda começa na aresta esquerda do corpo');
  assert.match(declaracao(CSS, espelho, 'transform-origin'), /right/);
  const giroEsq = angulo(declaracao(CSS, espelho, 'transform'));
  assert.ok(giroEsq < 0 && giroEsq > -90,
    `a lateral da esquerda gira para o outro lado (${giroEsq}°)`);
});

test('a camada das urnas deixa a perspectiva do palco passar', () => {
  /*
   * Sem `preserve-3d` aqui, o gabinete é achatado no plano da camada e o
   * `perspective` do palco para de valer lá dentro: as faces continuam
   * girando, mas o desenho vira ortográfico, e a urna deixa de mostrar mais
   * lateral quanto mais longe do centro ela estiver. É a diferença entre um
   * caixote e um desenho de caixote.
   */
  const CENA = readFileSync(new URL('../public/css/scene.css', import.meta.url), 'utf8');
  assert.equal(declaracao(CENA, '.camada--urnas', 'transform-style'), 'preserve-3d');
});

test('cada urna do rodízio padrão mostra a lateral do seu lado do palco', () => {
  /*
   * Um caixote visto de frente mostra UMA das duas faces laterais. Qual delas
   * depende de onde a câmera está — aqui, o centro do palco — e de quanto o
   * gabinete está girado. As duas urnas do rodízio padrão ficam uma de cada
   * lado do centro, e é isso que faz o par parecer dois caixotes virados um
   * para o outro, e não dois cartazes lado a lado.
   *
   * Os valores de `x` e `rot` são lidos do rodízio de verdade, e não escritos
   * aqui: se alguém mudar a posição das urnas, este teste continua medindo o
   * que está na tela em vez de medir uma lembrança.
   */
  const rodizio = [...AO_VIVO.matchAll(/\{\s*id:\s*'(\w+)',\s*x:\s*(-?\d+),\s*y:\s*\d+,\s*rot:\s*(-?\d+)/g)]
    .map(([, id, x, rot]) => ({ id, x: Number(x), rot: Number(rot) }));
  assert.ok(rodizio.length >= 2, 'não achei as duas urnas do rodízio em ao-vivo.js');

  const lados = rodizio.map((u) => ladoVisivel(u));
  assert.equal(lados[0], 'dir', `a urna ${rodizio[0].id} (x ${rodizio[0].x}) fica à esquerda da câmera e mostra a face direita`);
  assert.equal(lados[1], 'esq', `a urna ${rodizio[1].id} (x ${rodizio[1].x}) fica à direita da câmera e mostra a face esquerda`);
});

test('a lateral troca de lado quando a urna troca de lado', () => {
  // A conta é a do produto escalar, então ela não pode estar presa ao id: a
  // mesma urna arrastada para o outro canto do palco tem que virar a cara.
  assert.equal(ladoVisivel({ x: 24, rot: -6 }), 'dir');
  assert.equal(ladoVisivel({ x: 556, rot: 6 }), 'esq');
  assert.equal(ladoVisivel({ x: 556, rot: -6 }), 'esq',
    'no canto direito, girar para dentro não chega a virar a face de fora');
  assert.equal(ladoVisivel({ x: 24, rot: 6 }), 'dir',
    'no canto esquerdo, idem');
});

test('a largura e a distância da câmera são as mesmas do CSS', () => {
  /*
   * A conta do lado visível roda antes de a urna existir no documento, então
   * ela não pode medir o elemento: os dois números estão repetidos em
   * urna.js. Repetidos e presos aqui — se o `--urna-largura` mudar sem que o
   * `LARGURA_DA_URNA` mude junto, a urna passa a mostrar a face do lado
   * errado, e nada mais no sistema reclamaria.
   */
  const t = tokens(TOKENS);
  assert.equal(`${LARGURA_DA_URNA}px`, t['--urna-largura'],
    'LARGURA_DA_URNA e --urna-largura divergiram');
  assert.equal(`${PERSPECTIVA}px`, t['--perspectiva'],
    'PERSPECTIVA e --perspectiva divergiram');
});
