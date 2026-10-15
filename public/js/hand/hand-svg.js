import { JUNTAS, poseParaTransformacoes } from './poses.js';
import { OSSOS, PIVOS, PONTAS, PONTA, DEDOS, PALMA } from './esqueleto.js';

export { PIVOS, PONTAS, PONTA, OSSOS, DEDOS, PALMA } from './esqueleto.js';

export const MARCA_DE_JUNTA = (nome) => `data-junta="${nome}"`;

/** A origem de rotação escrita no próprio grupo, casada com PIVOS. */
const origem = (junta) =>
  `style="transform-origin: ${PIVOS[junta].x}px ${PIVOS[junta].y}px"`;

const n = (v) => Math.round(v * 100) / 100;

/**
 * Uma falange desenhada ao longo de um eixo qualquer.
 *
 * O eixo é o do osso — os quatro dedos sobem reto e o polegar sai de
 * lado, então uma função que só desenha na vertical não serviria para o
 * polegar. As duas pontas são arredondadas e a da base passa para TRÁS do
 * pivô: é esse bojo que cobre a junta, e sem ele dobrar o dedo abre uma
 * fenda entre uma falange e a seguinte.
 */
function falange(osso) {
  const r = (osso.angulo * Math.PI) / 180;
  const dx = Math.cos(r);
  const dy = Math.sin(r);
  const hx = (-dy * osso.largura) / 2;
  const hy = (dx * osso.largura) / 2;
  const k = osso.largura * 0.42;

  const p = osso.raiz;
  const t = osso.ponta;
  const xy = (x, y) => `${n(x)} ${n(y)}`;

  // Um comando por linha, com exatamente a aridade que ele aceita: `M` e
  // `L` levam um par, `Q` leva dois. Passar um par a mais num `Q` não dá
  // erro — o SVG repete o comando e come o par seguinte, e a falange sai
  // como uma cunha em vez de um retângulo de pontas redondas.
  return `<path class="falange" fill="url(#peleBase)" `
    + `data-osso="${osso.nome}" data-de="${n(p.x)},${n(p.y)}" data-ate="${n(t.x)},${n(t.y)}" `
    + `d="M ${xy(p.x + hx, p.y + hy)} `
    + `L ${xy(t.x + hx, t.y + hy)} `
    + `Q ${xy(t.x + dx * k, t.y + dy * k)} ${xy(t.x - hx, t.y - hy)} `
    + `L ${xy(p.x - hx, p.y - hy)} `
    + `Q ${xy(p.x - dx * k, p.y - dy * k)} ${xy(p.x + hx, p.y + hy)} Z"/>`;
}

/**
 * A unha, encostada na ponta e alinhada com o eixo do osso.
 *
 * Pequena de propósito: a unha é o detalhe que diz "isto é um dedo", e
 * uma unha grande vira uma bola branca na ponta — foi assim que os dedos
 * apareceram na primeira captura depois da reconstrução.
 */
function unha(osso) {
  const r = (osso.angulo * Math.PI) / 180;
  const cx = osso.ponta.x - Math.cos(r) * osso.largura * 0.38;
  const cy = osso.ponta.y - Math.sin(r) * osso.largura * 0.38;
  return `<ellipse class="unha" cx="${n(cx)}" cy="${n(cy)}" `
    + `rx="${n(osso.largura * 0.21)}" ry="${n(osso.largura * 0.26)}" `
    + `transform="rotate(${n(osso.angulo + 90)} ${n(cx)} ${n(cy)})" fill="url(#unhaGrad)"/>`;
}

/**
 * Um dedo é uma cadeia de grupos aninhados: mcp > pip > dip.
 * Girar o grupo externo move tudo o que está dentro, como uma falange real.
 * O osso de cada grupo é desenhado aqui mesmo, então o desenho e o pivô
 * vêm da mesma entrada de OSSOS — não há como divergirem.
 */
function dedo(nome, juntas) {
  const ossosDoDedo = juntas.map((j) => OSSOS.find((o) => o.de === j));
  const [mcp, pip, dip] = juntas;
  const ossoMcp = ossosDoDedo[0];
  const ossoPip = ossosDoDedo[1];
  const ossoDip = ossosDoDedo[2];

  // Sombra de contato na borda interna do dedo: sem ela, dois dedos
  // encostados viram uma superfície só e a mão perde a leitura de "quatro
  // dedos". Fica dentro do grupo do nó para acompanhar o dedo ao dobrar.
  const costura = `<path class="costura" d="M ${n(ossoMcp.raiz.x - ossoMcp.largura / 2)} ${n(ossoMcp.raiz.y)} `
    + `L ${n(ossoMcp.raiz.x - ossoMcp.largura / 2)} ${n(ossoMcp.raiz.y - ossoMcp.comprimento - 12)}" `
    + `stroke="#8a5533" stroke-width="3" stroke-opacity="0.22" fill="none"/>`;

  return `
    <g ${MARCA_DE_JUNTA(mcp)} ${origem(mcp)}>
      ${falange(ossoMcp)}
      ${costura}
      <g ${MARCA_DE_JUNTA(pip)} ${origem(pip)}>
        ${falange(ossoPip)}
        <g ${MARCA_DE_JUNTA(dip)} ${origem(dip)}>
          ${falange(ossoDip)}
          ${unha(ossoDip)}
        </g>
      </g>
    </g>`;
}

/** O polegar, com a mesma estrutura de cadeia dos outros dedos. */
function polegar() {
  const ossoA = OSSOS.find((o) => o.de === 'mcpPolegar');
  const ossoB = OSSOS.find((o) => o.de === 'ipPolegar');
  return `
    <g ${MARCA_DE_JUNTA('mcpPolegar')} ${origem('mcpPolegar')}>
      ${falange(ossoA)}
      <g ${MARCA_DE_JUNTA('ipPolegar')} ${origem('ipPolegar')}>
        ${falange(ossoB)}
        ${unha(ossoB)}
      </g>
    </g>`;
}

/**
 * A palma.
 *
 * A borda de cima passa exatamente pela linha dos nós — é de lá que os
 * dedos saem, e uma palma mais alta que os pivôs engole a falange
 * proximal inteira e some com os nós.
 */
function palma() {
  const { topo, base, esquerda, direita } = PALMA;
  return `M ${direita - 30} ${base} `
    // Borda de fora, subindo do pulso até o nó do mindinho.
    + `C ${direita - 10} ${base - 42} ${direita} ${topo + 72} ${direita} ${topo + 30} `
    + `Q ${direita + 1} ${topo + 2} ${direita - 16} ${topo + 1} `
    // Linha dos nós, subindo de leve até o dedo médio.
    + `Q 226 ${topo - 8} 152 ${topo + 2} `
    + `Q ${esquerda} ${topo + 6} ${esquerda} ${topo + 32} `
    // Saliência tenar: a base do polegar é mais carnuda que o resto da
    // borda. Sem ela a palma vira um retângulo arredondado.
    + `C ${esquerda - 4} ${topo + 62} ${esquerda - 2} ${topo + 92} ${esquerda + 8} ${topo + 118} `
    + `C ${esquerda + 18} ${topo + 142} ${esquerda + 28} ${base - 12} ${esquerda + 36} ${base} Z`;
}

/** O antebraço: sai da base da palma e abre para fora, como um punho. */
function manga() {
  const { esquerda, direita, base } = PALMA;
  return `M 128 620 L ${esquerda + 10} ${base + 14} `
    + `Q ${esquerda + 26} ${base - 4} 226 ${base - 4} `
    + `Q ${direita - 26} ${base - 4} ${direita - 10} ${base + 14} L 316 620 Z`;
}

/** O punho da manga, a faixa escura onde o tecido dobra. */
function punhoDaManga() {
  const { esquerda, direita, base } = PALMA;
  return `M ${esquerda + 8} ${base + 6} `
    + `Q ${esquerda + 26} ${base - 8} 226 ${base - 8} `
    + `Q ${direita - 26} ${base - 8} ${direita - 8} ${base + 6} `
    + `L ${direita - 10} ${base + 30} `
    + `Q ${direita - 26} ${base + 16} 226 ${base + 16} `
    + `Q ${esquerda + 26} ${base + 16} ${esquerda + 10} ${base + 30} Z`;
}

/**
 * Desenha a mão. Toda a pele é composta por gradientes e filtros SVG —
 * nada de imagem externa, e portanto nada que dependa de asset de terceiro.
 */
export function markupDaMao() {
  const nomes = Object.keys(DEDOS);
  const juntas = (nome) => [`mcp${nome}`, `pip${nome}`, `dip${nome}`];

  return `
<svg class="mao__svg" viewBox="0 0 420 620" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="peleBase" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0"    stop-color="#f0c4a0"/>
      <stop offset="0.38" stop-color="#e0a980"/>
      <stop offset="0.72" stop-color="#c98d63"/>
      <stop offset="1"    stop-color="#a86f4a"/>
    </linearGradient>

    <linearGradient id="peleSombra" x1="0" y1="1" x2="0.2" y2="0">
      <stop offset="0"   stop-color="#8a5533" stop-opacity="0.55"/>
      <stop offset="1"   stop-color="#8a5533" stop-opacity="0"/>
    </linearGradient>

    <radialGradient id="peleLuz" cx="0.38" cy="0.28" r="0.5">
      <stop offset="0"   stop-color="#ffe6cf" stop-opacity="0.7"/>
      <stop offset="1"   stop-color="#ffe6cf" stop-opacity="0"/>
    </radialGradient>

    <linearGradient id="unhaGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0"   stop-color="#fdf3ec"/>
      <stop offset="0.6" stop-color="#f0d8c8"/>
      <stop offset="1"   stop-color="#d9b49c"/>
    </linearGradient>

    <linearGradient id="mangaGrad" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0"   stop-color="#1d4f9c"/>
      <stop offset="1"   stop-color="#2f6fc4"/>
    </linearGradient>

    <!-- Textura sutil de pele: ruído de baixíssima frequência, quase invisível,
         mas tira o aspecto de plástico liso das superfícies grandes. -->
    <filter id="texturaPele" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="ruido"/>
      <feColorMatrix in="ruido" type="saturate" values="0" result="cinza"/>
      <feComponentTransfer in="cinza" result="suave">
        <feFuncA type="linear" slope="0.06"/>
      </feComponentTransfer>
      <feComposite in="suave" in2="SourceGraphic" operator="over"/>
    </filter>
  </defs>

  <!-- Manga do antebraço: sai da base da palma e abre para fora. -->
  <path class="manga" d="${manga()}" fill="url(#mangaGrad)"/>
  <path class="manga__punho" d="${punhoDaManga()}" fill="#173f7d"/>

  <!-- Palma e seus detalhes -->
  <g ${MARCA_DE_JUNTA('curvaturaPalma')} ${origem('curvaturaPalma')}>
    <path class="palma" filter="url(#texturaPele)" d="${palma()}" fill="url(#peleBase)"/>
    <path class="palma__sombra" d="${palma()}" fill="url(#peleSombra)"/>
    <ellipse class="palma__luz" cx="196" cy="372" rx="70" ry="76" fill="url(#peleLuz)"/>

    <!-- Linhas de tendão, do nó em direção ao pulso -->
    <g class="tendoes" stroke="#9c6642" stroke-width="1.6" fill="none" opacity="0.2">
      <path d="M 178 316 q -4 42 -6 76"/>
      <path d="M 213 306 q -2 44 -4 78"/>
      <path d="M 250 307 q 2 42 2 76"/>
    </g>

    <!-- Vincos da palma -->
    <g class="vincos" stroke="#8a5533" stroke-width="2.2" fill="none" opacity="0.16">
      <path d="M 162 398 q 54 18 108 -4"/>
      <path d="M 164 430 q 52 14 104 -6"/>
    </g>

    ${polegar()}
    ${nomes.map((nome) => dedo(nome, juntas(nome))).join('')}
  </g>
</svg>`;
}

export function markupDaSombra() {
  return `
<div class="mao__sombra" data-sombra>
  <div class="mao__sombra-elipse"></div>
</div>`;
}

/**
 * Renderizador SVG da mão.
 *
 * Implementa a interface HandRenderer: { el, sombra, aplicarPose, posicionar }.
 * Um futuro `criarMaoSprite()` implementa a mesma interface lendo quadros PNG,
 * e a coreografia não precisa mudar.
 */
export function criarMaoSvg() {
  const el = document.createElement('div');
  el.className = 'mao';
  el.innerHTML = markupDaMao();

  // A âncora da mão. O CSS gira e escala em torno deste ponto, e o ator
  // escreve nele a posição que quer tocar — então ele é a única ligação
  // entre "onde a mão está" e "onde o dedo está", e por isso vem da
  // geometria do desenho em vez de ser um número solto no CSS.
  el.style.setProperty('--ponta-x', `${PONTA.x}px`);
  el.style.setProperty('--ponta-y', `${PONTA.y}px`);

  const sombra = document.createElement('div');
  sombra.innerHTML = markupDaSombra();
  const sombraEl = sombra.firstElementChild;
  // A sombra usa a mesma âncora: as duas precisam compartilhar o sistema
  // de coordenadas, senão a elipse descola da mão quando ela se move.
  sombraEl.style.setProperty('--ponta-x', `${PONTA.x}px`);
  sombraEl.style.setProperty('--ponta-y', `${PONTA.y}px`);

  // Guarda as referências uma única vez — consultar o DOM a cada frame
  // seria caro numa live de horas.
  const grupos = {};
  for (const junta of JUNTAS) {
    grupos[junta] = el.querySelector(`[data-junta="${junta}"]`);
  }

  return {
    el,
    sombra: sombraEl,

    aplicarPose(pose) {
      const transforms = poseParaTransformacoes(pose);
      for (const junta of JUNTAS) {
        const g = grupos[junta];
        if (g && transforms[junta]) g.style.transform = transforms[junta];
      }
    },

    /** Posiciona a mão e a sombra. `altura` acima de 0 afasta a sombra. */
    posicionar(x, y, { rot = 0, escala = 1, altura = 0 } = {}) {
      el.style.setProperty('--x', `${x}px`);
      el.style.setProperty('--y', `${y}px`);
      el.style.setProperty('--rot', `${rot}deg`);
      el.style.setProperty('--escala', String(escala));

      sombraEl.style.setProperty('--sx', `${x + altura * 0.35}px`);
      sombraEl.style.setProperty('--sy', `${y + 10 + altura * 0.5}px`);
      sombraEl.style.setProperty('--rot', `${rot}deg`);
      sombraEl.style.setProperty('--sombra-escala', String(escala * (1 + altura * 0.002)));
      sombraEl.style.setProperty('--sombra-blur', `${14 + altura * 0.12}px`);
      sombraEl.style.setProperty('--sombra-opacidade', String(Math.max(0.12, 0.75 - altura * 0.004)));
    },
  };
}
