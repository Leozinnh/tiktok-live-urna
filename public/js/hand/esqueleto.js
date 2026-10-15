/*
 * O esqueleto da mão.
 *
 * Este módulo é a única fonte de verdade da geometria: os pivôs das
 * juntas são DERIVADOS dos ossos, e não escritos à mão. A versão anterior
 * tinha uma tabela de coordenadas soltas para os pivôs e um desenho
 * separado para as falanges; os dois saíram de sincronia e o resultado na
 * tela foi uma mão com os dedos desmanchados, sem que nenhum teste
 * reclamasse — porque nenhum teste comparava os dois.
 *
 * Convenção de ângulo: graus no padrão do SVG, com o y crescendo para
 * baixo. Os quatro dedos apontam para cima, ou seja -90°. O polegar sai
 * da borda esquerda da palma e aponta para cima e para a esquerda.
 *
 * O viewBox é 420x620. O pulso fica embaixo (~y=470) e os dedos em cima,
 * porque a mão entra na cena por baixo.
 */

/*
 * Comprimentos dos ossos, largura e inclinação de cada dedo.
 *
 * As proporções não são decorativas: o dedo médio de uma mão tem quase o
 * comprimento da palma. Com dedos de 108 unidades sobre uma palma de 170,
 * a mão lia como uma palma com espetos espetados nela, e não como uma mão
 * — que foi exatamente o que a captura de diagnóstico mostrou.
 *
 * A inclinação abre um leque de 10° entre o indicador e o mindinho. Dedos
 * perfeitamente paralelos leem como pente, mas 17° — o valor anterior —
 * abriam um leque de mão espalmada: com 158 unidades de dedo, a ponta do
 * mindinho ia parar a 46 unidades da do indicador, e na captura de 2x a
 * mão lia como um leque, não como uma mão apertando uma tecla. Os 10° dão
 * a separação que o olho espera sem perder a leitura de "quatro dedos".
 */
export const DEDOS = Object.freeze({
  Indicador: { raiz: { x: 160, y: 302 }, largura: 44, angulo: -94,   ossos: [62, 46, 42] },
  Medio:     { raiz: { x: 203, y: 292 }, largura: 45, angulo: -91,   ossos: [66, 48, 44] },
  Anel:      { raiz: { x: 246, y: 295 }, largura: 42, angulo: -87.5, ossos: [62, 46, 42] },
  Mindinho:  { raiz: { x: 287, y: 308 }, largura: 35, angulo: -84,   ossos: [50, 36, 34] },
});

/**
 * O polegar tem dois ossos e um ângulo próprio por osso: ele não sobe
 * reto como os outros, sai de lado. Os ângulos são absolutos porque a
 * cadeia dele já é curta demais para valer a pena acumular.
 */
export const POLEGAR = Object.freeze({
  raiz: { x: 142, y: 396 },
  largura: 40,
  ossos: [62, 44],
  angulos: [-138, -134],
});

/** Onde a palma começa e termina, e a faixa onde os nós dos dedos caem. */
export const PALMA = Object.freeze({
  topo: 300, base: 470, esquerda: 134, direita: 316,
});

/** A junta que gira o conjunto todo em torno do pulso. */
export const CURVATURA_PALMA = Object.freeze({ x: 216, y: 460 });

const grausParaRad = (g) => (g * Math.PI) / 180;
const andar = (p, angulo, comprimento) => ({
  x: p.x + Math.cos(grausParaRad(angulo)) * comprimento,
  y: p.y + Math.sin(grausParaRad(angulo)) * comprimento,
});

/*
 * Os ossos saem daqui já resolvidos: cada um sabe onde começa, onde
 * termina e para que lado aponta. hand-svg.js desenha a partir desta
 * lista e não recalcula nada, para não existir uma segunda aritmética que
 * possa divergir desta.
 */
function ossosDosDedos() {
  const lista = [];
  for (const [nome, dedo] of Object.entries(DEDOS)) {
    const juntas = [`mcp${nome}`, `pip${nome}`, `dip${nome}`];
    let atual = { ...dedo.raiz };
    dedo.ossos.forEach((comprimento, i) => {
      const ponta = andar(atual, dedo.angulo, comprimento);
      lista.push({
        nome: `${juntas[i]}>${i === 2 ? `ponta${nome}` : juntas[i + 1]}`,
        de: juntas[i],
        ate: i === 2 ? `ponta${nome}` : juntas[i + 1],
        raiz: { ...atual },
        ponta,
        largura: dedo.largura * (i === 0 ? 1 : i === 1 ? 0.94 : 0.88),
        angulo: dedo.angulo,
        comprimento,
      });
      atual = ponta;
    });
  }
  return lista;
}

function ossosDoPolegar() {
  const juntas = ['mcpPolegar', 'ipPolegar'];
  let atual = { ...POLEGAR.raiz };
  return POLEGAR.ossos.map((comprimento, i) => {
    const angulo = POLEGAR.angulos[i];
    const ponta = andar(atual, angulo, comprimento);
    const osso = {
      nome: `${juntas[i]}>${i === 1 ? 'pontaPolegar' : juntas[i + 1]}`,
      de: juntas[i],
      ate: i === 1 ? 'pontaPolegar' : juntas[i + 1],
      raiz: { ...atual },
      ponta,
      largura: POLEGAR.largura * (i === 0 ? 1 : 0.86),
      angulo,
      comprimento,
    };
    atual = ponta;
    return osso;
  });
}

export const OSSOS = Object.freeze([...ossosDosDedos(), ...ossosDoPolegar()]);

/** Os pivôs de rotação, um por junta. Derivados dos ossos. */
export const PIVOS = Object.freeze({
  ...Object.fromEntries(OSSOS.map((o) => [o.de, { ...o.raiz }])),
  curvaturaPalma: { ...CURVATURA_PALMA },
});

/** As pontas dos dedos — onde o desenho acaba, não onde há junta. */
export const PONTAS = Object.freeze(
  Object.fromEntries(OSSOS.filter((o) => /^ponta/.test(o.ate))
    .map((o) => [o.ate.replace('ponta', ''), { ...o.ponta }])),
);

/**
 * A ponta que mira a tecla: a do indicador estendido.
 *
 * É esta coordenada que o ator escreve em `--x`/`--y`, então ela tem que
 * ser a ponta do dedo e não o canto da caixa do desenho.
 */
export const PONTA = PONTAS.Indicador;

/**
 * Onde o DEDO DESENHADO termina, em repouso.
 *
 * Não é a mesma coisa que PONTA, e a diferença já custou caro. PONTA é a
 * extremidade do osso; o desenho da falange fecha a ponta com uma meia-volta
 * que avança meia largura ALÉM dela (ver `kPonta` em hand-svg.js). Enquanto a
 * âncora da mão foi PONTA, o ator mirava o centro da tecla com um ponto que
 * ficava 22 unidades atrás da ponta visível — e o portão visual mediu o
 * resultado: 30 frames de tecla afundada com o dedo desenhado FORA dela.
 *
 * A âncora da cena é esta, e é ela que o CSS de fallback repete.
 */
export const ANCORA = Object.freeze({
  x: PONTA.x + Math.cos((DEDOS.Indicador.angulo * Math.PI) / 180) * (DEDOS.Indicador.largura / 2),
  y: PONTA.y + Math.sin((DEDOS.Indicador.angulo * Math.PI) / 180) * (DEDOS.Indicador.largura / 2),
});

/**
 * Para que lado cada dedo tomba ao fletir.
 *
 * Um dedo que dobra não gira no plano: ele encurta e tomba um pouco na
 * direção da palma. Os quatro dedos tombam para o centro da mão, e o
 * polegar — que aponta para fora — tomba para o lado contrário. Sem isso
 * os quatro dedos giram para o mesmo lado e a mão vira um leque.
 */
const CENTRO_X = (PIVOS.mcpIndicador.x + PIVOS.mcpMindinho.x) / 2;
export const LADOS = Object.freeze({
  ...Object.fromEntries(Object.entries(DEDOS).flatMap(([nome, d]) => {
    const lado = d.raiz.x < CENTRO_X ? 1 : -1;
    return [[`mcp${nome}`, lado], [`pip${nome}`, lado], [`dip${nome}`, lado]];
  })),
  mcpPolegar: 1,
  ipPolegar: 1,
});

/**
 * O sinal com que cada junta lê o número da tabela de poses.
 *
 * Nas tabelas, os quatro dedos usam negativo para "fechado" e o polegar
 * usa positivo — convenção que já estava lá e que os testes fixam. Para
 * o cálculo, porém, só interessa o quanto a junta está dobrada, sempre
 * positivo. Esta tabela é a tradução entre as duas leituras, e o polegar
 * é o único que inverte.
 */
export const SENTIDO_DA_FLEXAO = Object.freeze(
  Object.fromEntries(Object.keys(PIVOS).map((j) => [
    j,
    (j === 'mcpPolegar' || j === 'ipPolegar') ? 1 : -1,
  ])),
);

/**
 * As cadeias de juntas, do nó até a ponta.
 *
 * É o que permite a poseParaTransformacoes converter ângulos absolutos
 * (o quanto cada junta está dobrada) em rotações relativas (o que vai no
 * transform de cada grupo aninhado). Sem a lista, ela teria que adivinhar
 * a hierarquia pelo nome da junta.
 */
export const CADEIAS = Object.freeze([
  ...Object.keys(DEDOS).map((nome) => [`mcp${nome}`, `pip${nome}`, `dip${nome}`]),
  ['mcpPolegar', 'ipPolegar'],
]);
