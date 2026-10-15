import { JUNTAS, poseParaTransformacoes } from './poses.js';
import { OSSOS, PIVOS, PONTAS, ANCORA, DEDOS, PALMA } from './esqueleto.js';

export { PIVOS, PONTAS, PONTA, ANCORA, OSSOS, DEDOS, PALMA } from './esqueleto.js';

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
  /*
   * O bojo das duas pontas, e por que eles são diferentes.
   *
   * A ponta do dedo é uma meia-volta. Na quadrática que vai de uma borda à
   * outra, o ápice cai na METADE da distância até o ponto de controle — em
   * `k = 0.42 · largura` o ápice ficava a só 0,21 · largura do fim, um
   * tampão quase reto. Era isso que fazia cada dedo parecer um pino de
   * plástico com uma tampa elíptica, e é o defeito que a captura de 2x da
   * mão sobre a tecla mostrou. Com `k = largura` o ápice cai em meia
   * largura: a meia-circunferência de um dedo.
   *
   * A base continua com o bojo pequeno. Ele existe só para passar para trás
   * do pivô e cobrir a junta quando o dedo dobra; um bojo grande ali
   * engordaria a raiz, que é justamente onde quatro dedos já estão
   * encostados um no outro.
   */
  const kPonta = osso.largura;
  const kBase = osso.largura * 0.42;

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
    + `Q ${xy(t.x + dx * kPonta, t.y + dy * kPonta)} ${xy(t.x - hx, t.y - hy)} `
    + `L ${xy(p.x - hx, p.y - hy)} `
    + `Q ${xy(p.x - dx * kBase, p.y - dy * kBase)} ${xy(p.x + hx, p.y + hy)} Z"/>`;
}

/**
 * A unha, no dorso da última falange e alinhada com o eixo do osso.
 *
 * Pequena e PARA DENTRO de propósito. A unha já foi desenhada encostada na
 * ponta (`0,38 · largura` atrás dela) e grande o bastante para alcançar a
 * tampa do dedo: o resultado, na captura de 2x, foi uma pastilha clara
 * centrada no fim de cada falange, que o olho leu como rótula de boneco —
 * o oposto do que a unha deveria fazer. Aqui ela fica a `0,62 · largura`
 * da ponta, inteira dentro da falange distal, e o desenho da ponta
 * arredondada faz o resto do trabalho de dizer "isto é um dedo".
 */
function unha(osso) {
  const r = (osso.angulo * Math.PI) / 180;
  const cx = osso.ponta.x - Math.cos(r) * osso.largura * 0.62;
  const cy = osso.ponta.y - Math.sin(r) * osso.largura * 0.62;
  return `<ellipse class="unha" cx="${n(cx)}" cy="${n(cy)}" `
    + `rx="${n(osso.largura * 0.17)}" ry="${n(osso.largura * 0.24)}" `
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

/**
 * O antebraço: sai da base da palma e desce até sair de cena.
 *
 * A manga terminava em `y = 620`, a borda do viewBox, e como a mão é
 * ancorada pela PONTA DO DEDO, esse corte caía cerca de 470 unidades
 * abaixo da ponta — no meio do quadro, com a urna inteira ainda visível
 * embaixo. O braço não terminava em lugar nenhum: aparecia uma faixa azul
 * de aresta dura flutuando no ar, que é o detalhe que mais grita "montagem"
 * numa transmissão.
 *
 * O path agora passa de 1500 unidades. O `.mao__svg` tem `overflow:
 * visible`, então ele é pintado para fora do viewBox e quem corta é a borda
 * do palco — ou seja, o braço sai de cena em qualquer posição em que a mão
 * esteja sobre a urna. A barra abre de leve para baixo: é o antebraço
 * chegando perto da câmera, e sem essa abertura a manga lê como um cano.
 */
function manga() {
  const { esquerda, direita, base } = PALMA;
  return `M 116 1500 L ${esquerda + 10} ${base + 14} `
    + `Q ${esquerda + 26} ${base - 4} 226 ${base - 4} `
    + `Q ${direita - 26} ${base - 4} ${direita - 10} ${base + 14} L 324 1500 Z`;
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

/**
 * A etiqueta com o nome de quem está votando.
 *
 * Sem ela, uma mão anônima descendo sobre a urna é a máquina votando sozinha
 * — e a graça da cena é justamente o contrário: alguém mandou um presente e
 * está ali depositando o voto. O nome na tela é o que transforma o
 * espectador em autor do que ele está vendo.
 *
 * O nome é escrito com `textContent`, nunca com `innerHTML`: é o apelido de
 * uma pessoa na internet, e é a única string desta cena que vem de fora sem
 * passar por um desenho nosso.
 */
export function markupDoBadge() {
  return `
<div class="mao__badge" data-badge>
  <span class="mao__badge-nome" data-badge-nome></span>
</div>`;
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
  el.style.setProperty('--ponta-x', `${ANCORA.x}px`);
  el.style.setProperty('--ponta-y', `${ANCORA.y}px`);

  const sombra = document.createElement('div');
  sombra.innerHTML = markupDaSombra();
  const sombraEl = sombra.firstElementChild;
  // A sombra usa a mesma âncora: as duas precisam compartilhar o sistema
  // de coordenadas, senão a elipse descola da mão quando ela se move.
  sombraEl.style.setProperty('--ponta-x', `${ANCORA.x}px`);
  sombraEl.style.setProperty('--ponta-y', `${ANCORA.y}px`);

  // Guarda as referências uma única vez — consultar o DOM a cada frame
  // seria caro numa live de horas.
  const grupos = {};
  for (const junta of JUNTAS) {
    grupos[junta] = el.querySelector(`[data-junta="${junta}"]`);
  }

  const badge = document.createElement('div');
  badge.innerHTML = markupDoBadge();
  const badgeEl = badge.firstElementChild;
  const badgeNome = badgeEl.querySelector('[data-badge-nome]');
  // Medidas em `mostrarBadge`, quando o nome (e portanto a largura) já existe.
  let largura = 0;
  let larguraDoPalco = 0;

  return {
    el,
    sombra: sombraEl,
    badge: badgeEl,

    /**
     * A etiqueta com o nome de quem mandou o presente.
     *
     * `nome` vazio não mostra etiqueta nenhuma, e é de propósito: no modo
     * lote — a rajada — não há um espectador por voto para nomear, e inventar
     * "Espectador" ali seria a tela afirmando uma autoria que ela não tem.
     */
    mostrarBadge(nome, cor) {
      const limpo = String(nome ?? '').trim();
      if (!limpo) return;
      badgeNome.textContent = limpo;
      badgeEl.style.setProperty('--cor-urna', cor ?? '#39435c');
      badgeEl.classList.add('mao__badge--visivel');

      /*
       * A largura da etiqueta é medida UMA vez, aqui.
       *
       * Ela depende do nome, que só se sabe agora, e o `posicionar` roda a
       * cada quadro: medir lá dentro seria uma leitura de layout por quadro,
       * que é justamente o que trava a animação. Medida uma vez, o
       * `posicionar` só faz conta.
       *
       * `offsetWidth` funciona com a etiqueta ainda transparente — opacidade
       * zero não tira o elemento do layout, e é por isso que a entrada é um
       * `transition` de opacidade e não um `display`.
       */
      largura = badgeEl.offsetWidth;
      larguraDoPalco = badgeEl.offsetParent?.offsetWidth ?? 0;
    },

    esconderBadge() {
      badgeEl.classList.remove('mao__badge--visivel');
    },

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

      /*
       * A etiqueta anda junto, mas NÃO herda rotação nem escala.
       *
       * Ela é irmã da mão, e não filha, exatamente por isso: dentro de
       * `.mao` o nome giraria com o pulso e encolheria para 0,8 — ilegível
       * justo no quadro em que a mão está sobre a tecla, que é quando ele
       * precisa ser lido. Aqui ele é posicionado à mão, mas desenhado no
       * tamanho da transmissão.
       *
       * A etiqueta fica AO LADO da mão, na altura do dedo — não acima dele.
       *
       * Acima foi a primeira tentativa, e a captura de tela mostrou o
       * defeito: o dedo digita a cerca de 950 de altura, e 140 acima disso
       * cai dentro da faixa do placar. Como o placar é uma camada mais alta
       * (z 60 contra 40), a etiqueta era desenhada ATRÁS dos cartões e
       * aparecia cortada ao meio entre um e outro. Não havia erro nenhum no
       * DOM: a etiqueta estava lá, com o nome certo e a classe de visível —
       * só não dava para ler.
       *
       * Do lado esquerdo, ela não disputa com o placar nem com o teclado: a
       * mão desenhada ocupa a partir de 94 unidades à esquerda da ponta
       * (a escala de 0,8 sobre a âncora), então 110 é o primeiro ponto livre
       * depois do dedo. O `translate(-100%)` no CSS pendura a etiqueta pela
       * borda direita, de modo que ela cresce para a esquerda conforme o
       * nome, sem nunca encostar na mão.
       *
       * O limite existe para dois casos reais: a mão da urna da ESQUERDA
       * digita perto da borda, e um apelido longo empurraria a etiqueta para
       * fora do enquadramento. Presa dentro do palco, ela desliza o
       * necessário — e a cor da urna continua dizendo de quem é.
       */
      const margem = 24;
      const bruto = x - 110;
      const bx = larguraDoPalco
        ? Math.min(Math.max(bruto, margem + largura), larguraDoPalco - margem)
        : bruto;
      badgeEl.style.setProperty('--bx', `${bx}px`);
      badgeEl.style.setProperty('--by', `${y + 30}px`);
    },
  };
}
