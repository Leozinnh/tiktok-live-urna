import { JUNTAS, poseParaTransformacoes } from './poses.js';

export const MARCA_DE_JUNTA = (nome) => `data-junta="${nome}"`;

/**
 * O pivô de cada junta, em coordenadas do viewBox (420x620).
 *
 * Esta tabela é a ÚNICA fonte de verdade da articulação: o desenho da
 * falange sai daqui e a origem de rotação também. Quando os dois viviam
 * separados — geometria no JS, `transform-origin` no CSS — bastava um
 * ajuste de desenho para o dedo passar a girar em torno do ponto errado,
 * e o sintoma é o dedo deslizar em vez de dobrar. Isso não quebra teste
 * nenhum, só estraga a mão na tela.
 */
export const PIVOS = Object.freeze({
  mcpIndicador: { x: 214, y: 264 }, pipIndicador: { x: 214, y: 200 }, dipIndicador: { x: 214, y: 152 },
  mcpMedio:     { x: 244, y: 258 }, pipMedio:     { x: 244, y: 192 }, dipMedio:     { x: 244, y: 142 },
  mcpAnel:      { x: 272, y: 262 }, pipAnel:      { x: 272, y: 200 }, dipAnel:      { x: 272, y: 154 },
  mcpMindinho:  { x: 296, y: 274 }, pipMindinho:  { x: 296, y: 222 }, dipMindinho:  { x: 296, y: 186 },
  mcpPolegar:   { x: 156, y: 268 },
  ipPolegar:    { x: 108, y: 332 },
  curvaturaPalma: { x: 216, y: 460 },
});

/** A origem de rotação escrita no próprio grupo, casada com PIVOS. */
const origem = (junta) =>
  `style="transform-origin: ${PIVOS[junta].x}px ${PIVOS[junta].y}px"`;

/**
 * Uma falange: começa na junta de cima do grupo e sobe até a junta seguinte.
 * Os dois cantos de baixo são arredondados para o dedo não virar um retângulo.
 */
function falange(pivo, largura, yFim) {
  const x = pivo.x - largura / 2;
  const altura = yFim - pivo.y;              // negativo: a falange sobe
  return `<path class="falange" fill="url(#peleBase)" `
    + `d="M ${x} ${pivo.y} q ${largura / 2} -18 ${largura} 0 l 0 ${altura} `
    + `q ${-largura / 2} -14 ${-largura} 0 z"/>`;
}

/**
 * Um dedo é uma cadeia de grupos aninhados: mcp > pip > dip.
 * Girar o grupo externo move tudo o que está dentro, como uma falange real.
 */
function dedo(nome, largura) {
  const mcp = PIVOS[`mcp${nome}`];
  const pip = PIVOS[`pip${nome}`];
  const dip = PIVOS[`dip${nome}`];
  return `
    <g ${MARCA_DE_JUNTA(`mcp${nome}`)} ${origem(`mcp${nome}`)}>
      ${falange(mcp, largura, pip.y)}
      <g ${MARCA_DE_JUNTA(`pip${nome}`)} ${origem(`pip${nome}`)}>
        ${falange(pip, largura * 0.94, dip.y)}
        <g ${MARCA_DE_JUNTA(`dip${nome}`)} ${origem(`dip${nome}`)}>
          ${falange(dip, largura * 0.88, dip.y - 34)}
          <ellipse class="unha" cx="${mcp.x}" cy="${dip.y - 16}"
                   rx="${largura * 0.30}" ry="15" fill="url(#unhaGrad)"/>
        </g>
      </g>
    </g>`;
}

/**
 * Desenha a mão. Toda a pele é composta por gradientes e filtros SVG —
 * nada de imagem externa, e portanto nada que dependa de asset de terceiro.
 *
 * Convenção: viewBox 420x620. O pulso fica embaixo (~y=460) e os dedos
 * apontam para cima, porque a mão vem de baixo da tela.
 */
export function markupDaMao() {
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

  <!-- Manga do antebraço -->
  <path class="manga" d="M 130 620 L 130 470 q 80 -26 160 0 L 290 620 z" fill="url(#mangaGrad)"/>
  <path class="manga__punho" d="M 130 476 q 80 -26 160 0 l 0 14 q -80 -26 -160 0 z" fill="#173f7d"/>

  <!-- Palma -->
  <g ${MARCA_DE_JUNTA('curvaturaPalma')} ${origem('curvaturaPalma')}>
    <path class="palma" filter="url(#texturaPele)"
          d="M 140 460 q -10 -110 14 -190 q 70 -30 140 0 q 24 80 14 190 q -84 30 -168 0 z"
          fill="url(#peleBase)"/>
    <path class="palma__sombra" d="M 140 460 q -10 -110 14 -190 q 70 -30 140 0 q 24 80 14 190 q -84 30 -168 0 z"
          fill="url(#peleSombra)"/>
    <ellipse class="palma__luz" cx="196" cy="330" rx="76" ry="96" fill="url(#peleLuz)"/>

    <!-- Linhas de tendão no dorso -->
    <g class="tendoes" stroke="#9c6642" stroke-width="1.6" fill="none" opacity="0.20">
      <path d="M 196 430 q -6 -70 -2 -124"/>
      <path d="M 226 428 q 4 -68 0 -120"/>
      <path d="M 254 432 q 8 -64 6 -116"/>
    </g>

    <!-- Vincos da palma -->
    <g class="vincos" stroke="#8a5533" stroke-width="2.2" fill="none" opacity="0.16">
      <path d="M 168 392 q 46 18 92 -2"/>
      <path d="M 172 424 q 44 14 88 -4"/>
    </g>

    <!-- Polegar -->
    <g ${MARCA_DE_JUNTA('mcpPolegar')} ${origem('mcpPolegar')}>
      <path class="falange" fill="url(#peleBase)" d="M 156 268 q -34 26 -48 62 q 22 14 42 2 q 22 -30 34 -54 z"/>
      <g ${MARCA_DE_JUNTA('ipPolegar')} ${origem('ipPolegar')}>
        <path class="falange" fill="url(#peleBase)" d="M 108 332 q -30 22 -42 54 q 20 12 38 0 q 18 -26 30 -46 z"/>
        <ellipse class="unha" cx="82" cy="378" rx="13" ry="17" fill="url(#unhaGrad)" transform="rotate(-36 82 378)"/>
      </g>
    </g>

    <!-- Quatro dedos. Os pivôs saem de PIVOS, os mesmos da origem de rotação. -->
    ${dedo('Indicador', 56)}
    ${dedo('Medio',     58)}
    ${dedo('Anel',      54)}
    ${dedo('Mindinho',  46)}

    <!-- Oclusão entre os dedos: sombras finas onde um dedo encosta no outro -->
    <g class="oclusao" fill="#7a4a2c" opacity="0.18">
      <rect x="240" y="186" width="3" height="80" rx="1.5"/>
      <rect x="268" y="190" width="3" height="76" rx="1.5"/>
      <rect x="292" y="204" width="3" height="70" rx="1.5"/>
    </g>
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

  const sombra = document.createElement('div');
  sombra.innerHTML = markupDaSombra();
  const sombraEl = sombra.firstElementChild;

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
        if (g) g.style.transform = transforms[junta];
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
