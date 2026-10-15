// Puro: não toca no DOM. A fila decide *o que* rodar; quem desenha é o ator.

export const PRIORIDADE = { normal: 0, alta: 1, maxima: 2 };

/**
 * A fila controla apenas o espetáculo. A contagem do voto já aconteceu
 * antes de o item chegar aqui — por isso nada é recusado, nunca.
 * Quando a fila enche, a *animação* degrada para um carimbo rápido.
 */
export class FilaDeAnimacao {
  constructor({
    maxSimultaneas = 1,
    limiarLote = 8,
    duracaoBaseMs = 4500,
    fatorWatchdog = 2,
  } = {}) {
    this.maxSimultaneas = maxSimultaneas;
    this.limiarLote = limiarLote;
    this.duracaoBaseMs = duracaoBaseMs;
    this.fatorWatchdog = fatorWatchdog;

    this.itens = [];
    this.rodando = new Set();
    this.velocidade = 1;
    this.recusados = 0;
    this._tempoRodando = 0;
  }

  get pendentes() { return this.itens.length; }
  get emLote() { return this.itens.filter((i) => i.modo === 'lote').length; }
  get ocupada() { return this.rodando.size >= this.maxSimultaneas; }

  setVelocidade(multiplicador) {
    this.velocidade = Math.max(0.05, Number(multiplicador) || 1);
  }

  /**
   * Aceita sempre. Devolve { aceito, modo } para quem chamou saber se
   * esta animação vai ser completa ou um carimbo.
   */
  enfileirar(item) {
    const totalNaFrente = this.itens.length + this.rodando.size;
    const modo = totalNaFrente >= this.limiarLote ? 'lote' : 'completo';
    this.itens.push({ ...item, modo });
    this.itens.sort((a, b) => (b.prioridade ?? 0) - (a.prioridade ?? 0));
    return { aceito: true, modo };
  }

  /** Devolve o próximo item ou null se a fila estiver ocupada ou vazia. */
  proximo() {
    if (this.ocupada || this.itens.length === 0) return null;
    const item = this.itens.shift();
    this.rodando.add(item.id);
    this._tempoRodando = 0;
    return item;
  }

  concluir(id) {
    if (!this.rodando.has(id)) return false;
    this.rodando.delete(id);
    this._tempoRodando = 0;
    return true;
  }

  /**
   * Watchdog: uma animação que passa de fatorWatchdog × duração base
   * está travada. Libera a fila para o espetáculo não parar.
   *
   * O acúmulo é em tempo virtual (delta × velocidade) contra um limite
   * fixo, o que equivale a medir tempo de parede contra um limite
   * dividido pela velocidade: a 2x a sequência termina na metade do
   * tempo real, e o prazo de segurança cai junto.
   */
  tick(deltaMs) {
    if (this.rodando.size === 0) return;
    this._tempoRodando += deltaMs * this.velocidade;
    const limite = this.duracaoBaseMs * this.fatorWatchdog;
    if (this._tempoRodando > limite) {
      for (const id of this.rodando) this.rodando.delete(id);
      this._tempoRodando = 0;
    }
  }

  /** Esvazia a fila devolvendo os pendentes — usado ao encerrar a rodada. */
  drenar() {
    const restantes = this.itens.slice();
    this.itens = [];
    return restantes;
  }

  limpar() {
    this.itens = [];
    this.rodando.clear();
    this._tempoRodando = 0;
  }
}
