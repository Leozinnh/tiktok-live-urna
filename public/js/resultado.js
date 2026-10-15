/**
 * A tela de fim de rodada.
 *
 * O cronômetro zera, a fila termina de passar e a tela fica igual para
 * sempre — o placar continua marcando 47 a 29 e ninguém sabe se aquilo
 * acabou ou se ainda está valendo. Esta tela é o desfecho: quem ganhou, por
 * quanto, e que a rodada fechou.
 *
 * Ela é montada uma vez e ligada e desligada, como o painel; o que muda a
 * cada rodada é o conteúdo.
 *
 * A regra que governa o arquivo inteiro: **só anuncia campeão quem tem um**.
 * Empate não elege ninguém, e rodada que fecha sem voto nenhum não elege
 * ninguém — a tela não pode inventar uma vitória que a contagem não deu,
 * porque é justamente isso que uma urna de verdade não faz.
 */

import { PLACAR_PADRAO, preencherMensagem } from './placar.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** O rótulo que diz que a rodada fechou — e não que o placar está assim. */
export const ROTULO = 'RODADA ENCERRADA';

/**
 * A manchete quando a rodada fecha sem nenhum voto.
 *
 * Não é uma das três mensagens configuráveis da spec: aquelas são as da
 * disputa, e esta é a da ausência dela. Quem abre uma rodada e não recebe
 * presente nenhum precisa ler exatamente isto, e não "sem votos ainda" —
 * "ainda" é do meio da rodada, e a rodada acabou.
 */
export const SEM_VOTOS = 'SEM VOTOS';

/**
 * Quem ganhou a rodada — ou por que não houve ganhador.
 *
 * Recebe o mesmo objeto que `calcularPlacar` devolve, e é pura: dá para
 * conferir o desfecho de qualquer placar sem montar tela nenhuma.
 *
 * Devolve `{ tipo, titulo, cor, campeoes, cartoes, total }`:
 *
 *   - `tipo` diz qual dos três desfechos é: `'vitoria'`, `'empate'` ou
 *     `'sem-votos'`;
 *   - `titulo` já é a frase pronta, com o modelo configurado preenchido;
 *   - `cor` é a da urna campeã, e é `null` sempre que não há uma só — num
 *     empate, pintar a tela com a cor de uma das duas diria que ela ganhou;
 *   - `campeoes` são os cartões vitoriosos: um, dois num empate, nenhum
 *     quando não houve voto;
 *   - `cartoes` são TODOS, e é o que a contagem final mostra.
 */
export function resultadoDaRodada(placar, { modelos = PLACAR_PADRAO } = {}) {
  const cartoes = placar?.cartoes ?? [];
  const total = placar?.total ?? 0;

  if (total === 0) {
    return { tipo: 'sem-votos', titulo: SEM_VOTOS, cor: null, campeoes: [], cartoes, total: 0 };
  }

  /*
   * "Quem tem o id do líder" e não "quem o placar diz que lidera": a lista
   * vazia e a lista com dois caem no mesmo lugar, que é o empate. Assim não
   * existe placar — nem um inconsistente, que hoje não acontece — capaz de
   * fazer esta função devolver uma manchete de vitória sem vencedor.
   */
  const campeoes = cartoes.filter((c) => c.id === placar.lider);

  if (campeoes.length !== 1) {
    return {
      tipo: 'empate',
      titulo: preencherMensagem(modelos.mensagemEmpate, null),
      cor: null,
      campeoes: [],
      cartoes,
      total,
    };
  }

  const campeao = campeoes[0];
  return {
    tipo: 'vitoria',
    titulo: preencherMensagem(modelos.mensagemVitoria, campeao),
    cor: campeao.cor ?? null,
    campeoes,
    cartoes,
    total,
  };
}

/** Um dos dois lados da contagem final. */
function markupLado(c, resultado) {
  const campeao = resultado.campeoes.some((x) => x.id === c.id);
  return `
        <div class="resultado__lado${campeao ? ' resultado__lado--campeao' : ''}"
             style="--cor-urna:${esc(c.cor ?? '#666')}">
          <span class="resultado__numero">${esc(c.numero)}</span>
          <span class="resultado__nome">${esc(c.nome)}</span>
          <span class="resultado__votos">${esc(c.votos)}</span>
          <span class="resultado__percentual">${esc(c.percentual)}</span>
        </div>`;
}

/**
 * O total, com a palavra concordando com ele.
 *
 * "TOTAL 1 VOTOS" é o tipo de coisa que ninguém escreve de propósito e que
 * aparece em toda tela de resultado feita às pressas.
 */
function markupTotal(total) {
  return `<span class="resultado__total">TOTAL <b>${esc(total)}</b> ${total === 1 ? 'VOTO' : 'VOTOS'}</span>`;
}

/**
 * A tela inteira, como texto.
 *
 * A cor da campeã vai em `--cor-campeao` na caixa, e não em cada pedaço:
 * assim a manchete, a borda e o brilho saem todos da mesma variável, e um
 * empate — que não tem cor — é só a ausência dela.
 */
export function markupResultado(resultado) {
  const cor = resultado.cor ? ` style="--cor-campeao:${esc(resultado.cor)}"` : '';
  return `
      <div class="resultado__caixa"${cor}>
        <span class="resultado__rotulo">${ROTULO}</span>
        <h2 class="resultado__manchete">${esc(resultado.titulo)}</h2>
        <div class="resultado__contagens">${resultado.cartoes
        .map((c) => markupLado(c, resultado)).join('<span class="resultado__vezes">×</span>')}
        </div>
        ${markupTotal(resultado.total)}
      </div>`;
}

/**
 * A tela em cena: nasce escondida e só aparece quando a rodada fecha.
 *
 * `hidden` e não uma classe: além de tirar da tela, tira da árvore de
 * acessibilidade e do alcance do teclado, que é o certo para um painel que
 * não está no ar. O CSS precisa de uma linha para `hidden` funcionar num
 * elemento `display:flex` — está lá, com o comentário junto.
 */
export function criarResultado(camada) {
  const el = document.createElement('div');
  el.className = 'resultado';
  el.hidden = true;
  camada.append(el);

  let atual = null;

  return {
    el,
    get visivel() { return !el.hidden; },
    get resultado() { return atual; },

    mostrar(resultado) {
      atual = resultado;
      el.className = `resultado resultado--${resultado.tipo}`;
      el.innerHTML = markupResultado(resultado);
      el.hidden = false;
    },

    esconder() {
      el.hidden = true;
      atual = null;
    },
  };
}
