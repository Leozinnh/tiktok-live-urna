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

/*
 * A peneira da cor, importada do pop-up.
 *
 * A faixa do presente passou a se pintar com a cor da urna que recebeu o
 * voto — a mesma cor da etiqueta na mão e a mesma do pop-up —, e as três
 * precisam concordar sobre o que é uma cor. Importar, e não reescrever: a
 * expressão é a mesma, e uma cópia a mais é uma cópia a mais para esquecer.
 */
import { COR_VALIDA } from './popup-presente.js';

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
 * Até quando uma fala AINDA vale ser dita.
 *
 * O Leonardo ouviu "muuuuuuito atraso nas falas" e a medida deu razão a ele: a
 * página toca uma fala de cada vez e espera a anterior terminar, então uma
 * rajada empilha — três presentes seguidos, e o terceiro só foi ouvido 7,8
 * segundos depois de ter sido mandado. Falar do passado é pior do que não
 * falar: a live já é outra, e quem ouve o nome de quem mandou uma Rosa três
 * falas atrás não sabe de qual presente se trata.
 *
 * Seis segundos é a conta: a fala mais longa que o baralho escreve dura uns
 * quatro, e o tempo de escolher, sintetizar e buscar o áudio cabe no resto. O
 * que passar disso é descartado — com uma linha no log, que é a regra da casa.
 */
export const VALIDADE_MS = 6_000;

/**
 * A fala esperou demais para ainda valer?
 *
 * Pura, como o `falaDoServidor`: é uma decisão do produto — o que a live deixa
 * de dizer —, e é a única parte desta correção que dá para conferir sem
 * navegador.
 */
export function falaVelha(fala, agora) {
  if (!fala || !Number.isFinite(fala.desde)) return false;
  return agora - fala.desde > VALIDADE_MS;
}

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
  return {
    // O corte avisa que cortou: um texto que termina no meio da palavra sem
    // reticências parece um defeito da tela, e não um nome comprido.
    texto: texto.length > LIMITE_DO_TEXTO
      ? `${texto.slice(0, LIMITE_DO_TEXTO - 1).trimEnd()}…`
      : texto,
    wav,
    presente: presenteDoServidor(payload.presente, tipo),
    /*
     * O tempo que a fala JÁ esperou no servidor, em milissegundos.
     *
     * Os dois carimbos são do relógio do servidor, e o que se usa é a
     * diferença entre eles — o tempo entre o evento acontecer e a fala ser
     * mandada, que é a síntese e a fila de lá. Diferença entre dois carimbos
     * da MESMA máquina não precisa de relógio sincronizado, e é por isso que
     * este número pode atravessar o fio.
     */
    esperou: tempoDeEspera(payload),
    tipo,
    usuario: String(payload.usuario ?? '').trim(),
  };
}

/** Há quanto tempo a fala espera, do evento até ser mandada. */
function tempoDeEspera(payload) {
  const em = Number(payload.em);
  const ts = Number(payload.ts);
  if (!Number.isFinite(em) || !Number.isFinite(ts)) return 0;
  return Math.max(0, ts - em);
}

/**
 * O presente que chegou — ou `null`.
 *
 * A faixa quer o desenho, o pop-up quer o nome, o apelido de quem mandou e
 * para qual urna o voto foi. Os dois mostram o MESMO presente, e é por isso
 * que ele viaja num objeto só: um `desenho` solto ao lado de um
 * `presente.nome` daria dois lugares afirmando a mesma coisa, e no dia em que
 * discordassem a faixa e o pop-up mostrariam presentes diferentes no mesmo
 * instante da live.
 */
function presenteDoServidor(presente, tipo) {
  /*
   * O desenho é do PRESENTE, e só dele.
   *
   * A condição do tipo não é zelo: um seguidor não manda rosa, e uma figura
   * entrando num aviso onde ela não significa nada seria o tipo de coisa que
   * ninguém confere e todo mundo vê. Com o pop-up, a mesma porta valeria para
   * uma tela inteira tomada por um presente que não houve.
   */
  if (tipo !== 'presente') return null;
  if (!presente || typeof presente !== 'object' || Array.isArray(presente)) return null;

  const desenho = NOME_DE_DESENHO.test(String(presente.desenho ?? '')) ? String(presente.desenho) : null;
  return {
    /*
     * A cor da urna que recebeu o voto — e agora ela é peneirada AQUI.
     *
     * Ela era copiada crua, com a nota de que quem conferia era o pop-up.
     * Deixou de ser verdade quando a faixa passou a usá-la também: são dois
     * consumidores da mesma cor, e uma peneira em um deles é uma porta aberta
     * no outro. A expressão é IMPORTADA do pop-up em vez de reescrita — duas
     * cópias da mesma regra divergem no dia em que alguém mexer numa.
     */
    cor: COR_VALIDA.test(String(presente.cor ?? '').trim()) ? String(presente.cor).trim() : null,
    // O `desenho` já sai conferido daqui, e o pop-up só o copia adiante.
    desenho,
    nome: String(presente.nome ?? '').trim(),
    urna: String(presente.urna ?? '').trim(),
  };
}

/**
 * A faixa na tela, com a fila de som.
 *
 * @param {HTMLElement} camada  onde a faixa é pendurada (a camada de efeitos)
 * @param {object} [opcoes]
 * @param {Function} [opcoes.aoFalar] avisado a cada fala que começa
 */
export function criarNarrador(camada, { aoFalar = null, aoPerder = null } = {}) {
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
    if (fala.presente?.desenho) {
      figura.src = `/img/${fala.presente.desenho}.webp`;
      figura.hidden = false;
    } else {
      figura.hidden = true;
      figura.removeAttribute('src');
    }
    /*
     * A cor da faixa do presente é a da URNA que recebeu o voto.
     *
     * Ela era dourada, e o dourado não dizia nada: na tela, toda cor com
     * significado é a de uma urna — o placar, a etiqueta da mão, a tarja da
     * fila, o pop-up. O Leonardo olhou a faixa dourada no ar e disse o que
     * era: "a cor dourada está sem sentido algum na tela".
     *
     * A propriedade é REMOVIDA quando não há cor, e não escrita vazia: o
     * `var()` com valor inválido derrubaria a cor da classe do tipo, e a
     * faixa seguinte — um seguidor — sairia sem cor nenhuma.
     */
    if (fala.presente?.cor) el.style.setProperty('--narracao-cor', fala.presente.cor);
    else el.style.removeProperty('--narracao-cor');
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
       * não acontece, mas na janela do Chrome acontece.
       *
       * A recusa NÃO é mais engolida.
       *
       * O `catch` antigo chamava o `terminar` e seguia em frente: a fala não
       * saía, a faixa piscava e sumia no mesmo quadro, e não sobrava rastro em
       * lugar nenhum — nem no console do servidor, nem no arquivo de log. É o
       * sintoma que o Leonardo descreveu como "algumas não estão saindo", e a
       * prova estava numa sonda do próprio projeto, que gravou `play()
       * RECUSADO: NotAllowedError` num arquivo de estado. Numa casa onde
       * silêncio é bug, uma recusa sem linha no log é o bug inteiro.
       *
       * Agora a recusa vira uma linha, e a faixa fica o tempo mínimo na tela,
       * como quando não há som nenhum: o aviso visual acontece do mesmo jeito.
       * Perder a fala é um detalhe; perder o aviso é a tela parecer morta.
       */
      audio.play().catch((erro) => {
        aoPerder?.(fala, `o navegador não deixou tocar (${erro?.name ?? 'sem motivo'})`);
        escondendo = setTimeout(terminar, TEMPO_MINIMO_MS);
      });
      return;
    }
    // Sem som, quem manda no tempo é a tela.
    escondendo = setTimeout(terminar, TEMPO_MINIMO_MS);
  }

  function proxima() {
    if (ocupado) return false;
    for (;;) {
      const fala = fila.shift();
      if (!fala) return false;
      /*
       * A fala que esperou demais não é dita.
       *
       * Ela não some calada: o descarte vai para o log do servidor, porque é
       * ali que o Leonardo lê a noite. Uma fala engolida sem linha deixaria o
       * console mentindo — dizendo que tudo saiu, quando a live ouviu menos.
       */
      if (falaVelha(fala, Date.now())) {
        aoPerder?.(fala, `esperou mais de ${Math.round(VALIDADE_MS / 1000)}s na fila`);
        continue;
      }
      apresentar(fala);
      return true;
    }
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
      /*
       * O relógio da fala começa no EVENTO, e não aqui.
       *
       * O `narrate` chega depois da síntese, e uma rajada grande faz o
       * servidor mandar a terceira fala dois segundos depois da primeira —
       * que é atraso de verdade e não aparecia em contagem nenhuma feita a
       * partir da chegada. Descontado o que já passou lá, o `desde` vale o
       * mesmo nas duas pontas do fio.
       */
      fala.desde = Date.now() - fala.esperou;
      // A fila tem teto: numa rajada, quem chegou por último é quem está na
      // tela agora, e são essas as boas-vindas que importam. A que sai também
      // não sai calada — ver o `proxima`.
      if (fila.length >= FILA_MAXIMA) aoPerder?.(fila.shift(), 'a fila encheu');
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
