import { JUNTAS, poseParaTransformacoes } from './poses.js';
import { OSSOS, PIVOS, PONTAS, ANCORA, DEDOS, PALMA } from './esqueleto.js';

export { PIVOS, PONTAS, PONTA, ANCORA, OSSOS, DEDOS, PALMA } from './esqueleto.js';

export const MARCA_DE_JUNTA = (nome) => `data-junta="${nome}"`;

/** A origem de rotação escrita no próprio grupo, casada com PIVOS. */
const origem = (junta) =>
  `style="transform-origin: ${PIVOS[junta].x}px ${PIVOS[junta].y}px"`;

const n = (v) => Math.round(v * 100) / 100;

/** Um par de coordenadas como o SVG o escreve. */
const xy = (x, y) => `${n(x)} ${n(y)}`;

/**
 * Uma falange desenhada ao longo de um eixo qualquer.
 *
 * O eixo é o do osso — os quatro dedos sobem reto e o polegar sai de
 * lado, então uma função que só desenha na vertical não serviria para o
 * polegar. As duas pontas são arredondadas e a da base passa para TRÁS do
 * pivô: é esse bojo que cobre a junta, e sem ele dobrar o dedo abre uma
 * fenda entre uma falange e a seguinte.
 */
function eixoDaFalange(osso) {
  const r = (osso.angulo * Math.PI) / 180;
  const dx = Math.cos(r);
  const dy = Math.sin(r);
  return {
    p: osso.raiz,
    t: osso.ponta,
    dx,
    dy,
    // O semi-vector perpendicular ao osso: metade de uma borda à outra.
    hx: (-dy * osso.largura) / 2,
    hy: (dx * osso.largura) / 2,
    largura: osso.largura,
  };
}

/** O contorno de uma falange, com os bojos das duas pontas. */
function contorno(osso) {
  const { p, t, dx, dy, hx, hy, largura } = eixoDaFalange(osso);
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
  const kPonta = largura;
  const kBase = largura * 0.42;

  // Um comando por linha, com exatamente a aridade que ele aceita: `M` e
  // `L` levam um par, `Q` leva dois. Passar um par a mais num `Q` não dá
  // erro — o SVG repete o comando e come o par seguinte, e a falange sai
  // como uma cunha em vez de um retângulo de pontas redondas.
  return `M ${xy(p.x + hx, p.y + hy)} `
    + `L ${xy(t.x + hx, t.y + hy)} `
    + `Q ${xy(t.x + dx * kPonta, t.y + dy * kPonta)} ${xy(t.x - hx, t.y - hy)} `
    + `L ${xy(p.x - hx, p.y - hy)} `
    + `Q ${xy(p.x - dx * kBase, p.y - dy * kBase)} ${xy(p.x + hx, p.y + hy)} Z`;
}

/** O recorte de uma costura, na silhueta do nó que ela separa. */
const clipDaCostura = (osso) =>
  `<clipPath id="recorte_${osso.nome}"><path d="${contorno(osso)}"/></clipPath>`;

/**
 * O vinco da junta: a dobra onde a falange encontra a anterior.
 *
 * Ele é uma LENTE, e não um traço, por um motivo geométrico: as duas pontas
 * da lente caem exatamente sobre as bordas do osso (os mesmos `p ± h` do
 * contorno), então ela está dentro da silhueta por construção e não precisa
 * de recorte. Um traço reto de borda a borda teria as pontas para fora do
 * dedo — que é o defeito que as costuras faziam, e o motivo de elas terem
 * sido recortadas em `dedo()`.
 *
 * O bojo aponta para a PONTA: a dobra de um dedo é mais funda do lado que
 * estica.
 */
function vinco(osso) {
  const { p, dx, dy, hx, hy, largura } = eixoDaFalange(osso);
  const b = largura * 0.42;
  return `<path class="falange__vinco" fill="#8a5533" fill-opacity="0.3" `
    + `d="M ${xy(p.x + hx, p.y + hy)} `
    + `Q ${xy(p.x + dx * b, p.y + dy * b)} ${xy(p.x - hx, p.y - hy)} `
    + `Q ${xy(p.x + dx * b * 0.3, p.y + dy * b * 0.3)} ${xy(p.x + hx, p.y + hy)} Z"/>`;
}

/**
 * Uma falange: o corpo, o volume e — nos nós que dobram — o vinco.
 *
 * `comVinco` falso fica para a falange proximal, cuja raiz é a linha dos
 * nós: ali quem desenha a dobra é a oclusão da palma (o grupo `nos`), e um
 * vinco em cima dela seria a mesma sombra duas vezes.
 */
function falange(osso, gradVolume = 'peleVolume', comVinco = true) {
  const d = contorno(osso);
  return `<path class="falange" fill="url(#peleBase)" `
    + `data-osso="${osso.nome}" data-de="${n(osso.raiz.x)},${n(osso.raiz.y)}" `
    + `data-ate="${n(osso.ponta.x)},${n(osso.ponta.y)}" `
    + `d="${d}"/>`
    + `<path class="falange__volume" fill="url(#${gradVolume})" d="${d}"/>`
    + (comVinco ? vinco(osso) : '');
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
  const cx = osso.ponta.x - Math.cos(r) * osso.largura * 0.56;
  const cy = osso.ponta.y - Math.sin(r) * osso.largura * 0.56;
  return `<ellipse class="unha" cx="${n(cx)}" cy="${n(cy)}" `
    + `rx="${n(osso.largura * 0.19)}" ry="${n(osso.largura * 0.31)}" `
    + `transform="rotate(${n(osso.angulo + 90)} ${n(cx)} ${n(cy)})" fill="url(#unhaGrad)"/>`;
}

/**
 * Um dedo é uma cadeia de grupos aninhados: mcp > pip > dip.
 * Girar o grupo externo move tudo o que está dentro, como uma falange real.
 * O osso de cada grupo é desenhado aqui mesmo, então o desenho e o pivô
 * vêm da mesma entrada de OSSOS — não há como divergirem.
 */
function dedo(nome, juntas, temVizinho = true) {
  const ossosDoDedo = juntas.map((j) => OSSOS.find((o) => o.de === j));
  const [mcp, pip, dip] = juntas;
  const ossoMcp = ossosDoDedo[0];
  const ossoPip = ossosDoDedo[1];
  const ossoDip = ossosDoDedo[2];

  /*
   * Sombra de contato na borda interna do dedo: sem ela, dois dedos
   * encostados viram uma superfície só e a mão perde a leitura de "quatro
   * dedos". Fica dentro do grupo do nó para acompanhar o dedo ao dobrar.
   *
   * O indicador NÃO tem essa costura, e é o `temVizinho` que decide: ele é
   * o primeiro da fila, e do lado esquerdo dele não tem dedo nenhum — tem o
   * fundo da cena. A costura era desenhada em todos, e na captura de 2x ela
   * aparecia como um fio solto correndo ao lado do indicador, por fora da
   * silhueta da mão. Sombra de contato sem contato é sujeira.
   */
  const cs = ossoMcp.raiz.x - ossoMcp.largura / 2;
  /*
   * A costura vai RECORTADA na falange que ela separa.
   *
   * Ela era um traço reto do fundo do nó até doze unidades acima da ponta
   * do osso — no papel, um fio entre dois dedos; na tela, um risco de 4px
   * atravessando o dedo inteiro. Num dedo dobrado a conta piora: o traço é
   * desenhado no referencial do nó e não acompanha a dobra das falanges
   * seguintes, então ele sai pela lateral do dedo e vai parar em cima do
   * dedo VIZINHO, que é pintado antes. A captura de 2x mostrou três riscos
   * retos cruzando a mão — e um deles atravessava dois dedos.
   *
   * Recortada no contorno do próprio nó, ela volta a ser o que o gradiente
   * `sombraCostura` descreve: escura na raiz, dissolvida para cima. Não
   * precisa de mais nada — quem separa os dedos dali para cima são a
   * oclusão dos nós e o vinco de cada junta.
   */
  const costura = !temVizinho ? '' : `<g clip-path="url(#recorte_${ossoMcp.nome})">`
    + `<path class="costura" d="M ${n(cs)} ${n(ossoMcp.raiz.y + 16)} `
    + `L ${n(cs)} ${n(ossoMcp.raiz.y - ossoMcp.comprimento - 12)}" `
    + `stroke="url(#sombraCostura)" stroke-width="4" stroke-linecap="round" fill="none"/>`
    + '</g>';

  return `
    <g ${MARCA_DE_JUNTA(mcp)} ${origem(mcp)}>
      ${falange(ossoMcp, 'peleVolume', false)}
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
      ${falange(ossoA, 'peleVolumePolegar')}
      <g ${MARCA_DE_JUNTA('ipPolegar')} ${origem('ipPolegar')}>
        ${falange(ossoB, 'peleVolumePolegar')}
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

/**
 * As dobras do tecido, no caminho do braço.
 *
 * Sem elas a manga é uma faixa azul lisa de mil unidades de altura, e uma
 * faixa lisa deste tamanho não lê como tecido: lê como um cano pintado. As
 * dobras são arcos que bojudam para BAIXO — é para onde a pele do tecido
 * cede quando o braço desce, e é o que diz de que lado está o peso.
 *
 * A largura de cada arco é a da manga naquela altura, calculada da mesma
 * reta que desenha a silhueta: `mangaEm(y)` interpola entre a boca (na base
 * da palma) e o corte de baixo. Escritas à mão, três dobras desalinhavam da
 * borda na primeira vez que alguém mexesse na abertura do braço.
 */
const mangaEm = (y) => {
  const { esquerda, direita, base } = PALMA;
  const t = Math.min(1, Math.max(0, (y - (base + 14)) / (1500 - (base + 14))));
  return { esq: esquerda + 10 + (116 - esquerda - 10) * t, dir: direita - 10 + (324 - direita + 10) * t };
};

function dobrasDaManga() {
  const alturas = [600, 740, 900, 1100];
  return `<g class="manga__dobras" fill="none" stroke="#0d2650" stroke-opacity="0.26" `
    + `stroke-width="3" stroke-linecap="round" clip-path="url(#recorteBraco)">`
    + alturas.map((y, i) => {
      const { esq, dir } = mangaEm(y);
      // As pontas encostam nas bordas: o arco atravessa o braço de lado a lado,
      // que é como uma dobra de tecido aparece de frente.
      const recuo = 6 + i * 2;
      return `<path d="M ${n(esq + recuo)} ${y} Q ${n((esq + dir) / 2)} ${y + 26} ${n(dir - recuo)} ${y}"/>`;
    }).join('')
    + '</g>';
}

/**
 * O punho da manga, a faixa escura onde o tecido dobra.
 *
 * Ele é mais escuro que a manga inteira, e não só uma borda: é o vão entre
 * o tecido e o braço, onde a luz não entra. O fio claro de cima é o
 * contrário — é a dobra do tecido apanhando a lâmpada, e é ele que separa a
 * manga da pele do punho sem precisar de contorno.
 */
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
    <!--
      A pele, com UMA luz para a mão inteira.

      O gradiente era objectBoundingBox (o padrão), e isso quer dizer o
      seguinte: cada falange, cada palma e cada osso do polegar tinham o
      próprio degradê, do canto claro ao canto escuro DE SI MESMOS. O
      resultado, na tela, era uma mão feita de treze pastilhas de plástico
      com a mesma luz cada uma — a lâmpada da sala estava em treze lugares
      ao mesmo tempo, e não havia sombra que ligasse um dedo ao vizinho.
      Era esse o "rústico": não o traço, a LUZ.

      Com userSpaceOnUse o eixo é um só, escrito em unidades do viewBox
      (0 0 420 620) e portanto parado em relação ao desenho: claro na ponta
      do indicador, escuro na borda do mindinho e no punho — a mesma
      direção da lâmpada que acende o tampo da urna e clareia a lateral
      esquerda do gabinete (luz de cima e da esquerda, à frente da mesa).

      O preço está dito: dentro de um grupo girado, userSpaceOnUse vale no
      sistema de coordenadas local, então um dedo que dobra leva um pouco da
      própria luz junto. Aparece só durante a flexão, e some no repouso, que
      é onde a mão passa a maior parte da cena — ao contrário do defeito
      anterior, que estava em todo quadro parado.
    -->
    <linearGradient id="peleBase" gradientUnits="userSpaceOnUse"
      x1="86" y1="128" x2="346" y2="566">
      <stop offset="0"    stop-color="#f6d0ad"/>
      <stop offset="0.30" stop-color="#e8b48c"/>
      <stop offset="0.66" stop-color="#c98d63"/>
      <stop offset="1"    stop-color="#a86f4a"/>
    </linearGradient>

    <!--
     * A oclusão dos nós: a sombra que a palma faz na raiz dos dedos, e que
     * os dedos fazem uns nos outros.
     *
     * Sem ela os quatro dedos saíam da mão como quatro pinos de um mesmo
     * bloco, sem dobra nenhuma na linha dos nós. É a única mancha do
     * desenho que não vem de uma superfície — vem do vão entre duas.
     -->
    <!--
     * O VOLUME de cada falange: o degrau que faz o dedo ser um cilindro.
     *
     * A luz única (peleBase, acima) resolve o "de onde vem a luz", mas
     * sozinha ela deixa cada dedo chapado: um dedo é um tubo, e um tubo
     * aceso de lado tem a borda clara, o meio aceso e a borda oposta caindo
     * para a sombra. Sem isso a captura de 2x mostrou treze cápsulas de
     * plástico da mesma cor — que é o "rústico" de novo, um degrau abaixo.
     *
     * Ele é uma SEGUNDA passada sobre a mesma falange, e não o
     * preenchimento dela, porque assim a luz geral e o volume somam em vez
     * de um substituir o outro. E o efeito colateral é bem-vindo: como cada
     * falange escurece nas duas bordas, a emenda entre uma e a seguinte
     * fica escura sozinha — a dobra do nó, que é exatamente onde ela deve
     * estar.
     -->
    <linearGradient id="peleVolume" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0"    stop-color="#a86f4a" stop-opacity="0.38"/>
      <stop offset="0.18" stop-color="#a86f4a" stop-opacity="0.02"/>
      <stop offset="0.44" stop-color="#8a5533" stop-opacity="0.10"/>
      <stop offset="1"    stop-color="#5f3419" stop-opacity="0.58"/>
    </linearGradient>

    <!-- O vinco do nó: uma lente escura atravessada no eixo do dedo, com as
         pontas dissolvidas para não virar um risco. -->
    <linearGradient id="vincoNo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0"   stop-color="#8a5533" stop-opacity="0"/>
      <stop offset="0.42" stop-color="#7d4b2c" stop-opacity="0.52"/>
      <stop offset="0.62" stop-color="#7d4b2c" stop-opacity="0.34"/>
      <stop offset="1"   stop-color="#8a5533" stop-opacity="0"/>
    </linearGradient>

    <!-- A mesma passada no polegar, com o eixo girado: o osso dele aponta
         para -138°, então o x do bounding box não atravessa o dedo — o
         gradientTransform põe o degradê de través nele. -->
    <linearGradient id="peleVolumePolegar" x1="0" y1="0" x2="1" y2="0"
      gradientTransform="rotate(-48 0.5 0.5)">
      <stop offset="0"    stop-color="#a86f4a" stop-opacity="0.34"/>
      <stop offset="0.20" stop-color="#a86f4a" stop-opacity="0.02"/>
      <stop offset="0.52" stop-color="#8a5533" stop-opacity="0.06"/>
      <stop offset="1"    stop-color="#6f4023" stop-opacity="0.46"/>
    </linearGradient>

    <radialGradient id="peleOclusao">
      <stop offset="0"   stop-color="#7d4b2c" stop-opacity="0.55"/>
      <stop offset="0.55" stop-color="#7d4b2c" stop-opacity="0.24"/>
      <stop offset="1"   stop-color="#7d4b2c" stop-opacity="0"/>
    </radialGradient>

    <!-- A costura entre dois dedos: preta na raiz, inexistente na ponta.
         Dois dedos encostados se tocam em baixo e se separam em cima. -->
    <linearGradient id="sombraCostura" gradientUnits="userSpaceOnUse"
      x1="0" y1="320" x2="0" y2="200">
      <stop offset="0"   stop-color="#6f4023" stop-opacity="0.55"/>
      <stop offset="0.5" stop-color="#6f4023" stop-opacity="0.22"/>
      <stop offset="1"   stop-color="#6f4023" stop-opacity="0"/>
    </linearGradient>

    <!-- A mancha do punho: a mão encosta na manga e escurece o tecido. -->
    <radialGradient id="sombraPunho">
      <stop offset="0"   stop-color="#0d2650" stop-opacity="0.60"/>
      <stop offset="0.6" stop-color="#0d2650" stop-opacity="0.26"/>
      <stop offset="1"   stop-color="#0d2650" stop-opacity="0"/>
    </radialGradient>

    <linearGradient id="peleSombra" x1="0" y1="1" x2="0.2" y2="0">
      <stop offset="0"   stop-color="#8a5533" stop-opacity="0.55"/>
      <stop offset="1"   stop-color="#8a5533" stop-opacity="0"/>
    </linearGradient>

    <!-- O brilho do dorso da mão. Ele era de 0,7 e do tamanho da palma
         inteira: a mão virava um balão de luz com a borda escura. Aqui ele
         fica no lado da lâmpada (a metade do indicador) e mais fraco, que é
         o que um dorso de mão devolve. -->
    <radialGradient id="peleLuz" cx="0.42" cy="0.32" r="0.5">
      <stop offset="0"   stop-color="#ffe6cf" stop-opacity="0.46"/>
      <stop offset="1"   stop-color="#ffe6cf" stop-opacity="0"/>
    </radialGradient>

    <!-- A borda do mindinho: por onde a mão vira as costas para a lâmpada.
         É uma segunda passada sobre o contorno da palma, e não uma borda
         escura no mesmo preenchimento — assim ela some sozinha na direção
         do pulso, sem aresta. -->
    <linearGradient id="sombraBorda" gradientUnits="userSpaceOnUse"
      x1="244" y1="0" x2="322" y2="0">
      <stop offset="0"   stop-color="#8a5533" stop-opacity="0"/>
      <stop offset="0.6" stop-color="#7d4b2c" stop-opacity="0.22"/>
      <stop offset="1"   stop-color="#6f4023" stop-opacity="0.40"/>
    </linearGradient>

    <!--
     * A unha, do eixo da falange: quente e opaca na cutícula, clara e
     * translúcida na borda livre.
     *
     * O y1=1 / y2=0 é o que põe essa ordem no lugar certo. A elipse da
     * unha é girada pelo ângulo do osso, e o gradiente gira com ela: o +y
     * do bounding box aponta sempre para a BASE do dedo, nos quatro dedos e
     * no polegar. Foi assim que a unha deixou de ser uma pastilha clara
     * (a primeira versão era clara em cima e escura embaixo, com a luz
     * trocada) e passou a ler como lâmina sobre a ponta do dedo.
     -->
    <linearGradient id="unhaGrad" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0"    stop-color="#c08a66"/>
      <stop offset="0.22" stop-color="#e6c1a4"/>
      <stop offset="0.66" stop-color="#f6ddcb"/>
      <stop offset="1"    stop-color="#fdf7f2"/>
    </linearGradient>

    <!--
     * O tecido da manga, do punho para baixo.
     *
     * Ao contrário do que fazia antes — dois azuis, quase iguais —, a queda
     * de luz aqui é longa e de verdade: o punho está debaixo da lâmpada e a
     * barra já saiu do círculo dela. É essa diferença que faz o braço ter
     * comprimento em vez de ser uma fita da mesma cor de ponta a ponta.
     -->
    <linearGradient id="mangaGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0"    stop-color="#3d81d4"/>
      <stop offset="0.16" stop-color="#2f6fc4"/>
      <stop offset="0.58" stop-color="#22559d"/>
      <stop offset="1"    stop-color="#123a70"/>
    </linearGradient>

    <!-- O volume do braço: o mesmo degrau de cilindro das falanges, mais
         fraco — tecido não devolve o brilho que a pele devolve. -->
    <linearGradient id="mangaVolume" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0"    stop-color="#0d2650" stop-opacity="0.30"/>
      <stop offset="0.26" stop-color="#0d2650" stop-opacity="0.02"/>
      <stop offset="0.55" stop-color="#0d2650" stop-opacity="0.12"/>
      <stop offset="1"    stop-color="#08182f" stop-opacity="0.44"/>
    </linearGradient>

    <!-- O punho: o vão escuro entre o tecido e o braço. -->
    <linearGradient id="punhoGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0"   stop-color="#1d4f9c"/>
      <stop offset="0.5" stop-color="#123a70"/>
      <stop offset="1"   stop-color="#0d2650"/>
    </linearGradient>

    <!-- O recorte do braço inteiro, para as dobras não passarem da borda. -->
    <clipPath id="recorteBraco">
      <path d="${manga()}"/>
    </clipPath>

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

    <!-- O contorno da palma como máscara de recorte: as manchas de sombra
         (nós, punho) são pintadas por cima e cortadas na silhueta da mão. -->
    <clipPath id="recortePalma">
      <path d="${palma()}"/>
    </clipPath>

    <!--
     * Os recortes das costuras — um por nó que tem vizinho.
     *
     * São gerados do mesmo contorno que desenha a falange, e não escritos à
     * mão: uma costura recortada num contorno parecido mas não idêntico
     * deixaria uma rebarba de meio pixel na borda do dedo, que é o tipo de
     * defeito que só aparece na transmissão.
     -->
    ${Object.keys(DEDOS).slice(1).map((nome) =>
      clipDaCostura(OSSOS.find((o) => o.de === `mcp${nome}`))).join('')}
  </defs>

  <!-- Manga do antebraço: sai da base da palma e abre para fora. -->
  <path class="manga" d="${manga()}" fill="url(#mangaGrad)"/>
  <path class="manga__volume" d="${manga()}" fill="url(#mangaVolume)"/>
  ${dobrasDaManga()}
  <path class="manga__punho" d="${punhoDaManga()}" fill="url(#punhoGrad)"/>
  <path class="manga__punho-fio" d="${punhoDaManga()}" fill="none"
    stroke="#5f9ee8" stroke-opacity="0.5" stroke-width="2"/>

  <!-- Palma e seus detalhes -->
  <g ${MARCA_DE_JUNTA('curvaturaPalma')} ${origem('curvaturaPalma')}>
    <!-- O punho encostado na manga, antes da palma: a mão passa por cima do
         tecido e a sombra fica embaixo dela. -->
    <ellipse class="punho__contato" cx="218" cy="${PALMA.base + 8}" rx="118" ry="30"
      fill="url(#sombraPunho)"/>
    <path class="palma" filter="url(#texturaPele)" d="${palma()}" fill="url(#peleBase)"/>
    <path class="palma__sombra" d="${palma()}" fill="url(#peleSombra)"/>
    <path class="palma__borda" d="${palma()}" fill="url(#sombraBorda)"/>
    <ellipse class="palma__luz" cx="192" cy="366" rx="66" ry="72" fill="url(#peleLuz)"/>

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

    <!--
     * Os nós dos dedos, escurecidos.
     *
     * Esta camada é desenhada DEPOIS dos vincos e ANTES dos dedos, e a
     * ordem é o desenho: cada mancha fica centrada na linha dos nós, então
     * a metade de cima dela é coberta pela falange que nasce ali e o que
     * sobra na tela é a sombra DENTRO da palma, embaixo do dedo. O vão entre
     * dois dedos, que a falange não cobre, recebe a mancha inteira — e é
     * isso que uma mão de verdade mostra entre dois dedos encostados.
     *
     * O recorte na palma é o que impede a mancha do indicador (centrada a
     * 26px da borda) de vazar para fora da mão e sujar o fundo.
     -->
    <g class="nos" clip-path="url(#recortePalma)">
      ${OSSOS.filter((o) => o.de.startsWith('mcp')).map((o) => `<ellipse `
        + `cx="${n(o.raiz.x)}" cy="${n(o.raiz.y + 4)}" `
        + `rx="${n(o.largura * 1.05)}" ry="22" fill="url(#peleOclusao)"/>`).join('')}
    </g>

    ${polegar()}
    ${nomes.map((nome, i) => dedo(nome, juntas(nome), i > 0)).join('')}
  </g>
</svg>`;
}

/**
 * A etiqueta de quem está votando.
 *
 * Sem ela, uma mão anônima descendo sobre a urna é a máquina votando sozinha
 * — e a graça da cena é justamente o contrário: alguém mandou um presente e
 * está ali depositando o voto. O nome na tela é o que transforma o
 * espectador em autor do que ele está vendo.
 *
 * Ela diz TRÊS coisas, e cada uma responde uma pergunta que a cena sozinha
 * não responde:
 *
 *   - **quem** — o nome, na linha de cima, que é o que já existia;
 *   - **o quê** — a figura do presente e o nome dele embaixo, ou o número que
 *     a pessoa escreveu no chat. É o pedido do Leonardo: "melhore o badge,
 *     em vez de mostrar só o nome numa badge simples";
 *   - **quanto** — o `+5` na ponta, que é o peso do voto. Ele é a novidade
 *     que a tabela de preço trouxe: o mesmo presente vale mais quando é mais
 *     caro, e o voto escrito vale um. Sem o número na tela, essa diferença
 *     existe só no placar, depois do fato.
 *
 * O nome é escrito com `textContent`, nunca com `innerHTML` — e o desenho
 * entra como ELEMENTO, com o `src` montado a partir de um campo que o
 * servidor já peneirou. Nada desta etiqueta interpola texto de fora em HTML.
 */
export function markupDoBadge() {
  return `
<div class="mao__badge" data-badge>
  <span class="mao__badge-conteudo" data-badge-conteudo>
    <span class="mao__badge-arte" data-badge-arte></span>
    <span class="mao__badge-texto">
      <span class="mao__badge-nome" data-badge-nome></span>
      <span class="mao__badge-por" data-badge-por></span>
    </span>
    <span class="mao__badge-votos" data-badge-votos>
      <span class="mao__badge-peso" data-badge-peso></span>
      <span class="mao__badge-rotulo" data-badge-rotulo>votos</span>
    </span>
  </span>
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
  const badgePor = badgeEl.querySelector('[data-badge-por]');
  const badgeArte = badgeEl.querySelector('[data-badge-arte]');
  const badgePeso = badgeEl.querySelector('[data-badge-peso]');
  const badgeRotulo = badgeEl.querySelector('[data-badge-rotulo]');
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
    mostrarBadge(nome, cor, {
      votos = 0, presente = '', numero = '', origem = 'presente', desenho = '',
    } = {}) {
      const limpo = String(nome ?? '').trim();
      if (!limpo) return;
      badgeNome.textContent = limpo;
      badgeEl.style.setProperty('--cor-urna', cor ?? '#39435c');

      /*
       * A linha de baixo muda com o CAMINHO do voto, e é a única coisa que
       * muda: quem mandou um presente tem a figura e o nome dele; quem
       * escreveu no chat tem o número que escreveu. Chamar os dois de
       * "presente" faria a etiqueta de um voto de graça prometer um presente
       * que ninguém mandou.
       */
      const doChat = origem === 'chat';
      badgeEl.classList.toggle('mao__badge--chat', doChat);
      badgePor.textContent = doChat ? 'escreveu no chat' : String(presente ?? '').trim();

      badgeArte.replaceChildren();
      if (doChat) {
        /*
         * O número da urna no lugar da figura. É o que o espectador escreveu
         * (ou o nome que ele usou), e é o que identifica o voto para quem lê
         * a tela de longe — sem figura nenhuma para mostrar.
         */
        const marca = document.createElement('span');
        marca.className = 'mao__badge-numero';
        marca.textContent = String(numero ?? '').trim();
        badgeArte.append(marca);
      } else if (desenho) {
        /*
         * O desenho vem do mapeamento do servidor, e o campo é peneirado lá
         * (sem barra, sem ponto, sem espaço). A largura e a altura estão no
         * CSS: uma figura que ainda não chegou do disco mede zero, e a
         * etiqueta seria medida estreita demais — ela é presa dentro do palco
         * por essa medida.
         */
        const img = document.createElement('img');
        img.className = 'mao__badge-desenho';
        img.alt = '';
        img.src = `/img/${desenho}.webp`;
        badgeArte.append(img);
      }

      /*
       * O peso, em duas linhas: o número grande e a palavra pequena.
       *
       * O `+5` sozinho era um número solto na ponta da ficha — dizia o
       * tamanho do voto sem dizer do quê. Embaixo dele vai a palavra, e ela
       * fala no singular quando é um voto só: um voto escrito no chat vale 1,
       * e "+1 votos" é o tipo de detalhe que ninguém confere e todo mundo lê.
       */
      const quantos = Number(votos);
      const temPeso = Number.isFinite(quantos) && quantos > 0;
      badgePeso.textContent = temPeso ? `+${quantos}` : '';
      badgeRotulo.textContent = quantos === 1 ? 'voto' : 'votos';
      badgeEl.classList.toggle('mao__badge--sem-peso', !temPeso);
      badgeEl.classList.remove('mao__badge--contado');
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

    /**
     * A etiqueta acende quando a urna confirma o voto.
     *
     * É o instante em que o voto passa a valer — a tecla CONFIRMA afunda e o
     * placar sobe. A etiqueta fica na tela mais um segundo e meio depois
     * disso, e sem esta marca ela passaria esse tempo do mesmo jeito que
     * estava antes, sem dizer que o voto já entrou.
     */
    confirmarBadge() {
      badgeEl.classList.add('mao__badge--contado');
      /*
       * A palavra muda junto com a cor.
       *
       * "VOTOS" é uma promessa; depois do CONFIRMA o número já está no placar,
       * e a ficha passa a dizer isso. É a mesma informação de antes lida do
       * outro lado: não o que aquele voto vale, mas onde ele já está.
       *
       * E a etiqueta é REMEDIDA aqui, e não só no nascimento.
       *
       * O `posicionar` prende o `--bx` dentro do palco usando a largura medida
       * no `mostrarBadge` — e "no placar" é mais largo que "votos". Com a
       * medida antiga valendo, a ficha crescia 41px para a esquerda e saía 17px
       * do enquadramento na urna da esquerda, no ar. Remedir aqui custa uma
       * leitura de layout por voto, e não por quadro, que é o que seria caro.
       */
      if (badgeRotulo.textContent) badgeRotulo.textContent = 'no placar';
      largura = badgeEl.offsetWidth;
    },

    esconderBadge() {
      badgeEl.classList.remove('mao__badge--visivel');
      badgeEl.classList.remove('mao__badge--contado');
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
