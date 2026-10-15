/*
 * Os quatro números do alto do painel.
 *
 * O painel tinha tudo o que o operador precisa e nada do que ele quer OLHAR.
 * Para responder "a live está de pé?", "quantos votos entraram?" e "quanto
 * falta de rodada?" era preciso abrir três abas e ler frases inteiras — no
 * meio de uma transmissão, com a mão ocupada.
 *
 * Aqui eles viram quatro caixas grandes e coloridas, no lugar de onde não é
 * preciso sair. A referência é o painel do projeto dos cavalos, que o
 * Leonardo apontou como o certo: valor grande, rótulo miúdo em maiúsculas, e
 * a cor dizendo o que a frase diria.
 *
 * Este arquivo é PURO e não conhece o DOM: ele devolve uma lista de
 * medidores, e quem desenha é o `admin.js`. É a mesma separação do resto do
 * painel, e é o que permite conferir a conta sem abrir navegador — a conta
 * sendo a parte que erra em silêncio, porque um número errado na tela não
 * faz barulho nenhum.
 */
import { formatarTempo } from '../cronometro.js';
import { escapar } from './campos.js';

/** Como cada modo de fonte se chama para quem opera. */
export const NOME_DO_MODO = Object.freeze({
  simulador: 'Simulador',
  tiktok: 'TikTok ao vivo',
});

/**
 * O placar em uma linha: "13 · 9  ·  22 · 4".
 *
 * O número da URNA, e não o id interno: o que o operador vê no ar são os
 * números que a mão digita. "u1 7 · u2 3" não diz nada a ninguém.
 *
 * Quem está na frente vem primeiro — dois números lado a lado não são uma
 * disputa, e a ordem é a informação. A urna zerada aparece do mesmo jeito:
 * escondê-la faria parecer que ela saiu do ar, quando o zero dela é
 * justamente o que dá sentido ao número do outro.
 */
export function textoDoPlacar(tally) {
  const urnas = [...(tally?.urnas ?? [])]
    .map((u, i) => ({ ...u, ordem: i }))
    // O empate cai na ordem original, e não no gosto do motor de ordenação:
    // duas urnas empatadas trocando de lugar a cada voto fariam a linha
    // tremer na tela sem que nada tivesse mudado.
    .sort((a, b) => (Number(b.votos) || 0) - (Number(a.votos) || 0) || a.ordem - b.ordem);
  if (!urnas.length) return '—';
  return urnas.map((u) => `${u.numero ?? u.id} · ${Number(u.votos) || 0}`).join('   ');
}

/**
 * A lista de medidores, na ordem em que aparecem na tela.
 *
 * `tom` é o que o CSS lê para escolher a cor: `ok`, `off`, ou nada. Ele existe
 * porque o operador lê a cor de longe e a frase só depois — e a cor é a única
 * informação que sobrevive a um monitor pequeno e a um olhar de meio segundo.
 */
export function medidores({ tally = null, fonte = null, rodada = null } = {}) {
  const encerrada = rodada?.estado === 'encerrada';
  const restante = Number(rodada?.restante) > 0 ? Number(rodada.restante) / 1000 : 0;

  return [
    {
      id: 'votos',
      valor: String(Number(tally?.total) || 0),
      rotulo: 'Votos na rodada',
      tom: Number(tally?.total) > 0 ? 'ok' : '',
    },
    {
      id: 'placar',
      valor: textoDoPlacar(tally),
      rotulo: 'Placar',
      tom: '',
    },
    {
      id: 'fonte',
      valor: NOME_DO_MODO[fonte?.modo] ?? '—',
      rotulo: 'De onde vêm os votos',
      // O detalhe é o texto do servidor, escrito por quem sabe: "não existe
      // usuário @fulano no TikTok", "a live está offline", "conectando…".
      // Inventar um aqui seria trocar a única informação útil por uma palavra
      // bonita — e é justamente quando a fonte cai que ele passa a importar.
      nota: fonte?.detalhe ?? '',
      tom: fonte ? (fonte.conectado ? 'ok' : 'off') : '',
    },
    {
      id: 'rodada',
      // Encerrada mostra traço, e não "00:00": um zero piscando dá a
      // impressão de que ainda falta alguma coisa acontecer.
      valor: encerrada || !restante ? '--:--' : formatarTempo(restante),
      rotulo: encerrada ? 'Rodada encerrada' : 'Rodada aberta',
      tom: encerrada ? 'off' : (restante ? 'ok' : ''),
    },
  ];
}

/** A caixa de um medidor. */
function markupMedidor({ id, valor, rotulo, nota = '', tom = '' }) {
  return `<div class="medidor" data-medidor="${escapar(id)}"${tom ? ` data-tom="${escapar(tom)}"` : ''}>`
    + `<div class="medidor__valor">${escapar(valor)}</div>`
    + `<div class="medidor__rotulo">${escapar(rotulo)}</div>`
    + (nota ? `<div class="medidor__nota">${escapar(nota)}</div>` : '')
    + '</div>';
}

/** A faixa de medidores inteira. */
export function markupMedidores(lista) {
  return lista.map(markupMedidor).join('');
}
