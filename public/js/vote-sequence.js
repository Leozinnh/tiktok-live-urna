/**
 * Tempos de cada fase, em milissegundos a 1x.
 *
 * Um voto de dois dígitos soma ~4,7s, que é o alvo de ~4,5s da spec (§4.4).
 * Se estes números crescerem, a fila estoura em live movimentada — a spec
 * assume este orçamento de tempo para uma animação completa.
 *
 * Todo contato com a urna — dígito, CONFIRMA, cédula no slot — tem a mesma
 * forma: pairar (`chegada…`/`irPara…`), descer (`descida`), pressionar
 * (`pressao…`) e subir (`recuoDoDedo`). O movimento e a pressão são dois
 * passos separados, e o tempo do movimento é declarado à parte: era essa a
 * peça que faltava quando a tecla afundava antes de o dedo chegar.
 */
export const TEMPOS = {
  anuncio:         400,
  aproximacao:     440,
  chegadaTecla:    210,   // pairar sobre a tecla
  descida:          80,   // a ponta desce até encostar nela
  pressaoTecla:    180,   // tempo com a tecla afundada
  recuoDoDedo:      80,   // e a ponta sobe de volta
  irParaConfirma:  210,
  pressaoConfirma: 230,   // o CONFIRMA é mais deliberado que um dígito
  confirmado:      380,
  cedulaSai:       380,
  pegaCedula:      180,
  irParaSlot:      290,
  pressaoSlot:     150,   // tempo com a cédula enfiada no slot
  contar:          380,
  retirada:        260,
};

/*
 * As durações de fase são DERIVADAS dos tempos acima, nunca escritas de
 * novo. Como o fim da fase é o fim do último movimento que ela agenda, uma
 * cópia à mão vira uma promessa que ninguém confere — foi assim que o
 * recuo de 80ms conviveu com uma fase que orçava 320ms para um percurso de
 * 420ms, e a tecla passou a afundar antes de o dedo chegar.
 */
/** Um dígito inteiro: pairar, descer, pressionar, subir. */
export const POR_DIGITO =
  TEMPOS.chegadaTecla + TEMPOS.descida + TEMPOS.pressaoTecla + TEMPOS.recuoDoDedo;

/** Do pairar sobre o CONFIRMA até soltá-lo. */
export const FASE_CONFIRMA =
  TEMPOS.irParaConfirma + TEMPOS.descida + TEMPOS.pressaoConfirma + TEMPOS.recuoDoDedo;

/** Do primeiro movimento até a cédula entrar no slot. */
export const FASE_DEPOSITO =
  TEMPOS.pegaCedula + TEMPOS.irParaSlot
  + TEMPOS.descida + TEMPOS.pressaoSlot + TEMPOS.recuoDoDedo;

/**
 * As fases, na ordem, com a duração nominal a 1x.
 * `digitacao` tem duração variável: POR_DIGITO × nº de dígitos.
 * Serve de referência para leitura e para o teste de cobertura das fases.
 */
export const FASES = [
  { nome: 'anuncio',     dur: TEMPOS.anuncio },
  { nome: 'aproximacao', dur: TEMPOS.aproximacao },
  { nome: 'digitacao',   dur: null },
  { nome: 'confirmacao', dur: FASE_CONFIRMA },
  { nome: 'confirmado',  dur: TEMPOS.confirmado },
  { nome: 'cedula',      dur: TEMPOS.cedulaSai },
  { nome: 'deposito',    dur: FASE_DEPOSITO },
  { nome: 'contagem',    dur: TEMPOS.contar },
  { nome: 'retirada',    dur: TEMPOS.retirada },
];

/** Quanto a ponta do indicador paira acima do centro antes de descer. */
export const ALTURA_DO_PAR = 40;

/**
 * As duas posições de um contato, em coordenadas de palco.
 *
 * Pairar e encostar são pontos distintos, e é a coreografia que sabe a
 * diferença — o ator só interpola até onde lhe dizem. Quando era o ator
 * que subtraía uma altura fixa de todo alvo, a pose `pressionando` também
 * parava no ar: a tecla afundava com o dedo pairando por cima dela.
 */
export const pairarSobre = (centro) => ({ x: centro.x, y: centro.y - ALTURA_DO_PAR });
export const encostarEm = (centro) => ({ x: centro.x, y: centro.y });

const semQuebrar = (fn) => (...args) => {
  try { fn?.(...args); } catch (erro) { console.error('[sequencia] callback falhou', erro); }
};

/**
 * Monta a timeline completa de um voto sobre uma timeline já existente.
 *
 * É pura: recebe a geometria medida do DOM e devolve a coreografia.
 * Não sabe o que é uma urna, um SVG ou um pixel — só posições e tempo.
 * É isso que permite testar a coreografia inteira sem navegador.
 *
 * `aoMoverMao` recebe `{ alvo, pose, duracao }`: `alvo` é um ponto em
 * coordenadas do palco, `pose` é o nome de uma pose de `POSES` e `duracao`
 * é quanto o percurso leva. Os três andam juntos — um alvo sem duração faz
 * o ator cair no tempo padrão dele, que pode ser maior que a fase inteira,
 * e é assim que uma tecla afunda antes de o dedo chegar nela.
 *
 * O ator (hand-actor.js) interpola da pose atual até a pedida, ao longo de
 * um arco, no tempo declarado.
 */
export function construirSequenciaDeVoto({
  geometria,
  numero,
  votos = 1,
  timeline,
  callbacks = {},
  tempos = TEMPOS,
}) {
  const cb = {
    aoDestacar:        semQuebrar(callbacks.aoDestacar),
    aoMoverMao:        semQuebrar(callbacks.aoMoverMao),
    aoTeclar:          semQuebrar(callbacks.aoTeclar),
    aoSoltarTecla:     semQuebrar(callbacks.aoSoltarTecla),
    aoMostrarTela:     semQuebrar(callbacks.aoMostrarTela),
    aoSairCedula:      semQuebrar(callbacks.aoSairCedula),
    aoDepositarCedula: semQuebrar(callbacks.aoDepositarCedula),
    aoContar:          semQuebrar(callbacks.aoContar),
  };

  const digitos = String(numero).split('');
  let t = 0;

  // ---- P0: anúncio. A urna acende antes de qualquer movimento. ----
  timeline.chamar('anuncio', { at: t, fn: () => cb.aoDestacar() });
  timeline.chamar('tela-inicial', { at: t, fn: () => cb.aoMostrarTela({ tipo: 'digitando', numeroDigitado: '' }) });
  t += tempos.anuncio;

  // ---- P1: aproximação. A mão entra por baixo e sobe até a primeira tecla. ----
  const primeira = geometria.teclas?.[digitos[0]];
  if (primeira) {
    timeline.chamar('aproxima', {
      at: t,
      fn: () => cb.aoMoverMao({
        alvo: pairarSobre(primeira.centro), pose: 'apontando', duracao: tempos.aproximacao,
      }),
    });
  }
  t += tempos.aproximacao;

  // ---- P2: digitação. Um ciclo completo por dígito. ----
  digitos.forEach((digito, i) => {
    const alvo = geometria.teclas?.[digito];
    if (!alvo) return;                       // tecla fora da geometria: pula sem quebrar
    const base = t;
    const par = pairarSobre(alvo.centro);
    const desce = base + tempos.chegadaTecla;

    timeline.chamar(`mover-${i}`, {
      at: base,
      fn: () => cb.aoMoverMao({ alvo: par, pose: 'apontando', duracao: tempos.chegadaTecla }),
    });

    // Descer até a tecla, e só então pressionar: a descida é um passo com
    // duração própria, e é o fim dela que a tecla afunda.
    timeline.chamar(`desce-${i}`, {
      at: desce,
      fn: () => cb.aoMoverMao({
        alvo: encostarEm(alvo.centro), pose: 'pressionando', duracao: tempos.descida,
      }),
    });

    timeline.chamar(`afunda-${i}`, {
      at: desce + tempos.descida,
      fn: () => {
        cb.aoTeclar(digito);
        cb.aoMostrarTela({ tipo: 'digitando', numeroDigitado: digitos.slice(0, i + 1).join('') });
      },
    });

    timeline.chamar(`sobe-${i}`, {
      at: desce + tempos.descida + tempos.pressaoTecla,
      fn: () => {
        cb.aoSoltarTecla(digito);
        cb.aoMoverMao({ alvo: par, pose: 'apontando', duracao: tempos.recuoDoDedo });
      },
    });

    t = base + POR_DIGITO;
  });

  // ---- P3: CONFIRMA ----
  const confirma = geometria.teclas?.CONFIRMA;
  if (confirma) {
    const base = t;
    const par = pairarSobre(confirma.centro);
    const desce = base + tempos.irParaConfirma;

    timeline.chamar('vai-confirma', {
      at: base,
      fn: () => cb.aoMoverMao({ alvo: par, pose: 'apontando', duracao: tempos.irParaConfirma }),
    });

    timeline.chamar('desce-confirma', {
      at: desce,
      fn: () => cb.aoMoverMao({
        alvo: encostarEm(confirma.centro), pose: 'pressionando', duracao: tempos.descida,
      }),
    });

    timeline.chamar('afunda-confirma', {
      at: desce + tempos.descida,
      fn: () => cb.aoTeclar('CONFIRMA'),
    });

    timeline.chamar('solta-confirma', {
      at: desce + tempos.descida + tempos.pressaoConfirma,
      fn: () => {
        cb.aoSoltarTecla('CONFIRMA');
        cb.aoMoverMao({ alvo: par, pose: 'apontando', duracao: tempos.recuoDoDedo });
      },
    });

    t = base + FASE_CONFIRMA;
  }

  // ---- P4: confirmado ----
  /*
   * A tela NÃO recebe a contagem daqui.
   *
   * `votos` é quanto este presente vale — 1 para uma rosa, 5 para um
   * presente maior — e a tela mostra o TOTAL da urna. Enquanto os dois
   * andaram juntos, o visor anunciava "1 VOTOS" depois de cada voto, como
   * se a urna tivesse esquecido todos os anteriores. Quem sabe o total é a
   * contagem, e é a urna que a consulta.
   */
  timeline.chamar('tela-confirmado', {
    at: t,
    fn: () => cb.aoMostrarTela({ tipo: 'confirmado', votosAdicionados: votos }),
  });
  t += tempos.confirmado;

  // ---- P5: a cédula sai da impressora ----
  timeline.chamar('cedula-sai', { at: t, fn: () => cb.aoSairCedula() });
  t += tempos.cedulaSai;

  // ---- P6: pega a cédula e deposita no slot ----
  if (geometria.slot) {
    const base = t;
    const par = pairarSobre(geometria.slot.centro);
    const empurra = base + tempos.pegaCedula + tempos.irParaSlot;

    timeline.chamar('pega-cedula', {
      at: base,
      fn: () => cb.aoMoverMao({ alvo: par, pose: 'segurando', duracao: tempos.pegaCedula }),
    });

    timeline.chamar('vai-slot', {
      at: base + tempos.pegaCedula,
      fn: () => cb.aoMoverMao({ alvo: par, pose: 'segurando', duracao: tempos.irParaSlot }),
    });

    // A cédula também desce: o slot fica no tampo, e a mão enfia o papel
    // nele em vez de soltá-lo no ar.
    timeline.chamar('insere', {
      at: empurra,
      fn: () => cb.aoMoverMao({
        alvo: encostarEm(geometria.slot.centro), pose: 'inserindo', duracao: tempos.descida,
      }),
    });

    timeline.chamar('entrega', {
      at: empurra + tempos.descida,
      fn: () => cb.aoDepositarCedula(),
    });

    timeline.chamar('solta-cedula', {
      at: empurra + tempos.descida + tempos.pressaoSlot,
      fn: () => cb.aoMoverMao({ alvo: par, pose: 'segurando', duracao: tempos.recuoDoDedo }),
    });

    t = base + FASE_DEPOSITO;
  }

  // ---- P7: contagem ----
  timeline.chamar('contar', { at: t, fn: () => cb.aoContar({ votos }) });
  t += tempos.contar;

  // ---- P8: retirada ----
  timeline.chamar('retira', {
    at: t,
    fn: () => cb.aoMoverMao({
      alvo: { x: 540, y: 1900 }, pose: 'retraindo', duracao: tempos.retirada,
    }),
  });
  // Também sem contagem: a urna volta ao repouso mostrando o total dela,
  // que a esta altura já inclui o voto que acabou de ser contado.
  timeline.chamar('tela-ocioso', {
    at: t + tempos.retirada,
    fn: () => cb.aoMostrarTela({ tipo: 'ocioso' }),
  });

  return timeline;
}
