/**
 * Tempos de cada fase, em milissegundos a 1x.
 *
 * Um voto de dois dígitos soma ~4,65s, que é o alvo de ~4,5s da spec (§4.4).
 * Se estes números crescerem, a fila estoura em live movimentada — a spec
 * assume este orçamento de tempo para uma animação completa.
 */
export const TEMPOS = {
  anuncio:        450,
  aproximacao:    480,
  porDigito:      320,   // por dígito, mais o recuo abaixo
  recuoDoDedo:     50,
  irParaConfirma: 260,
  confirmar:      420,
  confirmado:     400,
  cedulaSai:      400,
  pegaCedula:     200,
  irParaSlot:     300,
  inserir:        320,
  contar:         400,
  retirada:       280,
};

/**
 * As fases, na ordem, com a duração nominal a 1x.
 * `digitacao` tem duração variável: (porDigito + recuoDoDedo) × nº de dígitos.
 * Serve de referência para leitura e para o teste de cobertura das fases.
 */
export const FASES = [
  { nome: 'anuncio',     dur: TEMPOS.anuncio },
  { nome: 'aproximacao', dur: TEMPOS.aproximacao },
  { nome: 'digitacao',   dur: null },
  { nome: 'confirmacao', dur: TEMPOS.irParaConfirma + TEMPOS.confirmar },
  { nome: 'confirmado',  dur: TEMPOS.confirmado },
  { nome: 'cedula',      dur: TEMPOS.cedulaSai },
  { nome: 'deposito',    dur: TEMPOS.pegaCedula + TEMPOS.irParaSlot + TEMPOS.inserir },
  { nome: 'contagem',    dur: TEMPOS.contar },
  { nome: 'retirada',    dur: TEMPOS.retirada },
];

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
 * `aoMoverMao` recebe `{ alvo, pose }`, onde `alvo` é um ponto em
 * coordenadas do palco e `pose` é o nome de uma pose de `POSES`. O ator
 * (vote-actor.js) interpola da pose atual até essa, em direção ao alvo.
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
    timeline.chamar('aproxima', { at: t, fn: () => cb.aoMoverMao({ alvo: primeira.centro, pose: 'apontando' }) });
  }
  t += tempos.aproximacao;

  // ---- P2: digitação. Um ciclo completo por dígito. ----
  digitos.forEach((digito, i) => {
    const alvo = geometria.teclas?.[digito];
    if (!alvo) return;                       // tecla fora da geometria: pula sem quebrar
    const base = t;

    timeline.chamar(`mover-${i}`, {
      at: base,
      fn: () => cb.aoMoverMao({ alvo: alvo.centro, pose: 'apontando' }),
    });

    timeline.chamar(`desce-${i}`, {
      at: base + tempos.porDigito * 0.55,
      fn: () => {
        cb.aoMoverMao({ alvo: alvo.centro, pose: 'pressionando' });
        cb.aoTeclar(digito);
      },
    });

    timeline.chamar(`tela-${i}`, {
      at: base + tempos.porDigito * 0.62,
      fn: () => cb.aoMostrarTela({ tipo: 'digitando', numeroDigitado: digitos.slice(0, i + 1).join('') }),
    });

    timeline.chamar(`sobe-${i}`, {
      at: base + tempos.porDigito * 0.78,
      fn: () => {
        cb.aoSoltarTecla(digito);
        cb.aoMoverMao({ alvo: alvo.centro, pose: 'apontando' });
      },
    });

    t = base + tempos.porDigito + tempos.recuoDoDedo;
  });

  // ---- P3: CONFIRMA ----
  const confirma = geometria.teclas?.CONFIRMA;
  if (confirma) {
    timeline.chamar('vai-confirma', {
      at: t,
      fn: () => cb.aoMoverMao({ alvo: confirma.centro, pose: 'apontando' }),
    });
    t += tempos.irParaConfirma;

    timeline.chamar('aperta-confirma', {
      at: t,
      fn: () => {
        cb.aoMoverMao({ alvo: confirma.centro, pose: 'pressionando' });
        cb.aoTeclar('CONFIRMA');
      },
    });
    t += tempos.confirmar * 0.45;

    timeline.chamar('solta-confirma', {
      at: t,
      fn: () => {
        cb.aoSoltarTecla('CONFIRMA');
        cb.aoMoverMao({ alvo: confirma.centro, pose: 'apontando' });
      },
    });
    t += tempos.confirmar * 0.55;
  }

  // ---- P4: confirmado ----
  timeline.chamar('tela-confirmado', {
    at: t,
    fn: () => cb.aoMostrarTela({ tipo: 'confirmado', votos: votos }),
  });
  t += tempos.confirmado;

  // ---- P5: a cédula sai da impressora ----
  timeline.chamar('cedula-sai', { at: t, fn: () => cb.aoSairCedula() });
  t += tempos.cedulaSai;

  // ---- P6: pega a cédula e deposita no slot ----
  if (geometria.slot) {
    timeline.chamar('pega-cedula', {
      at: t,
      fn: () => cb.aoMoverMao({ alvo: geometria.slot.centro, pose: 'segurando' }),
    });
    t += tempos.pegaCedula;

    timeline.chamar('vai-slot', {
      at: t,
      fn: () => cb.aoMoverMao({ alvo: geometria.slot.centro, pose: 'segurando' }),
    });
    t += tempos.irParaSlot;

    timeline.chamar('insere', {
      at: t,
      fn: () => {
        cb.aoMoverMao({ alvo: geometria.slot.centro, pose: 'inserindo' });
        cb.aoDepositarCedula();
      },
    });
    t += tempos.inserir;
  }

  // ---- P7: contagem ----
  timeline.chamar('contar', { at: t, fn: () => cb.aoContar({ votos }) });
  t += tempos.contar;

  // ---- P8: retirada ----
  timeline.chamar('retira', {
    at: t,
    fn: () => cb.aoMoverMao({ alvo: { x: 540, y: 1900 }, pose: 'retraindo' }),
  });
  timeline.chamar('tela-ocioso', {
    at: t + tempos.retirada,
    fn: () => cb.aoMostrarTela({ tipo: 'ocioso', votos }),
  });

  return timeline;
}
