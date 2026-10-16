/*
 * O som da cena: as notas da disputa, feitas de osciladores, e o CONFIRMA,
 * que é um arquivo.
 *
 * As notas da ultrapassagem, do empate e da vitória são sintetizadas — duas
 * ou três cada, trinta linhas, sem binário nenhum no repositório. Um `.mp3`
 * é um binário opaco: ninguém aqui sabe regerá-lo, ele pesa mais do que todo
 * o JavaScript da cena e precisa de licença.
 *
 * O CONFIRMA é a exceção, e a exceção é do Leonardo: ele trouxe o arquivo
 * (`public/sound/confirm.mp3`, 1,5s) e pediu que a urna tocasse no toque da
 * tecla verde. O arquivo é dele, a licença é dele, e o que este módulo faz
 * com ele é o mesmo que faz com as notas: toca baixo, e cala quando mandam.
 *
 * O som é ENFEITE. Todo caminho daqui para baixo é escrito para que a sua
 * ausência não mude nada: sem Web Audio, com o contexto bloqueado, com o
 * arquivo faltando ou com o operador tendo calado a mesa, a cena segue
 * idêntica e silenciosa. Nenhuma falha de áudio pode chegar ao console como
 * erro, porque a tela da live não tem onde escrever log.
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
    tocarConfirmacao() {},
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

/* ---------- O CONFIRMA: o único som que é arquivo ---------- */

/*
 * O caminho do arquivo, e não o arquivo: quem serve é o mesmo servidor que
 * serve a cena, então `/sound/confirm.mp3` é o endereço de dentro da página.
 */
const ARQUIVO_CONFIRMA = '/sound/confirm.mp3';

/*
 * O volume do clique, e ele é baixo de propósito — foi o pedido: "toque o
 * barulho baixo".
 *
 * O número não é chute. O arquivo do Leonardo é um mp3 masterizado, medido
 * em -0,7dB de pico e -10,2dB de média (ffmpeg volumedetect): ele chega
 * alto. A 0,15 — uns 16dB abaixo — a média cai para perto de -26dB: o
 * clique fica embaixo da narração e do áudio da live, que é onde ele tem de
 * ficar. É o número a mexer se um dia ele achar que ficou baixo demais, e é
 * o único.
 *
 * Já foi 0,25, e ele pediu para descer mais um pouco. O caminho é este
 * número, e nunca o volume do arquivo: o mp3 é dele.
 */
const VOLUME_CONFIRMA = 0.15;

/*
 * O silêncio entre dois cliques.
 *
 * O arquivo tem 1,5s. Numa rajada — cem votos em modo lote, dois cliques por
 * segundo por mão — cem cópias sobrepostas viram um zumbido, e o que se
 * perde é justamente o clique, que é o que marca o momento. Com o intervalo
 * mínimo, uma rajada vira uma sequência de cliques distinguíveis, que é o
 * som de uma máquina trabalhando.
 */
const INTERVALO_CONFIRMA = 0.11;

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

  /*
   * O arquivo do CONFIRMA, buscado UMA vez, na criação do som.
   *
   * Buscar na hora do primeiro voto seria ouvir o clique chegar atrasado — um
   * som sem causa visível é pior do que silêncio. Na criação, o arquivo está
   * decodificado muito antes de o primeiro espectador presentear; e enquanto
   * não estiver, `tocarConfirmacao` não faz nada, em silêncio.
   *
   * A falha não vira erro no console: um `fetch` que dá 404 porque alguém
   * renomeou o arquivo é um clique a menos, e a tela da live não tem onde
   * escrever log para alguém ler.
   */
  let audioDoConfirma = null;
  let ultimoClique = -Infinity;
  let cliqueAnterior = null;

  fetch(ARQUIVO_CONFIRMA)
    .then((resposta) => (resposta.ok ? resposta.arrayBuffer() : Promise.reject(new Error(String(resposta.status)))))
    .then((dados) => ctx.decodeAudioData(dados))
    .then((buffer) => { audioDoConfirma = buffer; })
    .catch(() => {});

  /**
   * O clique da tecla verde, no toque em que o voto passa a valer.
   *
   * Um clique por vez: o que estava tocando sai com uma queda de 30ms antes de
   * o novo entrar. O arquivo tem 1,5s e a rajada do modo lote dispara um voto
   * a cada 260ms — sem isso, os cliques se empilham e o que se ouve é um
   * zumbido, não uma urna. Estalar é pior do que cortar: por isso a queda, e
   * não um `stop` seco.
   */
  function tocarConfirmacao() {
    if (calado || !audioDoConfirma) return;

    const agora = ctx.currentTime;
    if (agora - ultimoClique < INTERVALO_CONFIRMA) return;
    ultimoClique = agora;
    acordar();

    try {
      const ganho = ctx.createGain();
      ganho.gain.setValueAtTime(VOLUME_CONFIRMA, agora);
      ganho.connect(ctx.destination);

      const fonte = ctx.createBufferSource();
      fonte.buffer = audioDoConfirma;
      fonte.connect(ganho);
      fonte.start(agora);

      if (cliqueAnterior) {
        const { fonte: antiga, ganho: ganhoAntigo } = cliqueAnterior;
        ganhoAntigo.gain.setValueAtTime(VOLUME_CONFIRMA, agora);
        ganhoAntigo.gain.linearRampToValueAtTime(0.0001, agora + 0.03);
        antiga.stop(agora + 0.05);
      }
      cliqueAnterior = { fonte, ganho };
    } catch { /* sem clique, e a cena não muda */ }
  }

  return {
    get ligado() { return !calado; },
    get contexto() { return ctx; },
    tocarVirada: () => tocar(NOTAS_DA_VIRADA),
    tocarEmpate: () => tocar(NOTAS_DO_EMPATE),
    tocarVitoria: () => tocar(NOTAS_DA_VITORIA),
    tocarConfirmacao,
    calar() { calado = true; },
    voltar() { calado = false; },
  };
}
