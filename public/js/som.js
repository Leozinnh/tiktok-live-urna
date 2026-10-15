/*
 * O som da disputa, feito de osciladores.
 *
 * Não há arquivo de áudio neste projeto e não vai haver: um `.mp3` é um
 * binário opaco que ninguém aqui sabe regerar, pesa mais do que todo o
 * JavaScript da cena e precisa de licença. Duas ou três notas sintetizadas
 * custam trinta linhas e fazem o que a ultrapassagem precisa — um "ta-dá"
 * curto que marca o momento.
 *
 * O som é ENFEITE. Todo caminho daqui para baixo é escrito para que a sua
 * ausência não mude nada: sem Web Audio, com o contexto bloqueado ou com o
 * operador tendo calado a mesa, a cena segue idêntica e silenciosa.
 */

/**
 * Um som que não toca, com a mesma forma de um que toca.
 *
 * Existe para que quem chama nunca precise perguntar se pode tocar antes de
 * tocar. `ligado` é sempre falso aqui, calado ou não: sem contexto de áudio
 * não há silêncio a desfazer, há ausência de som.
 */
function somMudo() {
  return {
    get ligado() { return false; },
    get contexto() { return null; },
    tocarVirada() {},
    tocarEmpate() {},
    tocarVitoria() {},
    calar() {},
    voltar() {},
  };
}

/**
 * A subida da ultrapassagem: três notas, cada uma mais aguda que a anterior.
 *
 * A ordem cresce de propósito. Uma sequência que desce soa como derrota, e o
 * ouvido decide isso antes de o cérebro conferir o placar — a mesma razão
 * pela qual ninguém precisa ler "2 atrás" para saber que é ruim.
 */
export const NOTAS_DA_VIRADA = Object.freeze([
  Object.freeze({ frequencia: 523.25, atraso: 0,    duracao: 0.13 }), // dó
  Object.freeze({ frequencia: 659.25, atraso: 0.10, duracao: 0.13 }), // mi
  Object.freeze({ frequencia: 987.77, atraso: 0.20, duracao: 0.34 }), // si
]);

/** Empate: duas notas iguais. Não sobe nem desce, porque nada foi decidido. */
export const NOTAS_DO_EMPATE = Object.freeze([
  Object.freeze({ frequencia: 587.33, atraso: 0,    duracao: 0.14 }),
  Object.freeze({ frequencia: 587.33, atraso: 0.16, duracao: 0.26 }),
]);

/** Vitória: o arpejo maior, mais longo, com a nota final sustentada. */
export const NOTAS_DA_VITORIA = Object.freeze([
  Object.freeze({ frequencia: 523.25, atraso: 0,    duracao: 0.16 }),
  Object.freeze({ frequencia: 659.25, atraso: 0.14, duracao: 0.16 }),
  Object.freeze({ frequencia: 783.99, atraso: 0.28, duracao: 0.16 }),
  Object.freeze({ frequencia: 1046.5, atraso: 0.42, duracao: 0.72 }),
]);

const VOLUME = 0.18;

/**
 * O contexto de áudio da página, criado uma vez e só quando dá.
 *
 * `webkitAudioContext` ainda existe em navegador antigo e é uma linha. O
 * `try` é porque a construção pode falhar de verdade: há um teto de contextos
 * por página, e estourá-lo lança em vez de devolver nulo.
 */
function contextoDoNavegador(Construtor) {
  const C = Construtor ?? globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!C) return null;
  try {
    return new C();
  } catch {
    return null;
  }
}

/**
 * O som da cena.
 *
 * Devolve sempre um objeto com a mesma forma, mesmo quando não há áudio
 * nenhum: quem chama não deve ter de perguntar se pode tocar antes de tocar.
 */
export function criarSom({ Contexto, volume = VOLUME } = {}) {
  const ctx = contextoDoNavegador(Contexto);
  let calado = false;

  if (!ctx) return somMudo();

  /*
   * O navegador nasce com o áudio suspenso esperando um gesto do usuário — e
   * a página do OBS não recebe gesto nenhum, porque ninguém clica num browser
   * source. A tentativa de retomar é feita aqui e repetida a cada som, porque
   * o contexto pode voltar a suspender sozinho quando a aba perde o foco.
   */
  const acordar = () => {
    if (ctx.state === 'suspended') {
      try { ctx.resume(); } catch { /* segue mudo */ }
    }
  };
  acordar();

  function tocar(notas) {
    if (calado) return;
    acordar();

    const agora = ctx.currentTime;

    for (const nota of notas) {
      /*
       * Um oscilador e um ganho POR NOTA, e não um ganho compartilhado.
       *
       * O ganho é quem dá a envoltória: sem ele o oscilador liga e desliga em
       * volume cheio, e cada nota estala no começo e no fim. E ele não pode
       * ser reaproveitado entre notas — o segundo som cancelaria o primeiro
       * no meio.
       */
      const osc = ctx.createOscillator();
      const ganho = ctx.createGain();
      const inicio = agora + nota.atraso;
      const fim = inicio + nota.duracao;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(nota.frequencia, inicio);

      // Sobe rápido e cai suave: um ataque instantâneo estala, e um ataque
      // longo engole a nota inteira quando ela dura 130ms.
      ganho.gain.setValueAtTime(0.0001, inicio);
      ganho.gain.exponentialRampToValueAtTime(volume, inicio + 0.02);
      ganho.gain.exponentialRampToValueAtTime(0.0001, fim);

      osc.connect(ganho);
      ganho.connect(ctx.destination);

      osc.start(inicio);
      osc.stop(fim + 0.02); // A folga é para o `stop` não cortar a cauda do ganho.
    }
  }

  return {
    get ligado() { return !calado; },
    get contexto() { return ctx; },
    tocarVirada: () => tocar(NOTAS_DA_VIRADA),
    tocarEmpate: () => tocar(NOTAS_DO_EMPATE),
    tocarVitoria: () => tocar(NOTAS_DA_VITORIA),
    calar() { calado = true; },
    voltar() { calado = false; },
  };
}
