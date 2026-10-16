/**
 * A narração na tela — a faixa e a voz de quem chegou.
 *
 * O som NÃO é sintetizado aqui. O OBS embarca um CEF sem motor de fala:
 * `speechSynthesis.getVoices()` devolve lista vazia para sempre, e o pouco
 * que ele conseguisse dizer não sairia no áudio capturado. O que o OBS
 * captura é um elemento de áudio tocando um arquivo de verdade — então quem
 * sintetiza é o servidor, guarda o WAV, e manda para cá o endereço dele.
 *
 * Duas regras organizam este arquivo:
 *
 *   - **a faixa não depende do som.** Voz desligada, sintetizador caído,
 *     arquivo que não saiu: o nome de quem chegou aparece do mesmo jeito.
 *     Perder a fala é um detalhe; perder as boas-vindas é a tela parecer
 *     morta para quem acabou de seguir;
 *   - **uma fala de cada vez.** Duas falas sobrepostas viram uma terceira
 *     coisa, que não é nenhuma das duas — e isso vale ainda mais agora que o
 *     narrador fala com DUAS vozes alternadas: sobrepostas, elas soariam como
 *     uma voz quebrada, e não como duas pessoas. A fila também é o que dá
 *     tempo de ler: numa rajada, as falas passam em ordem, e não empilhadas.
 */

/**
 * Os tipos que a faixa sabe pintar.
 *
 * Lista fechada porque o tipo vira nome de classe. Um texto livre aqui seria
 * o visitante escolhendo a classe — e o apelido de quem chega é o campo mais
 * livre que existe numa rede social.
 */
export const TIPOS_DA_FAIXA = Object.freeze([
  'seguidor', 'curtida', 'entrada', 'compartilhou', 'assinatura', 'presente',
]);

/** O que não é um desses vira `social`: a faixa neutra. */
const CLASSE_PADRAO = 'social';

/** Todas as classes de tipo, para trocar uma por outra sem apagar o resto. */
const CLASSES_DE_TIPO = Object.freeze(TIPOS_DA_FAIXA.map((t) => `narrador--${t}`).concat(`narrador--${CLASSE_PADRAO}`));

/**
 * Quanto texto a faixa aceita.
 *
 * O apelido do TikTok vai a dezenas de caracteres, e a faixa tem a largura do
 * palco. Sem limite, um nome comprido empurraria a frase para fora da tela no
 * meio da transmissão.
 */
export const LIMITE_DO_TEXTO = 120;

/**
 * O endereço que o servidor serve — ver a rota `/voz/` em server/index.js.
 *
 * Os dois formatos são os dois motores: `.mp3` da voz neural, `.wav` da voz do
 * Windows. Esta lista e a do servidor são a MESMA lista escrita duas vezes, uma
 * em cada ponta do fio — e uma delas esquecida faz o áudio ser recusado aqui,
 * depois de ter sido sintetizado com sucesso.
 */
const ENDERECO_DE_VOZ = /^\/voz\/[0-9a-f]{16}\.(wav|mp3)$/;

/**
 * O nome do desenho do presente: `public/img/<desenho>.webp`.
 *
 * Como o `wav`, este campo faz a página BUSCAR alguma coisa, e passa pela
 * mesma peneira. Aqui ele é mais perigoso do que o áudio: o endereço é montado
 * por concatenação (`/img/` + desenho + `.webp`), então um valor com barra
 * sairia da pasta das figuras e iria buscar qualquer arquivo do projeto. Sem
 * barra, sem ponto, sem maiúscula: um nome de arquivo e mais nada.
 *
 * A expressão é a MESMA do `DESENHO_VALIDO` no `config.js`, escrita duas
 * vezes porque são duas pontas do fio — e uma delas esquecida é uma figura que
 * some sem aviso nenhum.
 */
const NOME_DE_DESENHO = /^[a-z0-9_]{1,40}$/;

/** Quanto tempo a faixa fica na tela quando não há som para acompanhar. */
const TEMPO_MINIMO_MS = 3_500;
/** Quanto tempo a fila pode ficar. Além disso, o mais antigo sai. */
const FILA_MAXIMA = 8;

/**
 * O que o servidor mandou, no formato que a faixa desenha — ou `null`.
 *
 * Pura de propósito: é aqui que mora a decisão sobre o que pode chegar à tela
 * que o OBS está capturando, e é a única parte deste arquivo que dá para
 * conferir sem navegador.
 */
export function falaDoServidor(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const texto = String(payload.texto ?? '').trim();
  if (!texto) return null;

  const tipo = TIPOS_DA_FAIXA.includes(payload.tipo) ? payload.tipo : CLASSE_PADRAO;
  const wav = ENDERECO_DE_VOZ.test(String(payload.wav ?? '')) ? String(payload.wav) : null;
  /*
   * O desenho é do PRESENTE, e só dele.
   *
   * A condição do tipo não é zelo: um seguidor não manda rosa, e uma figura
   * entrando num aviso onde ela não significa nada seria o tipo de coisa que
   * ninguém confere e todo mundo vê. O `desenho` do servidor já sai só no
   * presente; esta linha é a segunda ponta da mesma regra.
   */
  const desenho = tipo === 'presente' && NOME_DE_DESENHO.test(String(payload.desenho ?? ''))
    ? String(payload.desenho)
    : null;

  return {
    // O corte avisa que cortou: um texto que termina no meio da palavra sem
    // reticências parece um defeito da tela, e não um nome comprido.
    texto: texto.length > LIMITE_DO_TEXTO
      ? `${texto.slice(0, LIMITE_DO_TEXTO - 1).trimEnd()}…`
      : texto,
    wav,
    desenho,
    tipo,
    usuario: String(payload.usuario ?? '').trim(),
  };
}

/**
 * A faixa na tela, com a fila de som.
 *
 * @param {HTMLElement} camada  onde a faixa é pendurada (a camada de efeitos)
 * @param {object} [opcoes]
 * @param {Function} [opcoes.aoFalar] avisado a cada fala que começa
 */
export function criarNarrador(camada, { aoFalar = null } = {}) {
  const el = document.createElement('div');
  el.className = 'narrador';
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = '<img class="narrador__desenho" alt="" hidden />'
    + '<div class="narrador__marca"></div><div class="narrador__texto"></div>';
  const marca = el.querySelector('.narrador__marca');
  const linha = el.querySelector('.narrador__texto');
  const figura = el.querySelector('.narrador__desenho');
  camada.append(el);

  /*
   * Um desenho que não veio não deixa buraco.
   *
   * O nome vem do `config/local.json`, escrito à mão: um `"desenho": "roses"`
   * com um "s" a mais viraria um quadrado de imagem quebrada na tela que o OBS
   * está capturando — no aviso do presente, no meio da live. Aqui ele some, e
   * a faixa dourada continua inteira.
   */
  figura.addEventListener('error', () => { figura.hidden = true; });

  // Um só, reaproveitado: criar um elemento de áudio por fala deixaria
  // dezenas deles na página depois de uma noite de live, e o OBS recarrega a
  // fonte de tempos em tempos.
  const audio = new Audio();
  audio.preload = 'auto';

  let volume = 1;
  let ocupado = false;
  let escondendo = null;
  const fila = [];

  audio.volume = volume;

  function esconder() {
    clearTimeout(escondendo);
    escondendo = null;
    el.classList.remove('narrador--visivel');
  }

  function terminar() {
    if (escondendo) return;
    ocupado = false;
    esconder();
    proxima();
  }

  /** Mostra a fala e espera o tempo dela passar. */
  function apresentar(fala) {
    ocupado = true;
    linha.textContent = fala.texto;
    /*
     * A figura do presente, quando a fala tem uma.
     *
     * `hidden` e o `src` andam juntos nas duas direções: uma fala sem desenho
     * logo depois de uma com desenho — uma Rosa e depois um seguidor — deixaria
     * a rosa colada no aviso do seguidor se só o `src` fosse trocado.
     */
    if (fala.desenho) {
      figura.src = `/img/${fala.desenho}.webp`;
      figura.hidden = false;
    } else {
      figura.hidden = true;
      figura.removeAttribute('src');
    }
    /*
     * Só a classe do TIPO é trocada, e não o `className` inteiro.
     *
     * Reescrever a lista toda apagaria o `narrador--visivel` no mesmo instante
     * — e a faixa piscaria a cada fala que entra por cima de outra, que é
     * exatamente o que acontece numa rajada de seguidores.
     */
    el.classList.remove(...CLASSES_DE_TIPO);
    el.classList.add(`narrador--${fala.tipo}`);
    /*
     * A classe de visibilidade entra no quadro seguinte.
     *
     * Tirar e pôr a classe no mesmo quadro faria o navegador juntar as duas
     * mudanças e não animar nada: a faixa apareceria de uma vez, sem subir.
     * O `requestAnimationFrame` separa os dois estados.
     */
    requestAnimationFrame(() => el.classList.add('narrador--visivel'));
    aoFalar?.(fala);

    if (fala.wav) {
      audio.src = fala.wav;
      audio.currentTime = 0;
      /*
       * `play()` devolve promessa, e ela rejeita quando o navegador recusa
       * tocar sem interação do usuário. Numa fonte de navegador do OBS isso
       * não acontece, mas na janela do Chrome acontece — e a promessa
       * rejeitada sem tratamento viraria um erro no console e a faixa presa.
       */
      audio.play().catch(() => terminar());
      return;
    }
    // Sem som, quem manda no tempo é a tela.
    escondendo = setTimeout(terminar, TEMPO_MINIMO_MS);
  }

  function proxima() {
    if (ocupado) return false;
    const fala = fila.shift();
    if (!fala) return false;
    apresentar(fala);
    return true;
  }

  // O fim do áudio é o fim da fala. Um `error` também: um WAV que não veio
  // não pode prender a fila para sempre na primeira fala da noite.
  audio.addEventListener('ended', terminar);
  audio.addEventListener('error', terminar);

  return {
    /** Põe uma fala na fila. Devolve `false` quando não era fala. */
    narrar(payload) {
      const fala = falaDoServidor(payload);
      if (!fala) return false;
      // A fila tem teto: numa rajada, quem chegou por último é quem está na
      // tela agora, e são essas as boas-vindas que importam.
      if (fila.length >= FILA_MAXIMA) fila.shift();
      fila.push(fala);
      proxima();
      return true;
    },

    definirVolume(v) {
      const n = Number(v);
      if (!Number.isFinite(n)) return;
      volume = Math.min(1, Math.max(0, n));
      audio.volume = volume;
    },

    get volume() { return volume; },
    get naTela() { return el.classList.contains('narrador--visivel'); },
    get esperando() { return fila.length; },
    /** O que a sonda do navegador alcança para conferir o desenho. */
    get el() { return el; },
    get marca() { return marca; },
  };
}
