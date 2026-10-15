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

  /**
   * Há voto acontecendo: alguém esperando ou alguma mão já trabalhando.
   *
   * Diferente de `ocupada`, que responde "não há mão livre?" — pergunta sobre
   * capacidade, e não sobre atividade. Com uma mão só as duas coincidiam, e
   * por isso a diferença passou despercebida até existirem duas: com uma mão
   * trabalhando e a outra livre, `ocupada` é FALSO e há um voto na frente da
   * câmera.
   *
   * Quem pergunta "posso mexer no placar agora?" quer ESTA resposta.
   */
  get emVoo() { return this.itens.length > 0 || this.rodando.size > 0; }

  /**
   * Quem ainda não começou, na ordem em que vai ser atendido.
   *
   * Existe para a tela poder MOSTRAR a fila sem consumi-la: `proximo()` tira o
   * item, `drenar()` esvazia, e ler `this.itens` direto entregaria a estrutura
   * viva na mão de quem só quer desenhar — um `push` distraído ali dentro
   * quebra a fila inteira. Aqui vai cópia, e cópia rasa item a item, para que
   * mexer no que voltou não alcance a fila.
   */
  esperando() { return this.itens.map((i) => ({ ...i })); }

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

  /**
   * O próximo item, sem tirá-lo da fila. Null nas mesmas condições de
   * `proximo()`.
   *
   * Existe para a mão poder reservar a urna ANTES de se comprometer com o
   * voto. Sem ele a ordem era a inversa — tirar o item e só então descobrir
   * quais urnas estão livres —, e como as duas mãos tiram item no mesmo
   * quadro, o segundo voto do 13 saía com a urna do Lula na mão de quem já
   * a tinha. Não devolve cópia: o item espiado é o MESMO objeto que
   * `proximo()` vai entregar, e é por isso que a reserva feita a partir dele
   * vale para o voto que vai rodar.
   */
  espiar() {
    if (this.ocupada || this.itens.length === 0) return null;
    return this.itens[0];
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
