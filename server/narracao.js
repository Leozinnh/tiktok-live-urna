/**
 * Quem fala o que, e quando fica quieto.
 *
 * Este módulo decide UMA coisa: dado um evento social, sai fala ou sai
 * silêncio. Ele não sintetiza som, não toca nada e não conhece nem o
 * navegador nem o PowerShell — é puro de propósito, porque é aqui que moram
 * as regras que ninguém consegue conferir de ouvido no meio de uma live.
 *
 * A parte difícil não é falar: é CALAR. Numa live movimentada chegam dezenas
 * de entradas por minuto, o TikTok repete a entrada de quem sai e volta, e a
 * rede reentrega o mesmo evento quando a conexão oscila. Um narrador que fala
 * tudo o que chega vira uma metralhadora de nomes que ninguém entende — e o
 * que era para dar boas-vindas passa a atrapalhar. Daí o cooldown por pessoa,
 * a janela da curtida, e o sorteio sem repetição.
 */

/**
 * As frases que valem quando o painel não tem nenhuma.
 *
 * Elas existem no código, e não só na configuração, para o narrador nunca
 * nascer mudo: uma configuração recém-criada não tem frase nenhuma escrita, e
 * sem isto o Leonardo teria que inventar todas antes de ouvir a primeira.
 *
 * Mais de uma por tipo porque a alternância é o que impede a live de soar
 * automática. `{nome}` e `{quantidade}` são os marcadores.
 */
export const FALAS_PADRAO = Object.freeze({
  seguidor: Object.freeze([
    'Mais um seguidor! Valeu, {nome}!',
    '{nome} acabou de seguir! Bem-vindo à família!',
    'Seguidor novo na área: {nome}!',
    'Obrigado por seguir, {nome}!',
  ]),
  curtida: Object.freeze([
    '{nome} mandou {quantidade} curtidas!',
    'Valeu pelas {quantidade} curtidas, {nome}!',
    '{quantidade} curtidas de uma vez, {nome}! Isso é apoio!',
  ]),
  entrada: Object.freeze([
    'Bem-vindo, {nome}!',
    'Olha o {nome} chegando!',
    'Fala, {nome}! Chegou na hora certa.',
  ]),
  compartilhou: Object.freeze([
    '{nome} compartilhou a live! Valeu demais!',
    'A live chegou mais longe: {nome} compartilhou!',
  ]),
  assinatura: Object.freeze([
    '{nome} virou assinante! Que isso!',
    'Assinante novo: {nome}! Muito obrigado!',
  ]),
});

/**
 * Quanto tempo cada tipo fica quieto para a MESMA pessoa.
 *
 * Entrada e seguidor são os alvos dos eventos repetidos — o TikTok manda a
 * entrada de novo para quem sai e volta, e a reconexão reentrega o que já
 * tinha chegado. Um minuto é folgado para o caso real e curto o bastante para
 * quem voltou de verdade merecer o oi outra vez.
 */
const COOLDOWN_MS = Object.freeze({
  entrada: 60_000,
  seguidor: 60_000,
  compartilhou: 60_000,
  assinatura: 60_000,
  curtida: 60_000,
});

/**
 * A curtida só vira fala quando vira GESTO.
 *
 * O TikTok manda um evento por toque. Falar cada um encheria a fila de
 * "valeu pela curtida" centenas de vezes, e o narrador ficaria minutos atrás
 * da live. Cinco toques são um gesto; uma curtida perdida no meio da noite
 * não é, e é a janela abaixo que separa os dois.
 */
const LIMIAR_CURTIDA = 5;
const JANELA_CURTIDA_MS = 3_000;

/**
 * Troca os marcadores pelos valores.
 *
 * `{nome}` em branco vira "Alguém" porque o apelido vem da rede e chega nulo
 * para conta sem nome definido — "Fala, !" na tela da live é o tipo de coisa
 * que ninguém vê no teste e todo mundo vê na transmissão.
 */
export function preencher(modelo, { nome = '', quantidade = 0 } = {}) {
  const quem = String(nome ?? '').trim() || 'Alguém';
  return String(modelo ?? '')
    // `replaceAll`, e não `replace`: uma frase com `{nome}` duas vezes sairia
    // com o segundo marcador cru na tela.
    .replaceAll('{nome}', quem)
    .replaceAll('{quantidade}', String(quantidade));
}

/**
 * @param {object|Function} opcoes.falas as frases do painel, por tipo — ou uma
 *   função que as devolve. A função existe porque o hub troca a configuração
 *   inteira a cada salvamento do painel: um narrador que guardasse a lista do
 *   dia em que nasceu continuaria falando as frases antigas até o servidor
 *   reiniciar, e ninguém descobriria por quê.
 * @param {Function} [opcoes.sorteio] 0..1; existe para o teste ser determinístico
 * @param {Function} [opcoes.agora]  o relógio, em ms; idem
 * @param {Function} [opcoes.aoNarrar] avisado com o texto já montado
 */
export function criarNarrador({ falas = {}, sorteio = Math.random, agora = Date.now, aoNarrar = null } = {}) {
  /** As frases que valem AGORA — o painel pode ter salvado desde a última fala. */
  const frasesDeAgora = () => (typeof falas === 'function' ? falas() : falas);
  /** tipo → { modelos, saco } — o baralho de onde as frases são tiradas. */
  const baralhos = new Map();
  /** tipo → a última frase dita, para não repetir. */
  const ultima = new Map();
  /** `tipo:userId` → quando esta pessoa pode falar de novo. */
  const liberadoEm = new Map();
  /** userId → { total, desde } da rajada de curtidas em andamento. */
  const rajadas = new Map();
  /** tipo → { lista, modelos } — a última lista resolvida de cada tipo. */
  const resolvidas = new Map();

  /**
   * As frases de um tipo AGORA, com o padrão do código quando o painel não
   * tem — e sempre o MESMO array enquanto a lista do painel não mudar.
   *
   * A guarda não é economia: o `escolher` compara a lista por referência para
   * saber se o painel trocou as frases, e um `.filter` devolve um array novo
   * a cada chamada. Sem ela, o baralho se reconstruía a cada fala e o sorteio
   * degenerava em alternar entre as duas primeiras frases — as outras nunca
   * eram ditas, e o comentário do baralho virava mentira.
   */
  function modelosDe(tipo) {
    const lista = frasesDeAgora()?.[tipo];
    const guardado = resolvidas.get(tipo);
    if (guardado && guardado.lista === lista) return guardado.modelos;
    // Lista VAZIA é silêncio deliberado; lista AUSENTE cai no padrão. A
    // diferença importa: o painel mostra o padrão escrito desde o começo,
    // então apagar tudo é uma decisão, e não um campo esquecido.
    const modelos = Array.isArray(lista)
      ? lista.filter((f) => typeof f === 'string' && f.trim())
      : (FALAS_PADRAO[tipo] ?? []);
    resolvidas.set(tipo, { lista, modelos });
    return modelos;
  }

  /**
   * Tira uma frase do baralho, sem repetir a anterior.
   *
   * O baralho é reabastecido só quando esvazia — é o que garante que TODAS as
   * frases de um tipo sejam ditas antes de qualquer uma repetir. A versão
   * ingênua, sortear a cada vez, pode dar a mesma frase três vezes seguidas,
   * e a live ouve a repetição como defeito.
   */
  function escolher(tipo, modelos) {
    let baralho = baralhos.get(tipo);
    // A lista pode ter mudado no painel no meio da live; um baralho com as
    // frases antigas falaria o que já não está escrito em lugar nenhum.
    if (!baralho || baralho.modelos !== modelos) {
      baralho = { modelos, saco: [] };
      baralhos.set(tipo, baralho);
    }
    if (baralho.saco.length === 0) {
      const anterior = ultima.get(tipo);
      // Com uma frase só não há o que evitar — e filtrar deixaria o saco
      // vazio, calando justamente quem tem uma frase só.
      baralho.saco = modelos.length > 1 && anterior != null
        ? modelos.filter((m) => m !== anterior)
        : modelos.slice();
    }
    const indice = Math.min(baralho.saco.length - 1, Math.floor(sorteio() * baralho.saco.length));
    const [escolhida] = baralho.saco.splice(indice, 1);
    ultima.set(tipo, escolhida);
    return escolhida;
  }

  /** O acumulado da rajada de curtidas, somando dentro da janela. */
  function somarCurtida(chave, quantidade, t) {
    const antes = rajadas.get(chave);
    const dentro = antes && t - antes.desde <= JANELA_CURTIDA_MS;
    const total = (dentro ? antes.total : 0) + quantidade;
    rajadas.set(chave, { total, desde: dentro ? antes.desde : t });
    return total;
  }

  return {
    /**
     * A fala que este evento merece, ou `null` para ficar quieto.
     *
     * Devolver `null` é resposta, e não erro: é o que o hub consulta antes de
     * mandar áudio para a tela.
     */
    narrar(evento) {
      const tipo = evento?.tipo;
      if (!tipo) return null;
      const modelos = modelosDe(tipo);
      if (modelos.length === 0) return null;

      const t = agora();
      const quem = String(evento.userId || evento.usuario || '');
      const chave = `${tipo}:${quem || '?'}`;

      /*
       * O cooldown vem ANTES de tudo, inclusive de acumular curtida: uma
       * rajada que continua durante o silêncio encheria o contador e
       * dispararia uma segunda fala no instante em que o cooldown acabasse,
       * contando de novo um gesto que já tinha sido anunciado.
       */
      if ((liberadoEm.get(chave) ?? 0) > t) return null;

      let quantidade = 0;
      if (tipo === 'curtida') {
        quantidade = somarCurtida(chave, Number(evento.quantidade) || 1, t);
        if (quantidade < LIMIAR_CURTIDA) return null;
        rajadas.delete(chave);
      }

      liberadoEm.set(chave, t + (COOLDOWN_MS[tipo] ?? 60_000));
      const texto = preencher(escolher(tipo, modelos), { nome: evento.usuario, quantidade });
      aoNarrar?.(texto);
      return texto;
    },
  };
}
