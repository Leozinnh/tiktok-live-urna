// Funções puras. Nenhuma dependência de DOM — rodam no Node para os testes.

export const linear = (t) => t;

export const easeInQuad = (t) => t * t;

export const easeOutCubic = (t) => 1 - (1 - t) ** 3;

export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/** Passa de 1 e volta — dá o "estalo" da tecla sendo pressionada. */
export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

/** Oscila e assenta — usado no contador quando o número sobe. */
export const easeOutElastic = (t) => {
  if (t === 0 || t === 1) return t;
  const c4 = (2 * Math.PI) / 3;
  return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

export const EASINGS = {
  linear,
  'in-quad': easeInQuad,
  'out-cubic': easeOutCubic,
  'in-out-cubic': easeInOutCubic,
  'out-back': easeOutBack,
  'out-elastic': easeOutElastic,
};

const limita = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * Aceita um nome de easing, uma função, ou nada.
 * Nunca lança: um nome desconhecido vira linear, porque uma animação
 * que quebra no meio deixa a mão presa na tela.
 *
 * O limite é aplicado ANTES de chamar a easing. Com easeOutElastic a
 * ordem importa: limitar depois devolveria um valor já oscilado para
 * fora do intervalo.
 */
export function resolverEasing(e) {
  if (typeof e === 'function') return (t) => e(limita(t));
  const fn = EASINGS[e] ?? linear;
  return (t) => fn(limita(t));
}
