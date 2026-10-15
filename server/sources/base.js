/**
 * A interface `EventSource` — seção 4.7 da especificação.
 *
 * O adaptador da TikTok é a Etapa 7, e é justamente por isso que esta
 * interface existe agora: o resto do sistema não pode saber de onde o
 * presente veio. Daqui para dentro é a bagunça do mundo real; daqui para
 * fora, todo evento tem a mesma forma.
 *
 * Duas coisas moram aqui, e só duas:
 *
 *   - `normalizarEvento`, que traduz o que a rede entrega para o formato
 *     comum. É o único lugar onde essa tradução acontece, e é o que faz o
 *     simulador e a TikTok real passarem pelo mesmo caminho;
 *   - `criarFonte`, a casca que todo adaptador compartilha: quem se
 *     inscreve, quem é avisado quando a conexão muda, e a garantia de que
 *     um ouvinte quebrado não cala os outros.
 */

/**
 * O evento comum.
 *
 *   { plataforma, userId, usuario, giftId, giftNome, combo, comboIndex, em }
 *
 * Devolve `null` quando não há `giftId`: sem ele não há como mapear o
 * presente para uma urna, e a seção 7 é explícita em que contar para a urna
 * errada é pior do que não contar.
 */
export function normalizarEvento(bruto, plataforma = 'simulador') {
  if (!bruto || bruto.giftId == null || bruto.giftId === '') return null;

  /*
   * O `giftId` vira texto porque ele é comparado com `===` contra o que está
   * escrito no painel, e a TikTok manda número em algumas versões do
   * protocolo e texto em outras. Sem isto, o presente chegaria, não acharia
   * urna, e não contaria — o defeito mais caro possível, porque some sem
   * deixar rastro.
   */
  const giftId = String(bruto.giftId);
  const inteiro = (valor, padrao) => {
    const n = Math.floor(Number(valor));
    return Number.isFinite(n) && n > 0 ? n : padrao;
  };
  const texto = (valor) => (valor == null ? '' : String(valor).trim());

  return {
    plataforma: texto(bruto.plataforma) || plataforma,
    userId: texto(bruto.userId),
    // A TikTok chama de `nickname` em algumas versões e de `userName` em
    // outras; o resto do sistema só conhece `usuario`.
    usuario: texto(bruto.usuario ?? bruto.userName ?? bruto.nickname),
    giftId,
    giftNome: texto(bruto.giftNome ?? bruto.giftName),
    // Combo ausente é presente simples. Combo zero contaria zero votos e o
    // presente sumiria da contagem sem aviso nenhum.
    combo: inteiro(bruto.combo, 1),
    comboIndex: Number.isFinite(Number(bruto.comboIndex)) ? Math.max(0, Math.floor(Number(bruto.comboIndex))) : 0,
    em: Number.isFinite(Number(bruto.em)) ? Number(bruto.em) : Date.now(),
  };
}

/**
 * A casca que todo adaptador compartilha.
 *
 * `iniciar` e `parar` são do adaptador — é o que ele tem de diferente. O que
 * está aqui é o que todos têm igual, e o que já foi defeito uma vez: o
 * ouvinte que lança e derruba a entrega dos outros.
 */
export function criarFonte({ modo, detalhe = '', iniciar = null, parar = null }) {
  const ouvintes = new Set();
  const ouvintesDeStatus = new Set();
  let conectada = false;
  let texto = detalhe;

  function avisarStatus() {
    const estado = { modo, conectado: conectada, detalhe: texto };
    for (const fn of [...ouvintesDeStatus]) {
      try {
        fn(estado);
      } catch (erro) {
        console.error(`[fonte:${modo}] ouvinte de status falhou: ${erro.message}`);
      }
    }
  }

  return {
    modo,
    get conectada() { return conectada; },
    status: () => ({ modo, conectado: conectada, detalhe: texto }),

    aoEvento(fn) {
      ouvintes.add(fn);
      return () => ouvintes.delete(fn);
    },

    aoStatus(fn) {
      ouvintesDeStatus.add(fn);
      return () => ouvintesDeStatus.delete(fn);
    },

    /**
     * Entrega um evento já normalizado. `false` quando ele não é evento.
     *
     * Um ouvinte que lança é registrado e ignorado: o hub com a conexão já
     * fechada não pode impedir o próximo ouvinte de receber o voto. A seção
     * 7 pede que a live não pare por causa de um erro, e é aqui que isso
     * vira código.
     */
    emitir(evento) {
      if (!evento) return false;
      for (const fn of [...ouvintes]) {
        try {
          fn(evento);
        } catch (erro) {
          console.error(`[fonte:${modo}] ouvinte falhou: ${erro.message}`);
        }
      }
      return true;
    },

    /** Marca o estado da conexão e avisa quem estiver olhando. */
    definirConectada(novo, novoDetalhe = texto) {
      texto = novoDetalhe;
      if (conectada === novo) return;
      conectada = novo;
      avisarStatus();
    },

    iniciar() {
      if (conectada) return false;
      const resultado = iniciar?.(this) ?? true;
      return resultado === false ? false : true;
    },

    parar() {
      if (!conectada) return false;
      parar?.(this);
      return true;
    },
  };
}
