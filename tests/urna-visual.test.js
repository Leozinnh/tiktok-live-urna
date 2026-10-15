/*
 * A frente da urna, conferida contra a foto da urna de verdade.
 *
 * A urna já tinha a SILHUETA certa — larga e baixa — mas a frente ainda era
 * uma invenção: uma tarja colorida com o "JUSTIÇA ELEITORAL" em letra branca
 * por cima, dois recessos escuros separados, e as três teclas de ação com
 * rótulo branco. A foto mostra outra coisa:
 *
 *   - "JUSTIÇA ELEITORAL" em letra PRETA, sobre o corpo branco, no alto à
 *     direita, com o emblema redondo ao lado;
 *   - UM painel preto só, ocupando toda a direita, com as nove teclas, o
 *     zero e as três de ação dentro dele;
 *   - teclas de carvão com o numeral branco no alto e o ponto Braille
 *     embaixo, que é a marca registrada do teclado da urna brasileira;
 *   - BRANCO, CORRIGE e CONFIRMA com rótulo PRETO sobre a cor da tecla;
 *   - a grelha de ventilação embaixo do VISOR, e não embaixo do teclado;
 *   - a marca do fabricante gravada no corpo, sob o visor.
 *
 * Nada disso dá erro quando está errado. Só não parece a urna.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { markupTeclado } from '../public/js/urna.js';

const CSS = readFileSync(new URL('../public/css/urna.css', import.meta.url), 'utf8');
const JS = readFileSync(new URL('../public/js/urna.js', import.meta.url), 'utf8');

/**
 * Separa o CSS em regras, descartando comentários.
 *
 * O espaço interno do seletor é colapsado: o arquivo alinha as regras com
 * runs de espaços (`.tecla--branco   .tecla__rotulo`), e sem normalizar o
 * `includes` não acha uma regra que está bem ali na frente.
 */
function regras(css) {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, sel, corpo]) => ({
      seletores: sel.split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
      corpo,
    }));
}

/**
 * O valor FINAL de uma propriedade para um seletor.
 *
 * Junta todas as regras que atingem o seletor e fica com a última declaração
 * da propriedade, e não com a primeira. Um seletor declarado em dois lugares
 * obedece ao de baixo: lendo o de cima, o teste mede um valor que o navegador
 * nunca aplica — e passa enquanto a cor de verdade está errada. Foi assim que
 * uma regra `.tecla--corrige .tecla__rotulo { color: branco }` injetada
 * depois da lista de rótulos escuros passou batido na conferência.
 */
function declaracao(seletor, prop) {
  const partes = regras(CSS)
    .filter((r) => r.seletores.includes(seletor))
    .map((r) => r.corpo);
  if (partes.length === 0) throw new Error(`regra não encontrada: ${seletor}`);
  let ultimo = null;
  for (const parte of partes) {
    for (const m of parte.matchAll(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'g'))) {
      ultimo = m[1].trim();
    }
  }
  if (ultimo === null) throw new Error(`${seletor} não declara ${prop}`);
  return ultimo;
}

/**
 * Luminância relativa de um #rrggbb, na fórmula da WCAG.
 *
 * O teste mede o que aparece, não o texto do CSS: trocar `#101114` por outro
 * preto qualquer continua passando, e é isso que se quer.
 */
function luminancia(hex) {
  const canal = (i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
}

/** As cores hexadecimais declaradas num trecho de CSS. */
function cores(texto) {
  return [...texto.matchAll(/#([0-9a-f]{6})\b/gi)].map((m) => m[1]);
}

test('a placa "JUSTIÇA ELEITORAL" é letra preta sobre o corpo, no alto à direita', () => {
  /*
   * Na foto a placa não é uma tarja: é uma chapinha branca no canto
   * superior direito do gabinete, com o emblema redondo à esquerda e as
   * duas palavras em letra escura. Enquanto ela era texto branco dentro da
   * faixa colorida, o alto da urna não tinha nada a ver com a referência.
   */
  const placa = declaracao('.urna__placa', 'color');
  const cor = cores(placa)[0];
  assert.ok(cor, `a placa não declara uma cor hexadecimal: ${placa}`);
  assert.ok(luminancia(cor) < 0.15,
    `a placa está com #${cor}: letra clara sobre o corpo claro não se lê`);

  /*
   * Ancorada pela DIREITA do corpo, e não pela esquerda. O valor pode ser um
   * token — ele é o recuo do teclado, e é o que mantém a placa em cima dele
   * quando o teclado se mexer. O que a asserção prende é o lado: com `left`,
   * a placa atravessa o visor e o alto da urna volta a não parecer a foto.
   */
  const regra = regras(CSS).find((r) => r.seletores.includes('.urna__placa'));
  assert.ok(/(?:^|;)\s*right\s*:/.test(regra.corpo),
    'a placa precisa se ancorar pela direita do corpo, como na foto');
  assert.ok(!/(?:^|;)\s*left\s*:/.test(regra.corpo),
    'a placa está ancorada pela esquerda: ela invade o visor');

  // E a faixa do topo fica só para si: a placa saiu de dentro dela.
  assert.match(JS, /<div class="urna__faixa-urna"><\/div>/,
    'a faixa do topo precisa ser só a tarja — a placa mora no corpo, ao lado dela');
});

test('o teclado é um painel preto só, com as nove teclas e as três de ação dentro', () => {
  /*
   * Eram dois recessos escuros empilhados, cada um com o seu próprio fundo.
   * Na foto é uma peça única: um painel preto fosco que ocupa toda a direita
   * da frente, do alto do gabinete até o pé, e dentro dele as doze teclas.
   *
   * O TETO DA LUMINÂNCIA subiu de 0.03 para 0.09 em 2026-10-15, por decisão
   * do Leonardo: ele clareou o fim do gradiente para `#363a43` (0.0422), e
   * esse é o pé do painel pegando luz — as teclas assentam numa superfície em
   * vez de flutuarem num vazio, e o painel ganha profundidade.
   *
   * O teto antigo foi escrito quando o gradiente era preto chapado, e media
   * fidelidade à foto. O que este teste tem que prender é outra coisa, e mais
   * durável: o painel continua sendo a segunda maior mancha ESCURA da urna.
   * O 0.09 sai daí, e não do valor que ele escolheu — é ~4x mais escuro que o
   * plástico mais escuro do corpo (`--urna-plastico-3`, 0.3727), e é onde uma
   * superfície deixa de ler como massa escura e passa a ler como cinza médio.
   *
   * O que ele ainda pega: um painel em `#5a5f6a` (0.1140) ou mais claro
   * reprova. E a asserção estrutural logo abaixo, que é a metade importante
   * deste teste, não mudou nada.
   */
  const painel = declaracao('.urna__teclado', 'background');
  const escuras = cores(painel);
  assert.ok(escuras.length > 0, 'o painel do teclado não declara cor de fundo');
  const maisClara = Math.max(...escuras.map(luminancia));
  assert.ok(maisClara < 0.09,
    `o painel do teclado clareou demais e deixou de ser massa escura (luminância ${maisClara.toFixed(4)})`);

  // Os dois blocos perderam o fundo próprio: quem pinta agora é o painel.
  for (const bloco of ['.teclado__grade', '.teclado__acoes']) {
    const temFundo = regras(CSS)
      .filter((r) => r.seletores.includes(bloco))
      .some((r) => /(?:^|;)\s*background\s*:/.test(r.corpo));
    assert.ok(!temFundo,
      `${bloco} ainda pinta o próprio recesso: o teclado volta a ser dois blocos`);
  }
});

test('as três teclas de ação têm rótulo escuro sobre a cor da tecla', () => {
  /*
   * Na foto o texto de BRANCO, CORRIGE e CONFIRMA é PRETO nas três. Só o
   * BRANCO tinha isso; as outras duas herdavam o branco do rótulo numérico,
   * e branco sobre laranja é a combinação que menos se lê de todas — o
   * "CORRIGE" sumia na própria tecla.
   */
  for (const [classe, fundo] of [
    ['.tecla--branco', 'ffffff'],
    ['.tecla--corrige', 'f08a1e'],
    ['.tecla--confirma', '22a04a'],
  ]) {
    const cor = cores(declaracao(`${classe} .tecla__rotulo`, 'color'))[0];
    assert.ok(cor, `${classe} não declara a cor do rótulo`);
    const contraste = (luminancia(fundo) + 0.05) / (luminancia(cor) + 0.05);
    assert.ok(luminancia(cor) < 0.15,
      `${classe} está com o rótulo em #${cor}, claro demais para ler sobre a tecla`);
    assert.ok(contraste > 4.5,
      `${classe} tem contraste ${contraste.toFixed(2)}:1 — abaixo do mínimo de leitura`);
  }
});

test('cada tecla numérica tem o ponto Braille da urna de verdade', () => {
  /*
   * O pontinho em relevo na base da tecla é o que faz o teclado da urna ser
   * reconhecível de perto, e é a única parte da tecla que não é um número.
   * Sem ele, o teclado é o de um telefone.
   */
  const html = markupTeclado();
  const teclas = [...html.matchAll(/data-tecla="([^"]+)"/g)].map((m) => m[1]);
  const numericas = teclas.filter((t) => /^\d$/.test(t));
  assert.equal(numericas.length, 10, `esperava dez teclas numéricas, achei ${numericas.length}`);

  const blocos = [...html.matchAll(/class="tecla__pontos"/g)].length;
  assert.equal(blocos, numericas.length,
    `${blocos} teclas com ponto para ${numericas.length} teclas numéricas`);
  const pontos = [...html.matchAll(/class="tecla__ponto"/g)].length;
  assert.equal(pontos, numericas.length * 6,
    `${pontos} pontos para ${numericas.length} teclas: o ponto Braille da urna `
    + 'é uma matriz de duas colunas por três linhas');

  // E as teclas de ação não ganham ponto: na foto elas são lisas.
  for (const acao of ['BRANCO', 'CORRIGE', 'CONFIRMA']) {
    const inicio = html.indexOf(`data-tecla="${acao}"`);
    const cauda = html.slice(inicio, html.indexOf('</button>', inicio));
    assert.ok(!cauda.includes('tecla__pontos'),
      `${acao} é tecla de ação e não leva ponto Braille`);
  }
});

test('os respiros ficam embaixo do visor, e a marca da fábrica também', () => {
  /*
   * Na foto a grelha de ventilação é uma fileira de fendas verticais logo
   * abaixo do visor, no canto esquerdo do gabinete. Aqui ela estava embaixo
   * do TECLADO, que é o canto errado: o calor sai do lado da tela.
   */
  assert.equal(declaracao('.urna__respiros', 'left'), declaracao('.urna__tela', 'left'),
    'os respiros precisam nascer na mesma coluna do visor');
  assert.equal(declaracao('.urna__respiros', 'width'), declaracao('.urna__tela', 'width'),
    'os respiros precisam ter a largura do visor que eles ventiilam');

  assert.match(JS, /class="urna__marca"/,
    'falta a marca do fabricante gravada no corpo, sob o visor');
});

test('a moldura do visor é plástico cinza, sem a cor da urna', () => {
  /*
   * O aro colorido em volta do vidro era o que amarrava o painel à
   * identidade da urna — só que na foto não existe aro nenhum: o visor é
   * embutido no plástico cinza, e a cor aparece DENTRO, no número do
   * candidato. Com o aro, a frente ficava com duas cores disputando.
   */
  const sombra = declaracao('.urna__tela', 'box-shadow');
  assert.ok(!/var\(--cor-urna/.test(sombra),
    'a moldura do visor ainda usa a cor da urna');

  const cinzas = cores(sombra);
  assert.ok(cinzas.length >= 2, 'a moldura do visor perdeu as camadas de plástico');
  for (const c of cinzas) {
    const canais = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
    assert.ok(Math.max(...canais) - Math.min(...canais) <= 20,
      `a moldura do visor tem #${c}, que não é cinza`);
  }
});
