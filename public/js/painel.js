/*
 * O painel do rodapé: a fila e o ranking, um de cada vez.
 *
 * São dois assuntos que nunca aparecem juntos porque nunca são verdadeiros
 * juntos. Com gente esperando, o que o espectador precisa saber é a vez dele
 * — quem olha a tela depois de presentear quer ver o próprio nome. Parado, a
 * fila não tem o que dizer e o que move a live é quem está mandando presente,
 * que é o que faz a mesma pessoa voltar amanhã. Um painel só, então: os dois
 * disputariam o mesmo canto da tela e nenhum dos dois seria lido.
 *
 * Módulo sem DOM de propósito, como o `placar.js`: `markupPainel` é uma
 * função pura que devolve texto, e é ela que os testes exercitam.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Escapa o que vem de fora.
 *
 * O nome do espectador é a única entrada deste projeto que um estranho
 * escolhe — vem do apelido do TikTok. Aqui ele é sempre texto, nunca markup.
 */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

const TITULO_FILA = 'NA FILA';
const TITULO_RANKING = 'QUEM MAIS PRESENTEOU';

/** Quantos nomes cabem antes de virar "+N". */
export const FILA_VISIVEL = 4;
export const RANKING_VISIVEL = 3;

const ORDEM_VAZIA = Object.freeze([]);

function markupItemDaFila(item) {
  const cor = item.cor ?? '#4a5468';
  return `
      <li class="painel__item" style="--cor-urna:${esc(cor)}">
        <span class="painel__numero">${esc(item.numero ?? '')}</span>
        <span class="painel__nome">${esc(item.usuario ?? '')}</span>
      </li>`;
}

function markupItemDoRanking(pessoa, posicao) {
  return `
      <li class="painel__item painel__item--rank">
        <span class="painel__posicao">${esc(posicao)}</span>
        <span class="painel__nome">${esc(pessoa.nome ?? '')}</span>
        <span class="painel__contagem">${esc(pessoa.presentes ?? 0)}</span>
      </li>`;
}

function markupResto(quantos) {
  return quantos > 0
    ? `
      <li class="painel__resto">+${esc(quantos)}</li>`
    : '';
}

function markupLista(titulo, itens) {
  return `
    <span class="painel__titulo">${esc(titulo)}</span>
    <ol class="painel__lista">${itens}
    </ol>`;
}

/**
 * O painel inteiro, em texto.
 *
 * Devolve string vazia quando não há o que mostrar — e vazio é o que apaga o
 * painel da tela. Uma caixa sem conteúdo no rodapé da live ocuparia espaço
 * para não dizer nada.
 */
export function markupPainel(estado = {}) {
  const naFila = estado.fila ?? ORDEM_VAZIA;
  const noRanking = estado.ranking ?? ORDEM_VAZIA;

  if (naFila.length > 0) {
    const visiveis = naFila.slice(0, FILA_VISIVEL).map(markupItemDaFila).join('');
    return `
  <div class="painel painel--fila">${markupLista(estado.tituloFila ?? TITULO_FILA, visiveis + markupResto(naFila.length - FILA_VISIVEL))}
  </div>`;
  }

  if (noRanking.length > 0) {
    // Ordena aqui dentro, e não em quem chama: a tela é a última a saber e a
    // única que não pode errar a ordem.
    const ordenado = [...noRanking].sort((a, b) => (b.presentes ?? 0) - (a.presentes ?? 0));
    const visiveis = ordenado.slice(0, RANKING_VISIVEL)
      .map((p, i) => markupItemDoRanking(p, i + 1))
      .join('');
    return `
  <div class="painel painel--ranking">${markupLista(estado.tituloRanking ?? TITULO_RANKING, visiveis + markupResto(ordenado.length - RANKING_VISIVEL))}
  </div>`;
  }

  return '';
}

/**
 * O painel em cena, no rodapé do palco.
 *
 * Redesenhar o `innerHTML` inteiro aqui é aceitável — ao contrário do placar,
 * nada neste painel anima entre um desenho e o seguinte: as linhas entram e
 * saem, e uma lista que reaparece não tem de onde vir. O que ele NÃO pode é
 * ficar ocupando a tela quando está vazio, e é por isso que a classe
 * `painel--vazio` sai e entra junto com o conteúdo.
 */
export function criarPainel(camada) {
  const el = document.createElement('div');
  el.className = 'painel-area';
  camada.append(el);

  let estado = { fila: [], ranking: [] };

  return {
    el,
    get estado() { return estado; },

    atualizar(novoEstado = {}) {
      estado = {
        fila: novoEstado.fila ?? [],
        ranking: novoEstado.ranking ?? [],
        tituloFila: novoEstado.tituloFila,
        tituloRanking: novoEstado.tituloRanking,
      };
      el.innerHTML = markupPainel(estado);
      el.classList.toggle('painel-area--vazio', el.innerHTML === '');
      return estado;
    },
  };
}
