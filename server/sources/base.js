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
 * `comentario` não está aqui e não é esquecimento: chega dezenas por minuto,
 * e narrar cada um transformaria o narrador num leitor de chat. Ele existe
 * no sistema como CANAL DE COMANDO — ver `TIPOS_DE_TEXTO` logo abaixo —, e
 * por isso vive numa lista separada desta.
 */
export const TIPOS_SOCIAIS = ['seguidor', 'curtida', 'entrada', 'compartilhou', 'assinatura'];

/**
 * O que a live manda ESCRITO.
 *
 * O comentário é o único, e ele não é um evento social: não merece fala, não
 * conta voto sozinho, e não aparece em lugar nenhum da tela. O que ele é, é o
 * caminho pelo qual o espectador RESPONDE — desde que existe a espera do
 * número, é o chat que decide a urna de um presente que o painel não mapeia.
 *
 * A lista é separada da de cima de propósito. Narrar comentário deixaria o
 * narrador lendo o chat inteiro em voz alta, que é o defeito que a lista
 * fechada da seção anterior existe para impedir.
 */
export const TIPOS_DE_TEXTO = ['comentario'];

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

  if (TIPOS_DE_TEXTO.includes(tipo)) {
    /*
     * Sem texto não há comentário. Um comentário vazio seria um evento que
     * existe só para ocupar espaço na fila do hub — e a espera do número
     * ficaria olhando para uma string em branco.
     */
    // `conteudo`, e não `texto`: o nome `texto` já é o ajudante de limpeza
    // logo acima, e reusá-lo aqui dentro seria um erro de sintaxe.
    const conteudo = String(bruto.texto ?? bruto.comment ?? bruto.content ?? '').trim();
    return conteudo ? { ...comum, texto: conteudo } : null;
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
  /**
   * A fonte está LIGADA — que não é a mesma coisa que estar conectada.
   *
   * No simulador as duas andam juntas, e foi por isso que elas viveram
   * misturadas até a fonte da TikTok existir. Mas a fonte da live real fica
   * ligada e sem conexão o tempo todo: a live ainda não começou, a live
   * acabou, o Webcast bloqueou. Se `parar()` perguntasse à conexão, ele
   * responderia "não há nada para parar" e deixaria um processo Python
   * rodando depois de o operador ter mandado parar — sem nada na tela
   * explicando de onde ele veio.
   */
  let ligada = false;
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

    /**
     * Marca o estado da conexão e avisa quem estiver olhando.
     *
     * O aviso sai quando o estado MUDA **ou** quando o motivo muda — e a
     * segunda metade não é detalhe.
     *
     * No simulador as duas andam juntas, e foi por isso que isto passou tanto
     * tempo despercebido. Na live real não andam: a fonte pode ficar sem
     * conexão a noite inteira, e a única coisa que muda é POR QUE. Um @ errado
     * nunca conecta, então `conectada` nunca sai de `false` — e uma base que
     * só olhasse para ele deixaria o painel dizendo "sem live conectada" para
     * sempre, sem nunca contar que o nome da live estava errado. É a única
     * mensagem que o operador precisa ler, e era a única que não chegava.
     */
    definirConectada(novo, novoDetalhe = texto) {
      const mudouOMotivo = novoDetalhe !== texto;
      texto = novoDetalhe;
      if (conectada === novo && !mudouOMotivo) return;
      conectada = novo;
      avisarStatus();
    },

    iniciar() {
      if (ligada) return false;
      const resultado = iniciar?.(this) ?? true;
      // O adaptador pode recusar: falta o nome da live, falta a chave. Nesse
      // caso a fonte não fica ligada, e um `parar()` depois disso não tem o
      // que parar.
      if (resultado === false) return false;
      ligada = true;
      return true;
    },

    parar() {
      if (!ligada) return false;
      parar?.(this);
      ligada = false;
      return true;
    },
  };
}
