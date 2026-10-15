import { resolverEasing } from './easing.js';

/**
 * Um delta maior que isto é tratado como "a aba ficou em segundo plano".
 * Sem o limite, a mão teleportaria e a fila votaria tudo de uma vez ao voltar.
 */
export const DELTA_MAXIMO_MS = 100;

/**
 * Motor de keyframes. Puro: não sabe o que é DOM nem requestAnimationFrame —
 * recebe o delta em milissegundos por tick(). É isto que o torna testável.
 */
export class Timeline {
  constructor() {
    this.itens = [];
    this.decorrido = 0;
    this.velocidade = 1;
    this.rodando = false;
    this.concluida = false;
    this.cancelada = false;
    this._disparados = new Set();
    this._aoTerminar = null;
  }

  add(id, { at = 0, dur = 0, ease = 'linear', from, to, onUpdate, onStart, onComplete } = {}) {
    this.itens.push({
      tipo: 'tween', id, at, dur,
      ease: resolverEasing(ease),
      from, to, onUpdate, onStart, onComplete,
    });
    return this;
  }

  chamar(id, { at = 0, fn } = {}) {
    this.itens.push({ tipo: 'call', id, at, dur: 0, fn });
    return this;
  }

  get duracao() {
    return this.itens.reduce((maior, i) => Math.max(maior, i.at + i.dur), 0);
  }

  play() { this.rodando = true; return this; }
  pause() { this.rodando = false; return this; }

  setVelocidade(multiplicador) {
    this.velocidade = Math.max(0.05, Number(multiplicador) || 1);
    return this;
  }

  aoTerminar(fn) { this._aoTerminar = fn; return this; }

  cancelar() {
    this.cancelada = true;
    this.rodando = false;
  }

  /**
   * Avança a timeline. Devolve true enquanto ainda estiver rodando.
   * Um erro dentro de um callback é isolado: os outros itens continuam,
   * porque uma exceção que aborta a timeline deixa a mão presa na tela.
   */
  tick(deltaMs) {
    if (!this.rodando || this.concluida || this.cancelada) return false;

    const delta = Math.min(Math.max(deltaMs, 0), DELTA_MAXIMO_MS) * this.velocidade;
    this.decorrido += delta;

    for (const item of this.itens) {
      const inicio = item.at;
      const fim = item.at + item.dur;
      const chaveInicio = `${item.id}:inicio`;
      const chaveFim = `${item.id}:fim`;

      try {
        if (this.decorrido >= inicio && !this._disparados.has(chaveInicio)) {
          this._disparados.add(chaveInicio);
          item.onStart?.();
        }

        if (item.tipo === 'tween') {
          if (this.decorrido >= inicio) {
            const bruto = fim === inicio ? 1 : (this.decorrido - inicio) / item.dur;
            const p = item.ease(Math.min(bruto, 1));
            const valor = item.from === undefined
              ? p
              : item.from + (item.to - item.from) * p;
            item.onUpdate?.(valor, p);
          }
        } else if (this.decorrido >= inicio && !this._disparados.has(chaveFim)) {
          this._disparados.add(chaveFim);
          item.fn?.();
        }

        if (this.decorrido >= fim && !this._disparados.has(chaveFim)) {
          this._disparados.add(chaveFim);
          item.onComplete?.();
        }
      } catch (erro) {
        console.error(`[timeline] falha no item "${item.id}"`, erro);
        this._disparados.add(chaveInicio);
        this._disparados.add(chaveFim);
      }
    }

    if (this.decorrido >= this.duracao) {
      this.concluida = true;
      this.rodando = false;
      try { this._aoTerminar?.(); } catch (erro) { console.error('[timeline] falha em aoTerminar', erro); }
      return false;
    }
    return true;
  }

  /** Devolve a instância ao estado limpo para ser reciclada pelo pool. */
  reset() {
    this.itens = [];
    this.decorrido = 0;
    this.velocidade = 1;
    this.rodando = false;
    this.concluida = false;
    this.cancelada = false;
    this._disparados.clear();
    this._aoTerminar = null;
    return this;
  }
}

/**
 * Um único requestAnimationFrame para toda a aplicação.
 * Várias timelines são avançadas no mesmo frame — não uma RAF por animação.
 */
export class Ticker {
  constructor({ raf, agora } = {}) {
    this._raf = raf ?? ((fn) => requestAnimationFrame(fn));
    this._agora = agora ?? (() => performance.now());
    this.timelines = new Set();
    this.passos = new Set();     // callbacks por frame (watchdog da fila, etc.)
    this.rodando = false;
    this._ultimo = 0;
    this._id = null;
  }

  registrar(timeline) { this.timelines.add(timeline); return this; }
  remover(timeline) { this.timelines.delete(timeline); return this; }

  /** Um callback por frame, para quem não é uma Timeline (a fila, por exemplo). */
  registrarPasso(fn) { this.passos.add(fn); return this; }
  removerPasso(fn) { this.passos.delete(fn); return this; }

  /**
   * Avança um frame. Separado do laço de RAF justamente para ser testável:
   * aqui não existe requestAnimationFrame, só um delta em milissegundos.
   */
  avancar(delta) {
    for (const t of [...this.timelines]) {
      if (!t.tick(delta)) this.timelines.delete(t);
    }
    for (const fn of [...this.passos]) {
      try { fn(delta); } catch (erro) { console.error('[ticker] passo falhou', erro); }
    }
  }

  iniciar() {
    if (this.rodando) return this;
    this.rodando = true;
    this._ultimo = this._agora();
    const passo = () => {
      if (!this.rodando) return;
      const agora = this._agora();
      const delta = agora - this._ultimo;
      this._ultimo = agora;
      this.avancar(delta);
      this._id = this._raf(passo);
    };
    this._id = this._raf(passo);
    return this;
  }

  parar() {
    this.rodando = false;
    if (this._id != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._id);
    }
    this._id = null;
  }
}

/**
 * Pool limitado. Numa live de horas, criar uma Timeline por voto gera
 * pressão de coletor de lixo; reciclar mantém o consumo estável.
 */
export class PoolDeTimelines {
  constructor({ max = 24 } = {}) {
    this.max = max;
    this.livres = [];
  }

  get tamanho() { return this.livres.length; }

  obter() {
    return this.livres.pop() ?? new Timeline();
  }

  devolver(timeline) {
    const limpa = timeline.reset();
    if (this.livres.length < this.max) this.livres.push(limpa);
  }
}
