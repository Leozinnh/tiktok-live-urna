/*
 * O painel do rodapé: a fila sozinha, e — parado — os dois monitores lado a
 * lado.
 *
 * Com gente esperando, o painel é UM aparelho de ponta a ponta: o que o
 * espectador precisa saber é a vez dele, e quem olha a tela depois de
 * presentear quer ver o próprio nome. Enquanto há fila, é a única coisa que
 * importa, e ela fica com a largura toda porque é uma lista de chamada.
 *
 * Parado, a fila não tem o que dizer e sobram as duas perguntas que o
 * espectador faz sozinho: quem mais está mandando presente — que é o que faz
 * a mesma pessoa voltar amanhã — e o que acabou de passar na tela. São dois
 * MONITORES, um ao lado do outro no chão, cada um com a marca e o pé dele.
 * Dividir a tela de um aparelho ao meio daria duas telas estreitas dentro de
 * uma carcaça só: o desenho de um software, não o de um estúdio.
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
const TITULO_ULTIMOS = 'ÚLTIMOS VOTOS';

/** Quantos nomes cabem antes de virar "+N". */
export const FILA_VISIVEL = 4;
export const RANKING_VISIVEL = 3;

/*
 * Os últimos votos não têm "+N", e é de propósito: a lista é uma janela que
 * anda, e o voto mais velho sai por baixo sozinho. "E mais 47" numa lista de
 * votos não quer dizer nada — o que passou, passou.
 */
export const ULTIMOS_VISIVEL = 4;

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

/**
 * Uma linha de "últimos votos": quem votou, e em quem.
 *
 * A ordem é a da frase — o nome primeiro, o número depois —, e a seta entre
 * os dois é o "votou em". Sem ela os dois lado a lado leem como uma linha da
 * fila, que diz o contrário: lá o número vem antes porque é o destino de um
 * voto que ainda vai acontecer.
 *
 * O número é o mesmo da urna, na cor da urna: quem está na arquibancada lê a
 * cor antes do texto, e é a cor que liga a linha ao aparelho na tela.
 */
function markupItemDoVoto(voto) {
  const cor = voto.cor ?? '#4a5468';
  return `
      <li class="painel__item painel__item--voto" style="--cor-urna:${esc(cor)}">
        <span class="painel__nome">${esc(voto.usuario ?? '')}</span>
        <span class="painel__seta" aria-hidden="true"></span>
        <span class="painel__numero">${esc(voto.numero ?? '')}</span>
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
 * Um aparelho da bancada: carcaça, marca no queixo, pé e tela.
 *
 * A marca e o pé são ELEMENTOS, e não pseudo-elementos da área como eram
 * quando havia um aparelho só. Com dois lado a lado, um `::before` da área
 * esticaria a palavra ARENA por cima dos dois e o pé sairia de um aparelho
 * para o outro — um aparelho emprestando o queixo para o vizinho. Os dois
 * pseudo-elementos do `.painel` já são a tela e o vidro, então a marca e o
 * pé precisam de nó próprio.
 */
function markupAparelho(classe, titulo, itens) {
  return `
  <div class="painel ${classe}">
    <span class="painel__pe" aria-hidden="true"></span>
    <span class="painel__marca" aria-hidden="true">ARENA</span>${markupLista(titulo, itens)}
  </div>`;
}

/**
 * O painel inteiro, em texto.
 *
 * Devolve string vazia quando não há o que mostrar — e vazio é o que apaga o
 * painel da tela. Uma caixa sem conteúdo no rodapé da live ocuparia espaço
 * para não dizer nada.
 *
 * Com fila, um aparelho. Sem fila, um aparelho por assunto que existir: pode
 * ser só o ranking (a rodada começou e ninguém votou ainda), só os últimos
 * votos, ou os dois. Um monitor ligado sem nada para dizer é pior do que
 * monitor nenhum.
 */
export function markupPainel(estado = {}) {
  const naFila = estado.fila ?? ORDEM_VAZIA;
  const noRanking = estado.ranking ?? ORDEM_VAZIA;
  const votos = estado.ultimos ?? ORDEM_VAZIA;

  if (naFila.length > 0) {
    const visiveis = naFila.slice(0, FILA_VISIVEL).map(markupItemDaFila).join('');
    return markupAparelho('painel--fila', estado.tituloFila ?? TITULO_FILA,
      visiveis + markupResto(naFila.length - FILA_VISIVEL));
  }

  const aparelhos = [];

  if (noRanking.length > 0) {
    // Ordena aqui dentro, e não em quem chama: a tela é a última a saber e a
    // única que não pode errar a ordem.
    const ordenado = [...noRanking].sort((a, b) => (b.presentes ?? 0) - (a.presentes ?? 0));
    const visiveis = ordenado.slice(0, RANKING_VISIVEL)
      .map((p, i) => markupItemDoRanking(p, i + 1))
      .join('');
    aparelhos.push(markupAparelho('painel--ranking', estado.tituloRanking ?? TITULO_RANKING,
      visiveis + markupResto(ordenado.length - RANKING_VISIVEL)));
  }

  if (votos.length > 0) {
    // A ordem é a de chegada: o mais recente no alto. Quem olha a tela
    // acabou de mandar o presente dele e procura o próprio nome ali em cima.
    const visiveis = votos.slice(0, ULTIMOS_VISIVEL).map(markupItemDoVoto).join('');
    aparelhos.push(markupAparelho('painel--ultimos', estado.tituloUltimos ?? TITULO_ULTIMOS, visiveis));
  }

  return aparelhos.join('');
}

/**
 * A altura do rodapé em pixel de PALCO, a partir de pixel de TELA.
 *
 * Pura de propósito: é a única parte da medida que dá para conferir sem
 * navegador, e é nela que morava o defeito — a divisão pela escala. `fundo`
 * é a borda de baixo do palco, `topo` é o alto do painel, os dois em pixel
 * de tela (o que o `getBoundingClientRect` devolve); a escala é a do palco
 * (`scene.js`). Vazio (`display: none`) é altura zero, e número negativo
 * não existe: é zero.
 */
export function alturaDoRodape({ fundo, topo, escala, vazio }) {
  if (vazio) return 0;
  const s = Number(escala) || 1;
  return Math.max(0, Math.round((fundo - topo) / s));
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

  let estado = { fila: [], ranking: [], ultimos: [] };

  /*
   * Onde o rodapé TERMINA — a única medida que a faixa da narração precisa.
   *
   * A faixa fica logo acima do painel, e o painel não tem altura fixa: ele é
   * uma linha quando há só o ranking, duas quando há fila, e nenhuma quando
   * não há voto nenhum. Com o `bottom` fixo que a faixa tinha (186px, escrito
   * quando o rodapé era sempre do mesmo tamanho), a lista de quem mais
   * presenteou crescia para cima e passava POR CIMA da faixa: o Leonardo viu
   * o aviso do presente cortado ao meio pela carcaça do painel, no ar.
   *
   * A medida é tirada do palco e não do painel sozinho porque o que interessa
   * é a distância até a BORDA DE BAIXO da cena — o painel tem 40px de respiro
   * embaixo, e somar esse respiro aqui seria repetir um número do CSS no JS.
   * Escondido (`display: none`), o painel não tem retângulo: aí a faixa desce
   * e ocupa o lugar dele, que é o que se espera de um rodapé vazio.
   *
   * E a conta é dividida pela ESCALA do palco.
   *
   * O `getBoundingClientRect` devolve pixel de TELA, e o palco é desenhado em
   * 1080x1920 e ESCALADO para caber na janela (`scene.js`: 0,56 numa janela
   * deitada, 0,38 conferindo). O `--rodape-altura` é lido pelo CSS em pixel
   * de PALCO. Sem a divisão, a medida valia 251px na sonda em tela cheia e
   * 95px na janela pequena do Leonardo — e a faixa descia para dentro do
   * painel, que é `z 60` contra o `z 50` dela: o placar inferior passava por
   * cima da camada de efeitos, no ar. É o `paraCoordenadasDoPalco` da urna,
   * aqui sem importar ninguém: a escala sai do próprio retângulo.
   */
  function medirOndeAcabaORodape() {
    const palco = el.closest('.palco');
    if (!palco) return;
    const vazio = el.classList.contains('painel-area--vazio');
    if (vazio) {
      palco.style.setProperty('--rodape-altura', '0px');
      return;
    }
    const rPalco = palco.getBoundingClientRect();
    const escala = palco.offsetWidth ? rPalco.width / palco.offsetWidth : 1;
    palco.style.setProperty('--rodape-altura',
      `${alturaDoRodape({
        fundo: rPalco.bottom,
        topo: el.getBoundingClientRect().top,
        escala,
        vazio: false,
      })}px`);
  }

  return {
    el,
    get estado() { return estado; },
    medirOndeAcabaORodape,

    atualizar(novoEstado = {}) {
      estado = {
        fila: novoEstado.fila ?? [],
        ranking: novoEstado.ranking ?? [],
        ultimos: novoEstado.ultimos ?? [],
        tituloFila: novoEstado.tituloFila,
        tituloRanking: novoEstado.tituloRanking,
        tituloUltimos: novoEstado.tituloUltimos,
      };
      el.innerHTML = markupPainel(estado);
      el.classList.toggle('painel-area--vazio', el.innerHTML === '');
      // Depois do conteúdo: a altura que interessa é a de AGORA.
      medirOndeAcabaORodape();
      return estado;
    },
  };
}

/*
 * O rodapé medido de novo quando a escala muda.
 *
 * A medida sai de pixel de TELA e vale em pixel de PALCO: redimensionar a
 * janela troca a escala e invalida o número que está na variável. Sem isto,
 * abrir a página pequena e maximizar deixava a faixa afundada no painel —
 * valendo a medida da janela antiga. O `globalThis` em vez de `window` é
 * para o módulo carregar fora do navegador, como a mão faz.
 */
function remedirRodape() {
  for (const palco of document.querySelectorAll('.palco')) {
    const area = palco.querySelector('.painel-area');
    if (!area || area.classList.contains('painel-area--vazio')) continue;
    const rPalco = palco.getBoundingClientRect();
    const escala = palco.offsetWidth ? rPalco.width / palco.offsetWidth : 1;
    palco.style.setProperty('--rodape-altura',
      `${alturaDoRodape({
        fundo: rPalco.bottom,
        topo: area.getBoundingClientRect().top,
        escala,
        vazio: false,
      })}px`);
  }
}
globalThis.addEventListener?.('resize', remedirRodape);
globalThis.addEventListener?.('palco:redimensionado', remedirRodape);
