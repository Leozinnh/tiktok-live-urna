// Dados e matemática pura. O renderizador (hand-svg.js) é quem escreve no DOM.
//
// Convenção de sinal: ângulos em graus. Nos dedos, 0 = estendido e
// valores negativos = fletido (o dedo fecha para dentro da palma).
// O polegar usa eixo próprio e por isso seus valores são positivos.
//
// A coreografia trabalha em POSES NOMEADAS, nunca em ângulos. É o que
// permite trocar o renderizador por sprites sem tocar na animação.
import { CADEIAS, LADOS, SENTIDO_DA_FLEXAO } from './esqueleto.js';

export const JUNTAS = [
  'mcpIndicador', 'pipIndicador', 'dipIndicador',
  'mcpMedio',     'pipMedio',     'dipMedio',
  'mcpAnel',      'pipAnel',      'dipAnel',
  'mcpMindinho',  'pipMindinho',  'dipMindinho',
  'mcpPolegar',   'ipPolegar',
  'curvaturaPalma',
];

export const POSES = Object.freeze({
  /** Mão relaxada, fora de cena ou esperando. */
  repouso: {
    pulso: { x: 0, y: 0, rot: 0 },
    juntas: {
      mcpIndicador: -12, pipIndicador: -22, dipIndicador: -14,
      mcpMedio:     -14, pipMedio:     -26, dipMedio:     -16,
      mcpAnel:      -16, pipAnel:      -30, dipAnel:      -18,
      mcpMindinho:  -18, pipMindinho:  -34, dipMindinho:  -20,
      mcpPolegar:     14, ipPolegar:     10,
      curvaturaPalma: 0.35,
    },
  },

  /** Indicador estendido, resto recolhido — a mão que se aproxima da tecla. */
  apontando: {
    pulso: { x: 0, y: -6, rot: -3 },
    juntas: {
      mcpIndicador:  -4, pipIndicador:  -6, dipIndicador:  -4,
      mcpMedio:     -34, pipMedio:     -58, dipMedio:     -38,
      mcpAnel:      -38, pipAnel:      -64, dipAnel:      -42,
      mcpMindinho:  -40, pipMindinho:  -66, dipMindinho:  -44,
      mcpPolegar:     18, ipPolegar:     14,
      curvaturaPalma: 0.22,
    },
  },

  /**
   * O dedo apertando a tecla: o indicador flete bem mais que em
   * `apontando` — é o contraste do indicador com ele mesmo que lê como
   * "pressão", já que os outros dedos seguem recolhidos nas duas poses.
   */
  pressionando: {
    pulso: { x: 0, y: 4, rot: 1 },
    juntas: {
      mcpIndicador: -16, pipIndicador: -34, dipIndicador: -22,
      mcpMedio:     -36, pipMedio:     -60, dipMedio:     -40,
      mcpAnel:      -40, pipAnel:      -66, dipAnel:      -44,
      mcpMindinho:  -42, pipMindinho:  -68, dipMindinho:  -46,
      mcpPolegar:     20, ipPolegar:     16,
      curvaturaPalma: 0.24,
    },
  },

  /** Pegando a cédula: pinça entre indicador e polegar. */
  segurando: {
    pulso: { x: 0, y: 0, rot: -8 },
    juntas: {
      mcpIndicador: -26, pipIndicador: -42, dipIndicador: -26,
      mcpMedio:     -30, pipMedio:     -52, dipMedio:     -34,
      mcpAnel:      -34, pipAnel:      -58, dipAnel:      -38,
      mcpMindinho:  -36, pipMindinho:  -60, dipMindinho:  -40,
      mcpPolegar:     44, ipPolegar:     34,
      curvaturaPalma: 0.30,
    },
  },

  /** Empurrando a cédula para dentro da abertura no topo. */
  inserindo: {
    pulso: { x: 0, y: -10, rot: -12 },
    juntas: {
      mcpIndicador: -14, pipIndicador: -26, dipIndicador: -16,
      mcpMedio:     -24, pipMedio:     -44, dipMedio:     -28,
      mcpAnel:      -28, pipAnel:      -50, dipAnel:      -32,
      mcpMindinho:  -30, pipMindinho:  -52, dipMindinho:  -34,
      mcpPolegar:     38, ipPolegar:     30,
      curvaturaPalma: 0.26,
    },
  },

  /** Saindo de cena: dedos soltos, pulso virando. */
  retraindo: {
    pulso: { x: 0, y: 8, rot: 6 },
    juntas: {
      mcpIndicador: -20, pipIndicador: -34, dipIndicador: -22,
      mcpMedio:     -22, pipMedio:     -38, dipMedio:     -24,
      mcpAnel:      -24, pipAnel:      -42, dipAnel:      -26,
      mcpMindinho:  -26, pipMindinho:  -44, dipMindinho:  -28,
      mcpPolegar:     16, ipPolegar:     12,
      curvaturaPalma: 0.40,
    },
  },
});

const limitar = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/*
 * Forma `a·(1−t) + b·t` em vez de `a + (b−a)·t`: é exata nas duas pontas.
 * Com a outra forma, `a + (b − a)` não devolve `b` bit a bit quando os
 * valores são decimais — `0.35 + (0.24 − 0.35)` dá 0.23999999999999996.
 * Isso faria a pose final nunca coincidir exatamente com a pose nomeada.
 */
const misturar = (a, b, t) => a * (1 - t) + b * t;

/**
 * Interpola duas poses. Devolve sempre um objeto novo — as poses em POSES
 * são congeladas e nunca podem ser mutadas por quem consome.
 */
export function interpolarPose(a, b, t) {
  const p = limitar(t);
  const juntas = {};
  for (const junta of JUNTAS) {
    juntas[junta] = misturar(a.juntas[junta], b.juntas[junta], p);
  }
  return {
    pulso: {
      x: misturar(a.pulso.x, b.pulso.x, p),
      y: misturar(a.pulso.y, b.pulso.y, p),
      rot: misturar(a.pulso.rot, b.pulso.rot, p),
    },
    juntas,
  };
}

/**
 * Quanto da flexão aparece como giro no plano.
 *
 * Um dedo que fecha não gira no plano da tela: ele gira para FORA dele, e
 * o que se vê é o comprimento encolhendo e um tombamento pequeno. Sem
 * esse fator, dobrar 90° gira 90° e o dedo atravessa a palma.
 */
const FATOR_LATERAL = 0.5;

/**
 * O quanto uma junta pode encolher.
 *
 * O piso existe porque uma falange de comprimento zero não lê como dedo
 * dobrado, lê como dedo que sumiu. Em 0,34 a falange ainda tem ponta.
 */
const PISO_ENCURTAMENTO = 0.34;

const grausParaRad = (g) => (g * Math.PI) / 180;

/** O pai de cada junta na cadeia, para converter giro absoluto em relativo. */
const PAIS = (() => {
  const p = {};
  for (const cadeia of CADEIAS) {
    for (let i = 1; i < cadeia.length; i++) p[cadeia[i]] = cadeia[i - 1];
  }
  return p;
})();

/**
 * Traduz uma pose para transforms CSS, um por junta.
 *
 * O pivô de cada junta é definido no próprio SVG (transform-origin escrito
 * no grupo por hand-svg.js), então aqui só entram rotação e escala.
 *
 * Duas conversões acontecem nesta função, e as duas já foram defeito:
 *
 * 1. Os grupos são ANINHADOS: girar o nó move tudo o que está dentro, e o
 *    transform do filho é aplicado no referencial já girado do pai. A
 *    tabela de poses guarda o quanto cada junta está dobrada em termos
 *    absolutos; escrever isso direto no transform faria a cadeia somar
 *    três vezes a mesma flexão e o dedo fecharia no ar. Por isso o que
 *    sai é a diferença para o pai.
 *
 * 2. Flexão não é giro: é encurtamento. Ver FATOR_LATERAL acima.
 */
export function poseParaTransformacoes(pose) {
  const t = {};
  const giroAbsoluto = {};

  for (const junta of JUNTAS) {
    if (junta === 'curvaturaPalma') {
      // A curvatura da palma é sutil: multiplicada para virar alguns graus.
      giroAbsoluto[junta] = pose.juntas[junta] * 10;
      t[junta] = `rotate(${giroAbsoluto[junta].toFixed(3)}deg) scaleY(1)`;
      continue;
    }

    const flexao = pose.juntas[junta] * SENTIDO_DA_FLEXAO[junta];
    giroAbsoluto[junta] = flexao * FATOR_LATERAL * LADOS[junta];
    const pai = PAIS[junta];
    const delta = giroAbsoluto[junta] - (pai ? giroAbsoluto[pai] : 0);
    const encolhe = Math.max(PISO_ENCURTAMENTO, Math.cos(grausParaRad(flexao)));

    t[junta] = `rotate(${delta.toFixed(3)}deg) scaleY(${encolhe.toFixed(3)})`;
  }
  return t;
}

