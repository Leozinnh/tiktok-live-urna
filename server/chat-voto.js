/**
 * O voto escrito no chat.
 *
 * O pedido do Leonardo, literal: "quando alguém comentar 'bolsonaro, 22, flavio
 * e tal' automaticamente computar 1 voto pro candidato".
 *
 * Até aqui o comentário era só RESPOSTA: ele não contava voto nenhum sozinho, e
 * o único jeito de votar era mandar um presente (que agora vale cinco votos ou
 * mais, pelo preço). Isto abre o outro caminho — o de graça. Quem não tem moeda
 * escreve o nome ou o número do candidato e o voto entra, valendo UM voto.
 *
 * A diferença de valor é o desenho inteiro: **quem paga, vale mais.** O
 * presente vale cinco ou mais; o comentário vale um. Se o comentário valesse
 * o mesmo, ninguém teria motivo para mandar presente.
 *
 * Três regras governam o arquivo, e as três são sobre NÃO contar errado:
 *
 *   - **o texto tem que citar UMA urna só.** "22 e 13" não é voto de ninguém —
 *     é um comentário sobre a disputa. Sem esta regra, a torcida que escreve os
 *     dois números (ou um nome de cada lado) contaria para o primeiro que
 *     aparecesse, e o placar viraria sorteio;
 *   - **a mesma pessoa tem um intervalo.** Sem ele, quem digita "22" cinquenta
 *     vezes seguidas vale cinquenta votos, e a votação inteira vira um teste de
 *     quem tem o dedo mais rápido;
 *   - **só o que NOMEIA a urna conta.** "Urna", "voto", "deputado" e
 *     "presidente" aparecem nos nomes das duas e não apontam para nenhuma —
 *     ver `PALAVRAS_NEUTRAS`.
 *
 * O relógio entra por parâmetro, como no `espera.js`: uma regra de tempo
 * testada com o relógio de verdade é um teste que demora e falha de vez em
 * quando.
 */
import { acharNumero, urnasComNumero } from './espera.js';

/**
 * De quanto em quanto tempo a MESMA pessoa pode votar pelo chat.
 *
 * Três segundos é o tempo de alguém digitar "22", ver que não aconteceu nada e
 * digitar de novo. É também o teto do que a mão dá conta: um voto na cena leva
 * uns cinco segundos, e uma pessoa votando a cada três já enche a fila dela.
 */
export const INTERVALO_DO_CHAT_MS = 3_000;

/** Quanto vale um voto escrito. Um, e é ele que faz o presente valer a pena. */
export const VOTOS_DO_CHAT = 1;

/**
 * As palavras que estão nos nomes das urnas e não apontam para nenhuma delas.
 *
 * "URNA 1" e "URNA 2" são os nomes de fábrica das duas, e o candidato do 22 é
 * "DEPUTADO FEDERAL" no cargo — sem esta lista, o comentário "voto no
 * deputado" citaria as duas urnas e não valeria nada, e o mesmo vale para
 * metade das frases de uma live de política.
 */
const PALAVRAS_NEUTRAS = new Set([
  'urna', 'voto', 'votar', 'vota', 'votando', 'candidato', 'candidata', 'chapa',
  'presidente', 'deputado', 'deputada', 'federal', 'estadual', 'senador',
  'senadora', 'governador', 'governadora', 'prefeito', 'prefeita', 'partido',
  'live', 'chat', 'gente', 'povo',
]);

/**
 * As palavras de um texto, sem acento e sem maiúscula.
 *
 * "Flávio", "flavio" e "FLAVIO" são a mesma pessoa, e no chat da live as três
 * aparecem na mesma noite. Sem tirar o acento, quem escreve o nome certo — o
 * com acento — não votaria.
 */
export function palavras(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * As palavras que nomeiam uma urna: o apelido, o nome e o nome do candidato.
 *
 * É por aqui que "flavio", "lulinha" e "lula" acham as urnas — e é por isso
 * que a lista existe separada do `acharNumero`: o número é um campo só, e o
 * nome é o que a torcida escreve de verdade.
 */
export function palavrasDaUrna(urna) {
  const chaves = new Set();
  for (const fonte of [urna?.apelido, urna?.nome, urna?.candidato?.nome]) {
    for (const p of palavras(fonte)) {
      /*
       * Palavra curta fica de fora: "de", "da", "jr" e as iniciais de um nome
       * apareceriam em metade dos comentários da live. Quatro letras é o
       * tamanho do menor apelido que ainda identifica alguém ("lula", "ana").
       */
      if (p.length >= 4 && !PALAVRAS_NEUTRAS.has(p)) chaves.add(p);
    }
  }
  return chaves;
}

/**
 * As urnas que o texto cita — por número ou por nome.
 *
 * Devolve um Map de `urnaId` → como ela foi citada ('numero' ou 'nome'), e o
 * tamanho dele é a resposta: uma citada é voto, duas ou mais é conversa.
 */
export function urnasCitadas(texto, urnas = []) {
  const citadas = new Map();
  const lista = (urnas ?? []).filter((u) => u?.id && u.ativo !== false);

  /*
   * Os números saem da MESMA peneira do `acharNumero` — a que olha o campo
   * cru, para que uma urna com o número apagado no painel não vire `0` e case
   * com qualquer "0" escrito no chat.
   */
  const comNumero = urnasComNumero(lista);
  for (const run of String(texto ?? '').match(/\d+/g) ?? []) {
    const achada = comNumero.find((u) => u.numero === Number(run));
    if (achada) citadas.set(achada.id, 'numero');
  }

  const doTexto = new Set(palavras(texto));
  for (const u of lista) {
    if (citadas.get(u.id) === 'numero') continue;
    for (const chave of palavrasDaUrna(u)) {
      if (doTexto.has(chave)) { citadas.set(u.id, 'nome'); break; }
    }
  }
  return citadas;
}

/**
 * A urna que o comentário escolheu — ou `null`.
 *
 * `null` é a resposta da imensa maioria dos comentários de uma live: "boa
 * sorte!", "cheguei", "kkkk". Nenhum deles pode contar voto, e é por isso que
 * a função exige UMA citação só: com duas, ela não sabe para quem contar, e
 * contar para o lado errado é o pior defeito possível aqui.
 */
export function acharUrna(texto, urnas = []) {
  const citadas = urnasCitadas(texto, urnas);
  if (citadas.size !== 1) return null;
  const [urnaId, por] = [...citadas][0];

  /*
   * O número sai do `acharNumero` quando foi ele que achou, e do campo da urna
   * quando foi o nome: a mão vai digitar este número, e ele tem que ser o da
   * urna, não o que o espectador escreveu. Quem escreve "voto no Lula" não
   * escreveu "13" nenhuma vez.
   */
  const urna = (urnas ?? []).find((u) => u?.id === urnaId);
  const numero = por === 'numero'
    ? acharNumero(texto, urnas)?.numero ?? String(urna?.numero ?? '')
    : String(urna?.numero ?? '');
  return { urnaId, numero, por };
}

/**
 * A chave de deduplicação de um comentário.
 *
 * Um comentário não tem `giftId`, então a chave do motor (`chaveDoEvento`) não
 * serve: ela nasceria igual para todos os comentários da mesma pessoa. O que
 * identifica um comentário é o AUTOR mais o INSTANTE mais o TEXTO — a
 * reentrega de uma reconexão traz os três iguais e não conta duas vezes, e
 * duas pessoas escrevendo "22" no mesmo segundo continuam sendo dois votos.
 */
export function chaveDoComentario(evento) {
  return [
    'chat',
    evento?.plataforma ?? 'desconhecida',
    evento?.userId ?? '',
    evento?.em ?? '',
    String(evento?.texto ?? '').slice(0, 40),
  ].join(':');
}

/**
 * O intervalo entre dois votos da mesma pessoa.
 *
 * O estado é um Map de userId → instante do último voto, e ele vive enquanto a
 * rodada viver: `limpar()` é chamado na virada, para que quem votou no último
 * segundo de uma rodada não comece a próxima em silêncio.
 */
export function criarChatVoto({ intervaloMs = INTERVALO_DO_CHAT_MS, agora = Date.now } = {}) {
  const ultimo = new Map();

  const intervaloAgora = () => {
    const bruto = typeof intervaloMs === 'function' ? intervaloMs() : intervaloMs;
    /*
     * "Não me disseram" não é zero.
     *
     * `Number(null)` e `Number('')` são `0`, e um intervalo de zero deixa
     * entrar todo voto — exatamente o defeito que ele existe para impedir. O
     * `0` ESCRITO continua valendo: ele é uma decisão de quem configurou ("sem
     * intervalo"), e uma decisão não se discute.
     */
    if (bruto == null || bruto === '') return INTERVALO_DO_CHAT_MS;
    const v = Number(bruto);
    return Number.isFinite(v) && v >= 0 ? v : INTERVALO_DO_CHAT_MS;
  };

  return {
    get intervaloMs() { return intervaloAgora(); },

    /**
     * Reserva o direito de votar, e diz se ele ainda estava disponível.
     *
     * `false` NÃO é erro e não merece fala: é o segundo "22" de quem já votou
     * agora há pouco. Mas merece uma linha no log — é por ela que se descobre,
     * numa live cheia, que o intervalo está curto demais.
     */
    reservar(userId) {
      const chave = String(userId ?? '');
      if (!chave) return false;
      const t = agora();
      const antes = ultimo.get(chave);
      if (antes != null && t - antes < intervaloAgora()) return false;
      ultimo.set(chave, t);
      return true;
    },

    /** Há quanto tempo esta pessoa votou pela última vez, em ms. */
    desde(userId) {
      const antes = ultimo.get(String(userId ?? ''));
      return antes == null ? null : agora() - antes;
    },

    /** Esquece todo mundo. É o que a troca de rodada faz. */
    limpar() { ultimo.clear(); },
  };
}
