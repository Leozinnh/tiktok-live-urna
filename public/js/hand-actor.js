import { POSES, interpolarPose } from './hand/poses.js';
import { Timeline, Ticker, PoolDeTimelines } from './anim/timeline.js';
import { FilaDeAnimacao } from './anim/queue.js';
import { construirSequenciaDeVoto } from './vote-sequence.js';

/** Onde a mão espera entre um voto e outro: abaixo da borda do palco. */
export const MAO_FORA_DE_CENA = { x: 540, y: 2000 };

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
    this.fila = new FilaDeAnimacao(opcoes.fila ?? {});
    this.posicao = { ...MAO_FORA_DE_CENA };
    this.poseAtual = POSES.repouso;
    this.timelineAtual = null;
    this.ocupado = false;
    this._geometriaCache = null;
    this._contadorPercurso = 0;

    camada.append(renderizador.sombra, renderizador.el);
    renderizador.posicionar(this.posicao.x, this.posicao.y, { escala: 1 });
    renderizador.aplicarPose(this.poseAtual);
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
    const destino = { x: alvo.x, y: alvo.y - 40 };  // o dedo toca acima do centro da tecla
    const caminho = calcularCaminho(origem, destino, { arco: 70 });
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
        const rot = (poseAlvo.pulso?.rot ?? 0) * p;
        this.render.posicionar(ponto.x, ponto.y, { rot, escala: 1, altura });
        this.poseAtual = interpolarPose(posePartida, poseAlvo, Math.min(1, p * 1.6));
        this.render.aplicarPose(this.poseAtual);
      },
    });
    return t;
  }

  /** Executa um voto completo numa urna. Devolve Promise para a fila. */
  executarVoto({ urna, numero, votos, usuario = '', presente = '' }) {
    return new Promise((resolve) => {
      const timeline = this.pool.obter();
      const geometria = this.geometriaDe(urna);

      construirSequenciaDeVoto({
        geometria,
        numero,
        votos,
        timeline,
        callbacks: {
          aoDestacar: () => urna.el.classList.add('is-destacada'),
          aoMoverMao: ({ alvo, pose }) => this.moverPara({ alvo, pose, timeline }),
          aoTeclar: (t) => { urna.pressionarTecla(t); urna.acenderLed(t, true); },
          aoSoltarTecla: (t) => { urna.soltarTecla(t); setTimeout(() => urna.acenderLed(t, false), 140); },
          aoMostrarTela: (estado) => urna.definirTela({ numero, nome: urna.config.nome, ...estado }),
          aoSairCedula: () => urna.el.classList.add('is-cedula-saindo'),
          aoDepositarCedula: () => urna.el.classList.add('is-cedula-entrando'),
          aoContar: () => {
            urna.el.classList.remove('is-cedula-saindo', 'is-cedula-entrando');
            urna.el.classList.add('is-contando');
          },
        },
      });

      timeline.aoTerminar(() => {
        urna.el.classList.remove('is-destacada', 'is-contando', 'is-cedula-saindo', 'is-cedula-entrando');
        this.recolher();
        this.pool.devolver(timeline);
        resolve();
      });

      timeline.play();
      this.ticker.registrar(timeline);
    });
  }

  recolher() {
    this.posicao = { ...MAO_FORA_DE_CENA };
    this.render.posicionar(this.posicao.x, this.posicao.y, { escala: 1, altura: 0 });
    this.render.aplicarPose(POSES.repouso);
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
      this.fila.tick(delta);
      if (this.ocupado) return;

      const item = this.fila.proximo();
      if (!item) return;

      this.ocupado = true;
      const executar = item.modo === 'lote'
        ? this.carimbar(item)
        : this.executarVoto(item);

      executar
        .catch((erro) => console.error('[ator] falha ao animar voto', erro))
        .finally(() => {
          this.fila.concluir(item.id);
          this.ocupado = false;
        });
    });
  }

  /**
   * Modo lote: sob rajada, um carimbo rápido no lugar da sequência inteira.
   * O voto já foi contado — este carimbo é só o registro visual de que
   * ele passou. Precisa ser visível, senão a rajada parece não fazer nada.
   */
  carimbar(item) {
    return new Promise((resolve) => {
      const urna = item.urna;
      urna.el.classList.add('is-destacada', 'is-contando');
      urna.pressionarTecla('CONFIRMA');
      urna.acenderLed('CONFIRMA', true);

      setTimeout(() => {
        urna.soltarTecla('CONFIRMA');
        urna.acenderLed('CONFIRMA', false);
        urna.el.classList.remove('is-destacada', 'is-contando');
        resolve();
      }, 260 / this.fila.velocidade);
    });
  }
}
