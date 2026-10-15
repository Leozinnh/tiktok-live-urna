/**
 * O cronômetro da rodada — o número grande no alto do enquadramento.
 *
 * É conta pura mais um tique de um segundo. A conta está separada porque é
 * a parte que erra em silêncio: um tempo que pula de "01:00" para "0:59"
 * parece um soluço da transmissão, e ninguém vai saber dizer de onde veio.
 */

/**
 * Segundos em `MM:SS`, sempre com dois dígitos em cada casa.
 *
 * Acima de uma hora os minutos continuam contando ("62:05") em vez de
 * virarem "01:02:05": a rodada de uma live não é um relógio de ponto, e
 * três blocos de dígitos num enquadramento vertical ficam ilegíveis no
 * celular.
 *
 * Tempo negativo vira zero — "−1:−5" seria pior do que não ter cronômetro.
 */
export function formatarTempo(segundos) {
  const total = Math.max(0, Math.floor(Number(segundos) || 0));
  const minutos = Math.floor(total / 60);
  const resto = total % 60;
  return `${String(minutos).padStart(2, '0')}:${String(resto).padStart(2, '0')}`;
}

/** Quanto falta, dado o que já passou. Nunca abaixo de zero. */
export function segundosRestantes(duracao, decorridos) {
  return Math.max(0, Math.floor(duracao) - Math.floor(decorridos));
}

/**
 * O que mostrar, e se a rodada terminou.
 *
 * `acabou` existe para o fim da rodada ser um acontecimento e não uma
 * comparação: quem olhasse `restante === 0` a cada tique dispararia o
 * encerramento sessenta vezes por segundo.
 */
export function estadoDoCronometro(duracao, decorridos) {
  const restante = segundosRestantes(duracao, decorridos);
  return { restante, texto: formatarTempo(restante), acabou: restante === 0 };
}

/**
 * O painel do cronômetro, no alto do enquadramento.
 *
 * Só o número: na referência não há rótulo, e "TEMPO 00:41" gasta em palavra
 * o espaço que o número precisa para ser lido de longe.
 */
export function markupCronometro(segundos) {
  return `<span class="cronometro__valor" data-cronometro>${formatarTempo(segundos)}</span>`;
}

const inteiro = (n) => Math.max(0, Math.floor(Number(n) || 0));

/**
 * O relógio da rodada, sem tela e sem temporizador.
 *
 * Quem chama decide quando perguntar as horas (`tique`), e de onde elas vêm
 * (`agora`). Essa separação existe por dois motivos:
 *
 * 1. O tempo é a única coisa aqui que pode estar errada em silêncio, e com
 *    `agora` injetado dá para conferir uma rodada de cinco minutos em
 *    microssegundos, sem dormir num teste.
 * 2. O tempo NÃO é um contador somado a cada tique. Um contador acumula o
 *    atraso de cada tique; depois de uma hora de live ele está segundos
 *    fora do tempo real, e um travamento curto do navegador atrasa a
 *    contagem para sempre. Aqui cada tique pergunta as horas de novo.
 *
 * `duracao` é o tempo real da rodada em segundos — o mesmo
 * `rodada.duracaoSegundos` da configuração. Não há valor de enfeite: um
 * cronômetro que conta para baixo sem rodada por trás é um número inventado
 * na tela.
 */
export function criarRelogio({ duracao = 0, agora = () => Date.now(), aoTerminar } = {}) {
  /*
   * A duração é uma variável, e não a constante que chegou na criação: a
   * rodada seguinte pode ter outro tempo. Guardar o primeiro valor faria a
   * segunda rodada contar o tempo da primeira — e o erro só apareceria ao
   * vivo, na segunda rodada da noite.
   */
  let duracaoAtual = inteiro(duracao);
  let inicio = null;
  let parado = true;
  let jaAvisou = false;

  const estado = () => estadoDoCronometro(
    duracaoAtual,
    inicio === null ? 0 : (agora() - inicio) / 1000,
  );

  return {
    estado,
    get parado() { return parado; },
    get restante() { return estado().restante; },

    comecar(segundos) {
      if (segundos !== undefined) duracaoAtual = inteiro(segundos);
      inicio = agora();
      parado = false;
      jaAvisou = false;
      return estado();
    },

    parar() { parado = true; },

    /**
     * Um passo do relógio: devolve o estado e, na primeira vez que o tempo
     * acaba, anuncia o fim e para sozinho.
     */
    tique() {
      const agora_ = estado();
      if (agora_.acabou && !parado && !jaAvisou) {
        jaAvisou = true;
        parado = true;
        aoTerminar?.(agora_);
      }
      return agora_;
    },
  };
}

/**
 * O cronômetro em cena: o relógio de cima, pintado no painel do alto.
 *
 * Esta parte não sabe contar tempo — ela só pergunta ao relógio a cada
 * quarto de segundo e escreve o que ele responde. Um tique de 250ms e não
 * de 1000ms porque o temporizador do navegador não acorda exatamente no
 * segundo cheio: com um tique por segundo, o dígito chega a ficar quase um
 * segundo atrasado em relação à contagem real.
 */
export function criarCronometro(camada, { duracao, aoTerminar } = {}) {
  const el = document.createElement('div');
  el.className = 'cronometro';
  camada.append(el);

  const alvo = document.createElement('span');
  alvo.className = 'cronometro__valor';
  alvo.dataset.cronometro = '';
  el.append(alvo);

  let tique = null;

  const pintar = (estado) => {
    alvo.textContent = estado.texto;
    el.classList.toggle('cronometro--acabou', estado.acabou);
  };

  const relogio = criarRelogio({
    duracao,
    aoTerminar: (estado) => {
      pararTemporizador();
      pintar(estado);
      aoTerminar?.(estado);
    },
  });

  function pararTemporizador() {
    clearTimeout(tique);
    tique = null;
  }

  const passo = () => {
    const estado = relogio.tique();
    pintar(estado);
    if (!relogio.parado) tique = setTimeout(passo, 250);
  };

  pintar(relogio.estado());

  return {
    el,
    get restante() { return relogio.restante; },
    get parado() { return relogio.parado; },

    comecar(segundos) {
      pararTemporizador();
      const estado = relogio.comecar(segundos);
      pintar(estado);
      // Já agenda o próximo passo em vez de chamar `passo()` aqui: chamar
      // direto pintaria duas vezes no mesmo instante e, pior, reagendaria
      // por fora do caminho que o `pararTemporizador` conhece.
      tique = setTimeout(passo, 250);
      return estado;
    },

    parar() {
      pararTemporizador();
      relogio.parar();
    },
  };
}
