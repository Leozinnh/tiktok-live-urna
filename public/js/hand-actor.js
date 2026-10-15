import { POSES, interpolarPose, deslocamentoDaPonta } from './hand/poses.js';
import { Timeline, Ticker, PoolDeTimelines } from './anim/timeline.js';
import { FilaDeAnimacao } from './anim/queue.js';
import { construirSequenciaDeVoto } from './vote-sequence.js';
import { CLASSES_DE_ESTADO } from './urna.js';

/** Onde a mão espera entre um voto e outro: abaixo da borda do palco. */
export const MAO_FORA_DE_CENA = { x: 540, y: 2000 };

/**
 * O tamanho da mão em unidades do palco.
 *
 * O desenho tem 420 de largura sobre uma urna de 460: em escala 1 a mão
 * cobre o teclado inteiro e boa parte do gabinete, e a urna — que é a
 * personagem principal da cena — some atrás dela. Em 0,8 o dedo continua
 * grande e legível na transmissão, a tecla que ele aperta continua à vista,
 * e a mão lê como uma mão sobre uma máquina em vez de uma luva colada na
 * lente.
 *
 * A escala é aplicada em torno da PONTA DO DEDO (ver hand.css), então
 * mexer nela não desloca a mira: a ponta continua caindo exatamente no
 * centro da tecla.
 */
export const ESCALA_DA_MAO = 0.8;

/**
 * Amostra um arco entre dois pontos. Não é uma reta: uma mão que se move
 * em linha reta parece um cursor. O arco, somado à aceleração, é o que
 * faz o movimento parecer de uma pessoa.
 *
 * A perpendicular é girada para o lado de cima da tela — em coordenadas de
 * palco o y cresce para baixo, então "para cima" é y negativo. Com o sinal
 * trocado o arco afunda a mão na mesa em vez de levantá-la.
 */
export function calcularCaminho(origem, destino, { arco = 70, amostras = 18 } = {}) {
  const pontos = [];
  const dx = destino.x - origem.x;
  const dy = destino.y - origem.y;
  const distancia = Math.hypot(dx, dy) || 1;
  const px = dy / distancia;
  const py = -dx / distancia;

  for (let i = 0; i < amostras; i++) {
    const t = i / (amostras - 1);
    const elevacao = Math.sin(t * Math.PI) * arco;
    pontos.push({
      x: origem.x + dx * t + px * elevacao,
      y: origem.y + dy * t + py * elevacao,
    });
  }
  pontos[0] = { x: origem.x, y: origem.y };
  pontos[pontos.length - 1] = { x: destino.x, y: destino.y };
  return pontos;
}

/**
 * Roda um passo do encerramento sem deixar o erro escapar.
 *
 * O encerramento de um voto mexe em DOM que pode ter sido remontado no meio
 * da live — um resize do OBS troca os elementos da mão. Nenhuma dessas
 * falhas pode impedir o `resolve()`, e é por isso que cada passo tem o seu
 * próprio `try` em vez de um só em volta dos três.
 */
function tentar(oQue, fn) {
  try { fn(); } catch (erro) { console.error(`[ator] falha ao ${oQue}`, erro); }
}

/**
 * O ator é a ponte entre o motor puro e o DOM.
 *
 * Ele é dono da fila e do ticker, e é o único que sabe onde a mão está
 * na tela. A coreografia (vote-sequence) só fala em alvos e poses.
 */
export class AtorDaMao {
  constructor({ renderizador, camada, opcoes = {} }) {
    this.render = renderizador;
    this.camada = camada;
    // O ticker é injetável pelo mesmo motivo que o do motor é: sem isso o
    // ator só existiria dentro de um navegador, e a fila — a parte que
    // realmente pode travar uma live — ficaria sem teste.
    this.ticker = opcoes.ticker ?? new Ticker();
    this.pool = new PoolDeTimelines({ max: 8 });
    /*
     * A fila pode chegar pronta ou em opções, e a diferença importa.
     *
     * Numa equipe de mãos ela chega PRONTA e é a mesma para todas — é ela que
     * guarda "quantos votos faltam", e duas filas dariam dois números para o
     * mesmo fato, com a tela mostrando um e a mão obedecendo ao outro. Uma
     * mão sozinha continua podendo passar só as opções, que é como o
     * construtor nasceu.
     */
    this.fila = opcoes.fila instanceof FilaDeAnimacao
      ? opcoes.fila
      : new FilaDeAnimacao(opcoes.fila ?? {});
    /*
     * Quem quiser saber que um voto foi contado se inscreve aqui.
     *
     * Poderia ser um callback dentro do item da fila, e não é: o item da
     * fila é o que um dia vai para o disco (a fila precisa sobreviver a um
     * recarregamento no meio da live), e uma função pendurada nele não
     * sobrevive a `JSON.stringify` — o voto voltaria da memória sem o
     * aviso, e o placar pararia de contar sem nada quebrar.
     */
    this.aoContarVoto = opcoes.aoContarVoto ?? (() => {});
    /*
     * Numa equipe de mãos a fila é uma só, e quem a faz andar é a equipe.
     *
     * O watchdog da fila acumula TEMPO VIRTUAL contra um limite fixo: dois
     * atores chamando `tick` no mesmo quadro contariam o dobro, a fila se
     * daria por travada na metade do prazo e um voto ainda em animação seria
     * dado por concluído — a mão continuaria mexendo, mas a vaga já estaria
     * livre e uma terceira mão começaria um voto por cima.
     */
    this.tickDaFila = opcoes.tickDaFila ?? true;
    /*
     * A reserva de urnas é da EQUIPE, e não de cada mão.
     *
     * Duas mãos escolhendo ao mesmo tempo precisam de uma resposta só: se
     * cada ator decidisse por conta própria qual urna pegar, as duas
     * olhariam para a mesma lista livre no mesmo quadro e as duas escolheriam
     * a urna do Lula. Ver urnas-livres.js.
     *
     * Sem reserva — um ator sozinho, num teste — o voto usa a urna que veio
     * dentro dele, que é como o projeto funcionava antes das duas mãos.
     */
    this.reserva = opcoes.reservaDeUrnas ?? null;
    this.posicao = { ...MAO_FORA_DE_CENA };
    this.poseAtual = POSES.repouso;
    this.timelineAtual = null;
    this.ocupado = false;
    this._geometriaCache = null;
    this._contadorPercurso = 0;

    camada.append(renderizador.sombra, renderizador.el);
    // A etiqueta é irmã da mão, e não filha: ver o comentário do
    // `posicionar` em hand-svg.js.
    if (renderizador.badge) camada.append(renderizador.badge);
    // Recolher é o estado inicial, e é a mesma operação do fim de cada
    // voto: uma segunda forma de escrever "mão fora de cena" só serviria
    // para as duas divergirem.
    this.recolher();
    this.ticker.iniciar();

    // Redimensionar invalida as coordenadas medidas — sem isto o dedo
    // passa a errar a tecla depois que o OBS muda a resolução da fonte.
    // `globalThis` em vez de `window` para o módulo carregar fora do navegador.
    globalThis.addEventListener?.('resize', () => this.remedir());
    globalThis.addEventListener?.('palco:redimensionado', () => this.remedir());
  }

  remedir() { this._geometriaCache = null; }

  geometriaDe(urna) {
    if (!this._geometriaCache || this._geometriaCache.urna !== urna) {
      this._geometriaCache = { urna, geo: urna.medirGeometria() };
    }
    return this._geometriaCache.geo;
  }

  /**
   * Move a mão ao longo de um arco até o alvo, com a pose indicada.
   *
   * Esta chamada acontece NO MEIO da execução da timeline, disparada por um
   * `chamar` da coreografia. Por isso o tween é ancorado em `t.decorrido` e
   * não em zero: um tween `at: 0` nasceria já vencido (`decorrido > fim` no
   * primeiro tick) e a mão teleportaria para o alvo em vez de percorrer o arco.
   *
   * O id é único porque a mesma timeline recebe vários percursos; com id fixo,
   * dois percursos correm juntos e disputam a posição da mão.
   */
  moverPara({ alvo, pose = 'apontando', duracao = 420, timeline = null }) {
    const t = timeline ?? this.pool.obter();
    const origem = { ...this.posicao };
    /*
     * A ponta do indicador vai exatamente ao alvo.
     *
     * Aqui já houve um `y - 40` fixo, para o dedo não tapar a tecla — mas
     * ele valia para toda pose, então `pressionando` também parava 40px
     * acima e a tecla afundava com o dedo pairando no ar. Quem decide a
     * altura de cada momento é a coreografia, que tem uma posição para
     * pairar e outra para encostar (vote-sequence.js); o ator entrega o
     * ponto que lhe pedem, sem corrigir por conta própria.
     *
     * `duracao` é a da fase que agendou este percurso. O padrão de 420ms só
     * vale para quem chama `moverPara` fora de uma coreografia.
     */
    const caminho = calcularCaminho(origem, alvo, { arco: 70 });
    const poseAlvo = POSES[pose] ?? POSES.apontando;
    const posePartida = this.poseAtual;
    const id = `percurso-${++this._contadorPercurso}`;

    // Sobe no meio do trajeto: a altura alimenta a sombra projetada.
    t.add(id, {
      at: t.decorrido, dur: duracao, ease: 'in-out-cubic', from: 0, to: 1,
      onUpdate: (p) => {
        const idx = Math.min(caminho.length - 1, Math.floor(p * (caminho.length - 1)));
        const ponto = caminho[idx];
        this.posicao = ponto;
        const altura = Math.sin(p * Math.PI) * 70;

        /*
         * A pose é interpolada ANTES de posicionar, e o giro do pulso sai
         * dela. Antes o giro era calculado à parte, como `alvo.pulso.rot · p`:
         * isso o fazia valer zero no primeiro frame de todo percurso, então
         * a cada movimento o pulso voltava ao meio antes de ir para o alvo
         * seguinte — um solavanco no instante em que o dedo começa a andar,
         * que é justamente quando o olho está olhando. Lido da pose
         * interpolada, o giro é contínuo entre um movimento e o próximo,
         * pela mesma razão que as juntas são.
         */
        const avanco = Math.min(1, p * 1.6);
        this.poseAtual = interpolarPose(posePartida, poseAlvo, avanco);

        /*
         * O alvo é da PONTA DESENHADA, não da âncora.
         *
         * A âncora é um ponto fixo do desenho; a ponta que o olho vê se move
         * com a pose, porque a flexão encurta cada falange. Em `pressionando`
         * a diferença chega a 48 unidades do viewBox — quase três vezes a
         * altura de uma tecla — e o portão visual flagrou o resultado: 30
         * frames de tecla afundada com o dedo desenhado fora dela.
         *
         * A correção é recalculada a cada frame, a partir da pose
         * interpolada, e é isso que faz o dedo ficar PARADO na tecla
         * enquanto o resto da mão se acomoda em volta — que é o que uma mão
         * de verdade faz ao apertar um botão.
         */
        const desvio = deslocamentoDaPonta(this.poseAtual);
        this.render.posicionar(
          ponto.x - desvio.x * ESCALA_DA_MAO,
          ponto.y - desvio.y * ESCALA_DA_MAO,
          { rot: this.poseAtual.pulso.rot, escala: ESCALA_DA_MAO, altura },
        );
        this.render.aplicarPose(this.poseAtual);
      },
    });
    return t;
  }

  /**
   * Executa um voto completo. Devolve Promise para a fila.
   *
   * `urna` é a MÁQUINA em que a mão vai digitar, e `destino` é a urna do
   * CANDIDATO — quem recebe o voto. Os dois deixaram de ser a mesma coisa no
   * dia em que a urna virou máquina: dois espectadores mandando o presente
   * do 13 no mesmo segundo precisam de duas urnas para digitar, e só existe
   * um candidato do 13 para receber os dois votos.
   *
   * Sem `destino` — um voto enfileirado à mão, num teste — quem recebe é a
   * própria máquina, que é como o projeto funcionava antes de existirem as
   * duas mãos.
   */
  executarVoto({ urna, destino, numero, votos, usuario = '', presente = '' }) {
    // Quem recebe o voto, e quem apenas o digita.
    const dono = destino ?? urna;
    return new Promise((resolve) => {
      const timeline = this.pool.obter();
      const geometria = this.geometriaDe(urna);

      /*
       * A etiqueta entra junto com a mão, no primeiro quadro do voto — e não
       * quando a cédula sai, que é quando o nome de quem mandou costuma
       * aparecer. Aqui não: quem olha precisa saber de quem é a mão ENQUANTO
       * ela digita, senão o nome chega depois de o voto já ter sido dado e
       * não explica mais nada.
       */
      tentar('mostrar a etiqueta', () =>
        this.render.mostrarBadge?.(usuario, urna.config?.corPrimaria));

      construirSequenciaDeVoto({
        geometria,
        numero,
        votos,
        timeline,
        callbacks: {
          aoDestacar: () => urna.el.classList.add(CLASSES_DE_ESTADO.destacada),
          aoMoverMao: ({ alvo, pose, duracao }) => this.moverPara({ alvo, pose, duracao, timeline }),
          aoTeclar: (t) => {
            urna.pressionarTecla(t);
            urna.acenderLed(t, true);
            /*
             * O voto passa a valer quando a tecla CONFIRMA afunda — que é
             * quando a urna de verdade o registra. Contar só no fim, quando
             * a cédula é depositada, faria a tela anunciar "VOTO
             * CONFIRMADO" com a contagem velha e o placar parado por um
             * segundo inteiro, como se o voto não tivesse entrado.
             */
            if (t === 'CONFIRMA') this.avisarContagem(dono, numero, votos);
          },
          aoSoltarTecla: (t) => { urna.soltarTecla(t); setTimeout(() => urna.acenderLed(t, false), 140); },
          /*
           * A máquina completa o estado com a identidade DELA — cor, cargo,
           * e a identidade dela em repouso —, e o voto entra por cima.
           *
           * A ficha que aparece na tela é a do candidato que está sendo
           * votado, e não a do dono da máquina. Sem isto, a segunda rosa do
           * 13 — que vai para a urna azul porque a vermelha está ocupada —
           * digitaria o 13 numa urna que não conhece o 13, e o eleitor
           * confirmaria o voto na frente de uma ficha vazia.
           *
           * O repouso é a exceção, e é de propósito: acabado o voto, a
           * máquina volta a ser ela mesma. É o que ela é entre um eleitor e
           * outro.
           */
          aoMostrarTela: (estado) => urna.definirTela(estado.tipo === 'ocioso' ? estado : {
            ...estado,
            numero,
            candidato: dono.config?.candidato,
            // A contagem é a do CANDIDATO, e não a da máquina: a tela
            // anuncia "VOTO CONFIRMADO" para quem recebeu o voto.
            votos: dono.config?.contagem?.() ?? votos,
          }),
          aoSairCedula: () => {
            urna.mostrarCedula({ usuario, presente, votos });
            urna.el.classList.add(CLASSES_DE_ESTADO.cedulaSaindo);
          },
          aoDepositarCedula: () => urna.el.classList.add(CLASSES_DE_ESTADO.cedulaEntrando),
          aoContar: () => {
            urna.esconderCedula();
            urna.el.classList.remove(CLASSES_DE_ESTADO.cedulaSaindo, CLASSES_DE_ESTADO.cedulaEntrando);
            urna.el.classList.add(CLASSES_DE_ESTADO.contando);
          },
        },
      });

      /*
       * O `resolve()` é inalcançável por falha: ele fica FORA dos `tentar`.
       * Enquanto era a última linha do callback, um erro antes dele deixava
       * a promessa pendente para sempre — e `Timeline` engole o que sai de
       * `aoTerminar` (timeline.js:109), então não havia nem erro na tela. O
       * `.finally` do laço nunca rodava, `this.ocupado` ficava `true` e o
       * passo do ator passava a sair cedo em todo frame: a fila morria em
       * silêncio e só recarregar a página trazia a mão de volta.
       */
      timeline.aoTerminar(() => {
        tentar('devolver a urna ao repouso', () => urna.restaurarAoRepouso());
        tentar('recolher a mão', () => this.recolher());
        tentar('esconder a etiqueta', () => this.render.esconderBadge?.());
        tentar('devolver a timeline ao pool', () => this.pool.devolver(timeline));
        resolve();
      });

      timeline.play();
      this.ticker.registrar(timeline);
    });
  }

  recolher() {
    this.posicao = { ...MAO_FORA_DE_CENA };
    this.poseAtual = POSES.repouso;
    const desvio = deslocamentoDaPonta(this.poseAtual);
    this.render.posicionar(
      this.posicao.x - desvio.x * ESCALA_DA_MAO,
      this.posicao.y - desvio.y * ESCALA_DA_MAO,
      { escala: ESCALA_DA_MAO, altura: 0 },
    );
    this.render.aplicarPose(this.poseAtual);
  }

  /**
   * O laço de frames do ator.
   *
   * Não abre um requestAnimationFrame próprio: a aplicação tem um único RAF,
   * no Ticker, e este passo entra nele junto com as timelines. Um RAF por
   * subsistema é o caminho mais curto para dessincronizar animação e fila.
   *
   * O `finally` garante que uma animação que falha não deixa a fila travada.
   */
  iniciar() {
    this.ticker.registrarPasso((delta) => {
      if (this.tickDaFila) this.fila.tick(delta);
      if (this.ocupado) return;

      /*
       * A urna é reservada ANTES de o voto sair da fila.
       *
       * Enquanto a escolha era feita por quem enfileirava, a decisão saía no
       * escuro: no instante em que o segundo presente do 13 entrava, a urna
       * do Lula ainda não estava ocupada, então os dois votos saíam com a
       * mesma máquina na mão — duas mãos na mesma tecla, e a outra urna
       * parada no enquadramento.
       *
       * `espiar` em vez de `proximo` porque a reserva pode não dar em nada:
       * com as máquinas todas tomadas, este passo espera o próximo quadro em
       * vez de tirar um voto da fila e ficar sem onde executá-lo.
       */
      const espiado = this.fila.espiar();
      if (!espiado) return;
      const urna = this.reserva ? this.reserva.pegar(espiado) : espiado.urna;
      if (!urna) return;

      const item = this.fila.proximo();
      if (!item) { this.reserva?.devolver(urna); return; }

      this.ocupado = true;
      const executar = item.modo === 'lote'
        ? this.carimbar(item, urna)
        : this.executarVoto({ ...item, urna });

      executar
        .catch((erro) => console.error('[ator] falha ao animar voto', erro))
        .finally(() => {
          this.fila.concluir(item.id);
          this.reserva?.devolver(urna);
          this.ocupado = false;
        });
    });
  }

  /**
   * Avisa quem conta os votos. Um lugar só, para os dois caminhos.
   *
   * O aviso leva a urna do CANDIDATO — a máquina em que a mão digitou não
   * entra na conta. É esta linha que faz o voto do 13 dado na urna azul
   * somar para o Lula em vez de somar para o dono do gabinete azul.
   */
  avisarContagem(dono, numero, votos) {
    tentar('avisar quem conta os votos', () => this.aoContarVoto({
      urnaId: dono.config.id, numero, votos,
    }));
  }

  /**
   * Modo lote: sob rajada, um carimbo rápido no lugar da sequência inteira.
   * O voto já foi contado — este carimbo é só o registro visual de que
   * ele passou. Precisa ser visível, senão a rajada parece não fazer nada.
   */
  carimbar(item, maquina = item.urna) {
    return new Promise((resolve) => {
      const urna = maquina;
      // O carimbo não passa pela coreografia, então o aviso sai aqui: sem
      // ele, uma rajada de cem votos movia a mão cem vezes e não somava
      // nenhum no placar.
      this.avisarContagem(item.destino ?? urna, item.numero, item.votos ?? 1);
      urna.el.classList.add(CLASSES_DE_ESTADO.destacada, CLASSES_DE_ESTADO.contando);
      urna.pressionarTecla('CONFIRMA');
      urna.acenderLed('CONFIRMA', true);

      setTimeout(() => {
        urna.soltarTecla('CONFIRMA');
        urna.acenderLed('CONFIRMA', false);
        urna.el.classList.remove(CLASSES_DE_ESTADO.destacada, CLASSES_DE_ESTADO.contando);
        resolve();
      }, 260 / this.fila.velocidade);
    });
  }
}
