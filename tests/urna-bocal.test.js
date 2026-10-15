/*
 * A boca da impressora e a cédula que sai dela.
 *
 * O defeito que estes testes prendem: a cédula aparecia pintada por cima do
 * LCD, com 192x114px de sobreposição e `z-index: 5`, nascendo do nada em
 * cima da tela. Não havia abertura nenhuma onde o papel aparecia.
 *
 * E havia um segundo desencontro, mais silencioso: a boca ficava no tampo,
 * que gira `rotateX(-72deg)`. A rotação projeta aquela fenda para y~14, lá
 * em cima, enquanto o papel nascia em y=150 — e a mão mirava o slot MEDIDO,
 * ou seja, mirava um ponto a mais de cem pixels do papel que deveria estar
 * segurando. Nada disso dá erro: só não parece real, que é justamente o
 * critério que manda aqui.
 *
 * Por isso a asserção é sobre o CSS e o markup, não sobre uma cópia dos
 * números: uma cópia concorda consigo mesma para sempre.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../public/css/urna.css', import.meta.url), 'utf8');
const TOKENS = readFileSync(new URL('../public/css/tokens.css', import.meta.url), 'utf8');
const JS = readFileSync(new URL('../public/js/urna.js', import.meta.url), 'utf8');

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

/**
 * Resolve `var(--token)` até sobrar um comprimento em px.
 *
 * Deliberadamente não avalia `calc()`: quem escreve os valores que a
 * geometria usa declara o número final num token, e a derivação vira uma
 * asserção explícita em vez de uma conta escondida dentro do CSS. Um
 * `calc()` que apareça aqui falha alto em vez de passar batido.
 */
function px(valor, mapa) {
  let v = valor;
  for (let i = 0; i < 6 && v.includes('var('); i++) {
    v = v.replace(/var\((--[\w-]+)\)/g, (_, nome) => {
      if (!(nome in mapa)) throw new Error(`token não declarado: ${nome}`);
      return mapa[nome];
    });
  }
  const m = /^(-?[\d.]+)px$/.exec(v.trim());
  if (!m) throw new Error(`não é um comprimento simples em px: "${valor}"`);
  return Number(m[1]);
}

const T = tokens(TOKENS);
const comprimento = (seletor, prop) => px(declaracao(CSS, seletor, prop), T);

test('a cédula sai da boca da impressora, não da frente da tela', () => {
  // Mesmo eixo horizontal: se um dos dois trocar de lado sozinho, o papel
  // passa a sair ao lado da fenda e a mão a mira no lugar errado.
  assert.equal(
    declaracao(CSS, '.urna__cedula', 'left'),
    declaracao(CSS, '.urna__slot', 'left'),
    'a cédula e a boca têm que se posicionar pelo mesmo eixo',
  );
  // E o papel começa na borda de CIMA da fenda, não na de baixo: os
  // primeiros 22px dele passam por dentro da boca, e é a camada de cima da
  // fenda que os esconde. Sem isso, a altura crescendo de 0 vira um
  // retângulo brotando do plástico — que foi exatamente o que se viu.
  assert.equal(
    comprimento('.urna__cedula', 'top'),
    comprimento('.urna__slot', 'top'),
    'a cédula não nasce dentro da boca da impressora',
  );
});

test('a cédula não sobe para fora da fenda enquanto sai', () => {
  /*
   * O deslocamento vertical do papel é a ALTURA crescendo, e só.
   *
   * O topo da caixa da cédula é a borda de cima da fenda, e o que se vê
   * sair é a janela de recorte crescendo para baixo. Um `translateY`
   * negativo no repouso desmente isso: o papel começa desenhado ACIMA da
   * fenda, por cima da placa, e depois desce até o lugar. É o mesmo defeito
   * de "papel nascendo fora do buraco" que trazer a boca para a face da
   * frente resolveu, só que menor e mais difícil de ver.
   *
   * Medido no navegador, com `translateY(-30px)`: um quadro em que a conta
   * de layout já dizia "o papel chegou na fenda" enquanto o papel desenhado
   * estava 16px acima do topo dela, a 83% de opacidade. Quem via a cena
   * via o papel entrar deslizando por fora.
   */
  for (const seletor of [
    '.urna__cedula',
    '.urna__cedula.is-visivel',
    '.urna.is-cedula-entrando .urna__cedula',
  ]) {
    const t = declaracao(CSS, seletor, 'transform');
    // A guarda contra um teste que não mede nada: quem posiciona o papel
    // centraliza no eixo da fenda, e é essa a regra que precisa ser lida.
    assert.ok(t.includes('translateX(-50%)'),
      `${seletor} deixou de centralizar o papel no eixo da fenda`);
    const deslocamentos = [
      ...t.matchAll(/translateY\(\s*(-?[\d.]+)px\s*\)/g),
      // A forma curta, que esconderia o mesmo deslocamento.
      ...t.matchAll(/translate\(\s*[^,]+,\s*(-?[\d.]+)px\s*\)/g),
    ];
    for (const m of deslocamentos) {
      assert.equal(Number(m[1]), 0,
        `${seletor} desloca o papel ${m[1]}px na vertical: o papel aparece fora da fenda`);
    }
  }
});

test('a janela de recorte do papel não é girada', () => {
  /*
   * O papel sai torto; a janela por onde ele sai, não.
   *
   * A inclinação de 2 graus mora no cartão, dentro da janela. Enquanto ela
   * morava na janela, o canto de cima do retângulo de recorte subia
   * (largura/2)·sen(2°) ≈ 3px acima do topo da fenda — e esses 3px de papel
   * apareciam pintados sobre o plástico acima da boca, em TODOS os 67
   * quadros da saída, medidos no navegador. Papel saindo de dentro da urna
   * não pode estar na frente da urna.
   */
  assert.ok(!/rotate/.test(declaracao(CSS, '.urna__cedula', 'transform')),
    'a janela de recorte está girada: o canto dela sobe acima do topo da fenda');
  assert.match(declaracao(CSS, '.cedula__borda', 'transform'), /rotate/,
    'a inclinação do papel sumiu em vez de mudar de lugar');
});

test('a boca escura é larga o bastante para o papel passar', () => {
  /*
   * Papel mais largo que o buraco por onde sai aparece cortado nas duas
   * laterais — e o corte é sutil o bastante para passar por "estilo" em
   * vez de defeito. A moldura come uma faixa de cada lado, então a largura
   * que importa não é a da fenda e sim a da boca escura.
   */
  assert.equal(declaracao(CSS, '.urna__slot-boca', 'inset'), '4px var(--bocal-borda)',
    'a moldura da boca precisa se dimensionar pelo token que o teste confere');

  const larguraDaBoca = comprimento('.urna__slot', 'width') - 2 * px(T['--bocal-borda'], T);
  assert.ok(larguraDaBoca >= comprimento('.urna__cedula', 'width'),
    `a boca tem ${larguraDaBoca}px de largura e o papel ${comprimento('.urna__cedula', 'width')}px`);
});

test('a cédula desce sobre o teclado e não cobre a tela', () => {
  /*
   * O papel cai para fora da fenda, então ele passa por cima do que
   * estiver abaixo dela. A tela é o que não pode ser coberto: é onde o
   * eleitor confere o voto, e papel saindo de dentro do LCD não existe.
   */
  const centro = comprimento('.urna__slot', 'left');   // já validado igual ao da cédula
  const largura = comprimento('.urna__cedula', 'width');
  const bordaEsquerda = centro - largura / 2;
  const telaDireita = comprimento('.urna__tela', 'left') + comprimento('.urna__tela', 'width');

  assert.ok(bordaEsquerda >= telaDireita,
    `a cédula começa em x=${bordaEsquerda} e a tela vai até x=${telaDireita}`);
});

test('a boca fica sobre o teclado, e não sobre a tela', () => {
  /*
   * É onde a impressora fica na urna de verdade: à direita, acima do
   * teclado, com a tela livre à esquerda. O eixo é DERIVADO da posição do
   * teclado — centro do teclado —, então mexer no teclado sem mexer na
   * boca quebra este teste em vez de desalinhar a cena em silêncio.
   */
  assert.equal(declaracao(CSS, '.urna__teclado', 'width'), 'var(--teclado-largura)',
    'o teclado precisa se dimensionar pelo token que a boca usa');
  assert.equal(declaracao(CSS, '.urna__teclado', 'right'), 'var(--teclado-recuo)',
    'o recuo do teclado precisa ser o token que a boca usa');

  const derivado = T['--urna-largura'].replace('px', '') * 1
    - px(T['--teclado-recuo'], T)
    - px(T['--teclado-largura'], T) / 2;
  assert.equal(px(T['--bocal-centro'], T), derivado,
    '--bocal-centro deixou de ser o centro do teclado');
});

test('a boca não invade a tela nem a placa de identificação', () => {
  // A fenda fica acima da tela: sem esta checagem, subir o teclado ou
  // crescer a fenda coloca papel saindo de dentro do LCD.
  const fundoDaBoca = comprimento('.urna__slot', 'top') + comprimento('.urna__slot', 'height');
  assert.ok(fundoDaBoca <= comprimento('.urna__tela', 'top'),
    `a boca termina em y=${fundoDaBoca} e a tela começa em y=${comprimento('.urna__tela', 'top')}`);
});

test('a boca é pintada por cima da cédula', () => {
  /*
   * O papel nasce com o topo DENTRO da fenda, então os primeiros 22px dele
   * ficam atrás da moldura. Quem esconde essa faixa é a ordem de pintura:
   * com os dois `z-index` trocados o layout fica idêntico e o papel desliza
   * na FRENTE da fenda, o que lê como papel passando por cima do buraco em
   * vez de entrando nele.
   *
   * A cédula e a boca compartilham o contexto de empilhamento do .urna (o
   * __corpo não cria um: é `position: absolute` sem transform e sem
   * z-index), então comparar os dois números basta.
   */
  const zCedula = Number(declaracao(CSS, '.urna__cedula', 'z-index'));
  const zBoca = Number(declaracao(CSS, '.urna__slot', 'z-index'));
  assert.ok(Number.isFinite(zCedula) && Number.isFinite(zBoca),
    `os dois precisam declarar z-index: cédula=${zCedula}, boca=${zBoca}`);
  assert.ok(zBoca > zCedula,
    `a boca está em z-index ${zBoca} e a cédula em ${zCedula}: o papel passa por cima da fenda`);
});

test('a boca é medida na face da frente, onde o papel aparece', () => {
  /*
   * O slot morava no tampo, que gira 72 graus. A mão mira o que
   * `medirGeometria` devolve — a caixa do elemento —, então apontar para
   * um elemento girado é apontar para a projeção dele: a mão encostava no
   * tampo enquanto o papel saía na frente. Na face da frente não há
   * projeção nenhuma entre o que se mede e o que se vê.
   */
  const tampo = /<div class="urna__topo">([\s\S]*?)<div class="urna__corpo">/.exec(JS);
  assert.ok(tampo, 'não achei o bloco do tampo em criarUrna');
  assert.ok(!tampo[1].includes('urna__slot'),
    'a boca da impressora continua no tampo, onde a rotação a desloca');

  const corpo = /<div class="urna__corpo">([\s\S]*?)<\/div>\s*<div class="urna__glow">/.exec(JS);
  assert.ok(corpo, 'não achei o bloco do corpo em criarUrna');
  assert.ok(corpo[1].includes('data-papel="entrada"'),
    'a boca precisa estar na face da frente e seguir marcada como ponto de mira');
});
