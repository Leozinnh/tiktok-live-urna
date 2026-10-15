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
 * O que a live manda além de presente.
 *
 * A lista é FECHADA de propósito. Um tipo desconhecido não é um evento
 * incompleto, é uma versão futura da ponte falando com um servidor antigo —
 * e inventar um evento a partir dele faria o narrador narrar coisa nenhuma,
 * com o nome do usuário no meio.
 *
 * `comentario` não está aqui e não é esquecimento: comentário é o canal de
 * comando do outro projeto, chega dezenas por minuto, e narrar cada um
 * transformaria o narrador num leitor de chat. Se um dia fizer falta, entra
 * aqui e ganha uma frase.
 */
export const TIPOS_SOCIAIS = ['seguidor', 'curtida', 'entrada', 'compartilhou', 'assinatura'];

/**
 * O evento comum.
 *
 *   presente  { tipo, plataforma, userId, usuario, giftId, giftNome,
 *               combo, comboIndex, em }
 *   social    { tipo, plataforma, userId, usuario, [quantidade], em }
 *
 * O `tipo` é o discriminador, e é o que separa "isto conta um voto" de "isto
 * merece uma fala". Sem ele, um seguidor chegando virava `null` e o narrador
 * ficava mudo sem nada acusar erro.
 *
 * Devolve `null` quando não dá para saber o que é. No presente isso é mais
 * sério do que parece: sem `giftId` não há como mapear o presente para uma
 * urna, e a seção 7 é explícita em que contar para a urna errada é pior do
 * que não contar.
 */
export function normalizarEvento(bruto, plataforma = 'simulador') {
  if (!bruto) return null;

  const texto = (valor) => (valor == null ? '' : String(valor).trim());
  const inteiro = (valor, padrao) => {
    const n = Math.floor(Number(valor));
    return Number.isFinite(n) && n > 0 ? n : padrao;
  };

  const temGiftId = bruto.giftId != null && bruto.giftId !== '';

  /*
   * O `tipo` escrito MANDA. O `giftId` só decide quando ninguém disse o tipo,
   * que é o caso do simulador — ele nasceu antes disto existir e não manda
   * `tipo` nenhum.
   *
   * A ordem importa: um evento que se declara `seguidor` e traz um `giftId`
   * de brinde NÃO pode virar voto. A regra nunca é "tem giftId, então conta";
   * é sempre "o que este evento diz que é".
   */
  const tipo = texto(bruto.tipo).toLowerCase() || (temGiftId ? 'presente' : '');

  const comum = {
    tipo,
    plataforma: texto(bruto.plataforma) || plataforma,
    userId: texto(bruto.userId),
    // A TikTok chama de `nickname` em algumas versões e de `userName` em
    // outras; o resto do sistema só conhece `usuario`.
    usuario: texto(bruto.usuario ?? bruto.userName ?? bruto.nickname),
    em: Number.isFinite(Number(bruto.em)) ? Number(bruto.em) : Date.now(),
  };

  if (tipo === 'presente') {
    if (!temGiftId) return null;
    return {
      ...comum,
      /*
       * O `giftId` vira texto porque ele é comparado com `===` contra o que
       * está escrito no painel, e a TikTok manda número em algumas versões do
       * protocolo e texto em outras. Sem isto, o presente chegaria, não
       * acharia urna, e não contaria — o defeito mais caro possível, porque
       * some sem deixar rastro.
       */
      giftId: String(bruto.giftId),
      giftNome: texto(bruto.giftNome ?? bruto.giftName),
      // Combo ausente é presente simples. Combo zero contaria zero votos e o
      // presente sumiria da contagem sem aviso nenhum.
      combo: inteiro(bruto.combo, 1),
      comboIndex: Number.isFinite(Number(bruto.comboIndex))
        ? Math.max(0, Math.floor(Number(bruto.comboIndex)))
        : 0,
    };
  }

  if (TIPOS_SOCIAIS.includes(tipo)) {
    // A quantidade só existe onde ela significa alguma coisa. Uma entrada
    // com `quantidade: 1` seria um campo que ninguém pode ler sem desconfiar.
    return tipo === 'curtida'
      ? { ...comum, quantidade: inteiro(bruto.quantidade ?? bruto.count, 1) }
      : comum;
  }

  return null;
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
