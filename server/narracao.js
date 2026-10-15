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
  /*
   * A cobrança de quem mandou um presente que não está no painel.
   *
   * Ela não é um cumprimento: é a resposta a um SILÊNCIO. O presente chegou,
   * não achou urna, e o espectador ficou olhando para uma tela que não fez
   * nada — do lado dele, o presente caro simplesmente não funcionou. A fala
   * existe para transformar isso numa instrução que ele consegue seguir.
   *
   * Por isso a frase diz o que FAZER, e não o que faltou: "escreve o número
   * no chat" resolve; "este presente não está cadastrado" não resolve nada
   * para quem está do outro lado.
   */
  espera: Object.freeze([
    '{nome}, escreve o número da urna no chat!',
    '{nome}, faltou o número! Escreve no chat qual urna.',
    'Não entendi seu voto, {nome}! Escreve o número da urna no chat.',
    '{nome}, manda o número da urna no chat para o voto valer!',
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
  /*
   * O da cobrança é CURTO, e de propósito: ele não protege contra repetição —
   * quem protege é a própria espera, que só vence uma vez por presente. Ele
   * está aqui só para um caso patológico, o de alguém mandando presentes
   * órfãos em sequência rápida e sem escrever nada. Com um minuto, a segunda
   * cobrança legítima da noite ficaria muda; quinze segundos é o mesmo prazo
   * da janela, e nunca cala uma cobrança que ainda faz sentido.
   */
  espera: 15_000,
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
 * O limiar da curtida, para quem precisa MANDAR uma curtida que fale.
 *
 * Ele sai daqui por causa do botão de teste do painel: um botão de "curtiu"
 * que mandasse um toque só sairia mudo, porque um toque não é um gesto — e o
 * Leonardo apertaria, não ouviria nada, e concluiria que a voz está quebrada.
 * `tests/servidor-hub.test.js` compara os dois números, então o limiar e o
 * botão não podem se separar em silêncio.
 */
export const LIMIAR_DA_CURTIDA = LIMIAR_CURTIDA;

/*
 * O apelido do TikTok é escrito para ser LIDO, e não para ser falado.
 *
 * Ele vem com bandeira, coração, cifrão, caveirinha — e um sintetizador de voz
 * ou tenta ler aquilo (e sai "bandeira do Brasil" no meio do nome de quem
 * acabou de chegar) ou trava na pontuação. O nome tem que chegar na voz como
 * uma pessoa o diria.
 *
 * A limpeza é uma LISTA DO QUE FICA, e não do que sai: letra, número, espaço e
 * os três sinais que aparecem em nome de verdade (hífen, ponto, sublinhado,
 * apóstrofo). Uma lista do que sai — "tira emoji, tira cifrão, tira estrela" —
 * envelhece a cada emoji novo que o TikTok lança, e o dia em que ela falha é o
 * dia em que a voz lê um emoji no ar. `\p{L}` e `\p{N}` deixam passar acento,
 * cedilha e nome em outra escrita, que é o que interessa num nome brasileiro.
 *
 * Isto acontece ANTES de a frase ser montada, e vale para a tela também: a
 * faixa que o OBS captura mostra o mesmo texto que a voz fala. Duas versões do
 * mesmo nome — uma escrita e outra falada — divergiriam no dia em que alguém
 * mexesse numa só, e ninguém veria.
 */
const NAO_SE_FALA = /[^\p{L}\p{N}\s._'\-]/gu;

/** A parte que dá para falar de um nome, ou string vazia. */
function falavel(bruto) {
  return String(bruto ?? '')
    .replace(NAO_SE_FALA, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Nome TODO em maiúsculas vira nome, e não sigla.
 *
 * Voz neural com palavra curta em caixa alta tende a soletrar: "ANA" sai
 * "á-ene-á". Apelido de três letras em maiúscula é comuníssimo no TikTok, e o
 * efeito no ar é a voz lendo sigla em vez de chamar a pessoa.
 *
 * A regra é cirúrgica de propósito: só mexe em nome que não tem UMA letra
 * minúscula sequer. Um "João Pedro" com a caixa certa atravessa intacto,
 * porque o nome dele na tela é o nome dele — e o `.capitalize()` do narrador
 * do horse, aplicado a todo mundo, transformaria "João Pedro" em "João pedro".
 */
function emCaixaDeNome(texto) {
  return texto.replace(/(^|[\s\-])(\p{L})/gu, (_, antes, letra) => antes + letra.toUpperCase());
}

/**
 * O nome como a voz deve dizê-lo.
 *
 * A ordem dos degraus é a do narrador do horse, e cada um existe por um caso
 * real: o apelido é o nome que a pessoa escolheu; quando ele não sobra em nada
 * falável, o @ é o nome que aparece embaixo do presente e que ela reconhece; e
 * "Alguém" é o fim da linha, para quando nem um nem outro tem uma letra.
 */
export function nomeFalavel(nome, usuario = '') {
  const apelido = falavel(nome);
  const arroba = falavel(usuario);
  const quem = apelido || arroba;
  if (!quem) return 'Alguém';
  // `\p{Ll}` é "letra minúscula" em qualquer escrita — um nome em cirílico ou
  // em grego também tem caixa, e uma faixa `a-z` os trataria como se não
  // tivessem.
  return /\p{Ll}/u.test(quem) ? quem : emCaixaDeNome(quem.toLowerCase());
}

/**
 * Troca os marcadores pelos valores.
 *
 * `{nome}` em branco vira "Alguém" porque o apelido vem da rede e chega nulo
 * para conta sem nome definido — "Fala, !" na tela da live é o tipo de coisa
 * que ninguém vê no teste e todo mundo vê na transmissão.
 *
 * `usuario` é o @: ele só é consultado quando o apelido não tem nada que se
 * possa falar.
 */
export function preencher(modelo, { nome = '', usuario = '', quantidade = 0 } = {}) {
  const quem = nomeFalavel(nome, usuario);
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
      const texto = preencher(escolher(tipo, modelos), {
        nome: evento.usuario,
        // O @ só é usado se o apelido não sobrar em nada falável.
        usuario: evento.userId,
        quantidade,
      });
      aoNarrar?.(texto);
      return texto;
    },
  };
}
