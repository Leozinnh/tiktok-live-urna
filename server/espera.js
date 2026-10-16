/**
 * A espera do número no chat.
 *
 * O pedido do Leonardo, literal: "quando alguém enviar outro presente que não
 * seja rosa ou joinha, esperar ele escrever o número no chat; se demorar mais
 * de 15s, avisar por voz".
 *
 * O buraco que isto tapa é o do presente ÓRFÃO. Um presente mapeado no painel
 * já sabe para onde vai; um que a TikTok inventou ontem, ou que o Leonardo
 * ainda não cadastrou, não sabe — e até agora ele simplesmente sumia: sem
 * voto, sem fala, sem nada na tela. Quem mandou ficava sem entender por que o
 * presente caro não fez nada.
 *
 * Agora ele abre uma janela. O presente guarda o lugar dele, o número que o
 * espectador escrever no chat decide a urna, e o silêncio de quinze segundos é
 * respondido com uma cobrança falada — que é o que transforma um presente
 * perdido numa pessoa avisada.
 *
 * Duas regras governam o arquivo inteiro, e as duas são sobre NÃO contar
 * errado:
 *
 *   - o resgate é por AUTOR. O chat é público, e sem isto qualquer um
 *     digitando "22" levaria o presente alheio para a urna que quisesse;
 *   - número que não existe não queima a espera. Ele pode ter se enganado e
 *     escrever de novo — e uma espera queimada por um erro de digitação é um
 *     presente que sumiu por causa de um dedo.
 *
 * O relógio entra por parâmetro porque uma regra de tempo testada com o
 * relógio de verdade é um teste que demora quinze segundos e falha uma vez em
 * cada dez.
 */

/** Quinze segundos, do pedido. Aqui com nome porque o painel vai mostrá-lo. */
export const JANELA_PADRAO_MS = 15_000;

/**
 * As urnas que têm número, no formato `{ id, numero }`.
 *
 * A peneira olha o valor CRU, antes de converter, e a ordem é o teste inteiro:
 * `Number('')` e `Number(null)` são `0`, e uma urna com o campo apagado no
 * painel casaria com qualquer "0" escrito no chat — um voto para a urna
 * errada, do nada. Convertendo depois de peneirar, o campo vazio não chega a
 * virar número.
 *
 * Existe aqui, e é importada por quem também decide voto pelo número escrito
 * (`chat-voto.js`), porque duas peneiras que decidem a mesma coisa acabam
 * discordando — e a que ficasse para trás seria a que conta voto errado.
 */
export function urnasComNumero(urnas = []) {
  return (urnas ?? [])
    .filter((u) => u?.id && u.numero != null && String(u.numero).trim() !== '')
    .map((u) => ({ id: u.id, numero: Number(u.numero) }))
    .filter((u) => Number.isFinite(u.numero));
}

/**
 * O número de urna escrito num texto de chat, se houver.
 *
 * A busca é por NÚMERO INTEIRO, e não por trecho: "1222" não é o voto 22, e
 * "2022" num comentário qualquer também não é. Sem isso, um telefone, um
 * horário ou um ano passariam a contar voto — o tipo de defeito que só
 * aparece na live e nunca no teste.
 *
 * Em troca, o número colado numa palavra vale ("voto22" e "22!" são a mesma
 * intenção). Exigir o número isolado por espaço puniria quem escreve rápido,
 * que é todo mundo no chat de uma live.
 *
 * Compara por VALOR e não por texto: "022" é o mesmo voto que "22".
 */
export function acharNumero(texto, urnas = []) {
  const validas = urnasComNumero(urnas);
  if (validas.length === 0) return null;

  for (const run of String(texto ?? '').match(/\d+/g) ?? []) {
    const achada = validas.find((u) => u.numero === Number(run));
    if (achada) return { numero: String(achada.numero), urnaId: achada.id };
  }
  return null;
}

/**
 * @param {object} opcoes
 * @param {number} [opcoes.janelaMs] quanto tempo se espera pelo número
 * @param {Function} [opcoes.agora]  o relógio, em ms; existe para o teste
 */
export function criarEspera({ janelaMs = JANELA_PADRAO_MS, agora = Date.now } = {}) {
  /** userId → a espera em aberto daquela pessoa. Uma por pessoa, e não uma por presente. */
  const abertas = new Map();

  /*
   * A janela pode ser um NÚMERO ou uma FUNÇÃO, pelo mesmo motivo das frases do
   * narrador: o Leonardo muda o prazo no painel com a rodada no ar, e uma
   * janela lida no dia em que o hub nasceu só valeria depois de reiniciar o
   * servidor. Valor ausente ou inválido cai no padrão — um campo apagado no
   * painel não pode fazer a espera vencer no mesmo instante em que o presente
   * chegou.
   */
  const janelaAgora = () => {
    const v = Number(typeof janelaMs === 'function' ? janelaMs() : janelaMs);
    return Number.isFinite(v) && v > 0 ? v : JANELA_PADRAO_MS;
  };

  return {
    /** Quantas pessoas estão esperando agora. O painel mostra este número. */
    get pendentes() { return abertas.size; },

    get janelaMs() { return janelaAgora(); },

    /** O retrato das esperas em aberto, para o painel. Não as consome. */
    lista() { return [...abertas.values()].map((e) => ({ ...e })); },

    /**
     * Um presente sem urna abre — ou RENOVA — a espera do autor.
     *
     * Renova, e não abre uma segunda: quem manda três diamantes seguidos está
     * mandando três votos e pedindo mais tempo, e o relógio reinicia no
     * último porque a espera é do GESTO, que terminou agora. Os combos somam:
     * três presentes são três votos, e perdê-los no caminho seria contar
     * menos do que a pessoa pagou.
     *
     * @returns {object} a espera como ela ficou
     */
    abrir({ userId, usuario = '', giftId = '', presente = '', combo = 1, em = null } = {}) {
      const chave = String(userId ?? '');
      /*
       * O `em` ausente vale o relógio de agora — e a checagem do nulo vem
       * ANTES da do número de propósito: `Number(null)` é `0`, que passa por
       * finito, e toda espera nasceria com o relógio em zero. O efeito seria
       * a espera vencer no mesmo instante em que o presente chegou, e a
       * cobrança falada sair antes de a pessoa ter chance de escrever.
       */
      const quando = em == null || em === ''
        ? agora()
        : (Number.isFinite(Number(em)) ? Number(em) : agora());
      const antes = abertas.get(chave);
      const quantos = Math.max(0, Math.floor(Number(combo) || 0));

      const nova = {
        userId: chave,
        usuario: String(usuario ?? ''),
        // O gesto é novo, e um gesto novo merece ser cobrado de novo. Zerar a
        // marca aqui é o que faz o segundo presente órfão da mesma pessoa
        // falar — sem isto ele cairia no silêncio de uma cobrança que já
        // tinha acontecido por causa do primeiro.
        cobrada: false,
        // O presente mais RECENTE dá o nome da etiqueta: é o que a pessoa
        // acabou de mandar, e é ele que ela reconhece na tela.
        giftId: String(giftId ?? ''),
        presente: String(presente ?? ''),
        combo: (antes?.combo ?? 0) + quantos,
        desde: quando,
      };
      abertas.set(chave, nova);
      return { ...nova };
    },

    /**
     * O texto do chat tenta resgatar o presente do próprio autor.
     *
     * Devolve a espera inteira (com o presente e o combo) mais a urna
     * escolhida, ou `null` para "não é comigo" — que é a resposta da enorme
     * maioria dos comentários de uma live. `null` não queima nada: quem
     * escreveu "99" por engano ainda tem os quinze segundos dele.
     */
    resgatar({ userId, texto, urnas = [] } = {}) {
      const chave = String(userId ?? '');
      const aberta = abertas.get(chave);
      if (!aberta) return null;

      const achado = acharNumero(texto, urnas);
      if (!achado) return null;

      abertas.delete(chave);
      return { ...aberta, numero: achado.numero, urnaId: achado.urnaId };
    },

    /**
     * As esperas que passaram da janela, e que saem daqui já MARCADAS.
     *
     * Marcadas, e não apagadas, e a diferença é quem escreve no segundo
     * dezesseis: o presente foi pago e o número veio, então o voto ainda tem
     * que acontecer. Apagar a espera no instante da cobrança puniria a demora
     * de quem já pagou — e logo depois de a voz ter pedido o número.
     *
     * O que a marca impede é a cobrança repetida, que era o motivo de apagar:
     * quem chama isto fala para cada item devolvido, e uma espera que voltasse
     * a ser devolvida seria falada de novo no segundo seguinte, e no outro,
     * até alguém reiniciar o servidor.
     *
     * A espera marcada sai de cena pelo resgate, pela troca de rodada, ou por
     * um presente novo do mesmo autor — que zera a marca.
     */
    vencidas() {
      const t = agora();
      const janela = janelaAgora();
      const fora = [];
      for (const e of abertas.values()) {
        if (e.cobrada || t - e.desde < janela) continue;
        e.cobrada = true;
        fora.push({ ...e });
      }
      // Da mais antiga para a mais nova, e não na ordem em que o Map as
      // guarda: quem espera há mais tempo é cobrado primeiro, e a fila da voz
      // sai na ordem em que as pessoas ficaram sem resposta.
      return fora.sort((a, b) => a.desde - b.desde);
    },

    /** Esquece tudo. É o que a troca de rodada faz. */
    limpar() { abertas.clear(); },
  };
}
