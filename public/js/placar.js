/**
 * O placar — quem está na frente, por quantos votos, e com que fatia.
 *
 * Separado em duas partes de propósito: `calcularPlacar` é conta pura e não
 * sabe o que é HTML; `renderizarPlacar` é desenho e não sabe o que é voto.
 * A conta é a parte que erra em silêncio — um percentual trocado passa
 * despercebido numa transmissão — então é ela que os testes cobrem de perto.
 *
 * Quem manda votos para cá é o motor de votos. O placar não conta nada por
 * conta própria: se contasse, haveria dois números possíveis na tela para o
 * mesmo fato, e o dia em que divergissem ninguém saberia qual está certo.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * Percentual no formato brasileiro: uma casa e vírgula decimal.
 *
 * `toFixed` devolve ponto, e "56.0%" no meio de um placar em português é
 * erro de língua, não de conta.
 */
function percentualBrasileiro(fracao) {
  return `${(fracao * 100).toFixed(1).replace('.', ',')}%`;
}

/**
 * Recebe uma linha por urna e devolve o placar pronto para desenhar.
 *
 * @param {Array<{id:string, nome:string, numero:string, votos:number, cor?:string}>} linhas
 * @param {{espectadores?: number}} [opcoes] — só entra o que foi informado
 *   de verdade. Sem integração com a live não há número de espectadores, e
 *   o placar não inventa um.
 */
export function calcularPlacar(linhas, { espectadores } = {}) {
  const cartoes = linhas.map((l) => ({ ...l, votos: Number(l.votos) || 0 }));
  const total = cartoes.reduce((soma, c) => soma + c.votos, 0);

  /*
   * Quem lidera, e por quanto.
   *
   * Com zero votos ninguém lidera, e "à frente por 0" seria uma frase falsa
   * sobre um placar vazio. Com todos empatados, idem. O líder é quem tem
   * mais votos *e* está sozinho nessa posição.
   */
  const maximo = cartoes.reduce((m, c) => Math.max(m, c.votos), 0);
  const naFrente = cartoes.filter((c) => c.votos === maximo);
  const lider = total > 0 && naFrente.length === 1 ? naFrente[0].id : null;

  /*
   * O segundo colocado, que é contra quem o líder se mede.
   *
   * "À frente" tem que ser distância até o PRÓXIMO, não até o último: com
   * duas urnas as duas leituras dão o mesmo número, e a conta errada passa
   * despercebida. Com três, aparece na hora.
   */
  const segundo = cartoes
    .filter((c) => c.id !== lider)
    .reduce((m, c) => Math.max(m, c.votos), 0);

  return {
    total,
    lider,
    /*
     * `lider === null` quer dizer duas coisas muito diferentes: "estão
     * empatados" e "ainda não há votos". A tela tratava as duas como a mesma
     * — e para desenhar um empate a zero isso serve. Para decidir se houve um
     * EMPATE na disputa, não: zerar a rodada deixa todo mundo igual sem que
     * ninguém tenha alcançado ninguém.
     */
    empate: maximo > 0 && naFrente.length > 1,
    espectadores: Number.isFinite(espectadores) ? espectadores : null,
    cartoes: cartoes.map((c) => {
      // Fração do total, não do líder: é ela que enche a barra de cada um, e
      // a soma das barras precisa dar 100%.
      const fracao = total > 0 ? c.votos / total : 0;
      const posicao = lider === null ? 'empate' : (c.id === lider ? 'lider' : 'atras');
      const diferenca = lider === null
        ? 0
        : (c.id === lider ? c.votos - segundo : maximo - c.votos);
      // O lugar é a contagem de quem tem MAIS votos, e não a posição na
      // lista: num empate os dois são o primeiro lugar, que é como qualquer
      // tabela de verdade se comporta. Um "1º" e um "2º" decididos por ordem
      // de chegada ao array seriam uma invenção.
      const lugar = 1 + cartoes.filter((o) => o.votos > c.votos).length;
      return {
        id: c.id,
        nome: c.nome,
        numero: c.numero,
        cor: c.cor,
        votos: c.votos,
        fracao,
        fracaoBarra: fracao,
        percentual: percentualBrasileiro(fracao),
        posicao,
        diferenca,
        lugar,
      };
    }),
  };
}

/**
 * O que mudou na liderança entre dois desenhos do placar.
 *
 * Devolve `{ tipo, de, para }`, com `tipo` em `'nada'`, `'lideranca'` ou
 * `'empate'`. É a decisão inteira da ultrapassagem, separada do desenho: quem
 * anima e quem toca o som pergunta a esta função se o momento aconteceu, e
 * nenhum dos dois precisa saber contar voto.
 *
 * Os casos que NÃO são ultrapassagem são o miolo disto aqui:
 *
 *   - não havia placar antes (`anterior === null`) — é o primeiro desenho;
 *   - não havia votos antes — o primeiro voto de uma rodada não ultrapassa
 *     ninguém, porque não havia ninguém na frente;
 *   - o líder é o mesmo — nada aconteceu;
 *   - a rodada foi zerada — todo mundo volta a zero, mas isso é uma disputa
 *     nova, não um empate.
 */
export function mudancaDeLideranca(anterior, atual) {
  const nada = { tipo: 'nada', de: null, para: null };
  if (!anterior || !atual) return nada;
  if (anterior.lider === atual.lider) return nada;
  if (anterior.total === 0) return nada;

  // Perdeu a liderança para o empate. É um momento, e tem anúncio próprio.
  if (atual.empate) return { tipo: 'empate', de: anterior.lider, para: null };

  // Sobrou: ou alguém passou na frente, ou alguém desempatou. Nos dois casos
  // a liderança trocou de mãos e é isso que a faixa anuncia.
  if (atual.lider) return { tipo: 'lideranca', de: anterior.lider, para: atual.lider };

  return nada;
}

/**
 * Em que ordem os cartões aparecem na tela.
 *
 * Quem lidera vai para a esquerda, que é o lugar de primeiro no ocidente e o
 * único movimento que a audiência lê como "passou na frente" numa fileira de
 * dois. Num empate a ordem fica como veio: não há primeiro lugar para mover,
 * e trocar os dois de lugar assim mesmo seria um tranco sem significado.
 */
export function ordemDosCartoes(placar) {
  const ids = placar.cartoes.map((c) => c.id);
  if (!placar.lider) return ids;
  return [placar.lider, ...ids.filter((id) => id !== placar.lider)];
}

function markupDiferenca(c) {
  if (c.posicao === 'empate') {
    return '<span class="cartao__diferenca cartao__diferenca--empate">empatadas</span>';
  }
  const texto = c.posicao === 'lider'
    ? `${c.diferenca} à frente`
    : `${c.diferenca} atrás`;
  return `<span class="cartao__diferenca cartao__diferenca--${c.posicao}">${esc(texto)}</span>`;
}

/*
 * O raio do selo "NA FRENTE", desenhado e não escrito.
 *
 * É um `svg` de três pontos e não o glifo "⚡": o glifo é um emoji, e emoji
 * não é desenho — muda de forma em cada sistema, e não aceita a cor do
 * selo. Aqui ele herda `currentColor` e fica igual em qualquer máquina.
 */
const RAIO = `<svg class="cartao__raio" viewBox="0 0 12 16" aria-hidden="true">
        <path d="M7.4 0 0 9.2h3.9L3.2 16 12 6.4H7.2L7.4 0Z" fill="currentColor"/>
      </svg>`;

function markupCartao(c) {
  // A largura da barra vai em % inline: é o único valor que muda a cada
  // voto, e uma classe por nível de 0 a 100 seria uma lista sem fim.
  const largura = (c.fracaoBarra * 100).toFixed(2);
  const selo = c.posicao === 'lider'
    ? `<span class="cartao__selo">${RAIO}na frente</span>`
    : '';
  return `
      <article class="cartao cartao--${c.posicao}" data-urna="${esc(c.id)}"
               style="--cor-urna:${esc(c.cor ?? '#666')}">
        <header class="cartao__topo">
          <span class="cartao__lugar">${esc(c.lugar)}º</span>
          <span class="cartao__numero">${esc(c.numero)}</span>
          <span class="cartao__nome">${esc(c.nome)}</span>
          ${selo}
        </header>
        <div class="cartao__corpo">
          <span class="cartao__votos" data-votos="${esc(c.id)}">${esc(c.votos)}</span>
          <span class="cartao__unidade">votos</span>
          <div class="cartao__barra">
            <div class="cartao__barra-cheia" style="width:${largura}%"></div>
          </div>
          <footer class="cartao__rodape">
            <span class="cartao__percentual">${esc(c.percentual)}</span>
            ${markupDiferenca(c)}
          </footer>
        </div>
      </article>`;
}

export function renderizarPlacar(placar) {
  const espectadores = placar.espectadores === null
    ? ''
    : `<div class="placar__bloco">
          <span class="placar__rotulo">espectadores</span>
          <span class="placar__valor placar__valor--menor">${esc(placar.espectadores)}</span>
        </div>`;

  // Quando ninguém lidera, a faixa não anuncia ninguém: um "0 À FRENTE"
  // piscando num placar zerado é ruído que parece defeito.
  const lider = placar.cartoes.find((c) => c.id === placar.lider);
  const faixa = lider
    ? `<div class="placar__faixa" style="--cor-urna:${esc(lider.cor ?? '#666')}">
         ${esc(lider.numero)} À FRENTE
       </div>`
    : '<div class="placar__faixa placar__faixa--vazia">sem votos ainda</div>';

  return `
    <div class="placar__status">
      <div class="placar__bloco">
        <span class="placar__rotulo">total</span>
        <span class="placar__valor" data-total>${esc(placar.total)}</span>
      </div>
      ${espectadores}
      ${faixa}
    </div>
    <div class="placar__cartoes">
      ${placar.cartoes.map(markupCartao).join('')}
    </div>`;
}

/**
 * O placar em cena: monta uma vez e depois só atualiza os pedaços que mudam.
 *
 * Redesenhar o HTML inteiro a cada voto seria mais simples de escrever e pior
 * de assistir: o navegador joga fora e reconstrói os elementos, e a barra que
 * deveria deslizar de 44% para 45% pisca em vez de deslizar. Aqui o markup é
 * montado uma vez e o que muda por voto é texto e largura.
 */
export function criarPlacar(camada, linhas) {
  const el = document.createElement('div');
  el.className = 'placar';
  camada.append(el);

  let placar = calcularPlacar(linhas);
  el.innerHTML = renderizarPlacar(placar);

  return {
    el,
    get estado() { return placar; },

    /** Redesenha a partir das contagens atuais. */
    atualizar(novasLinhas, opcoes) {
      placar = calcularPlacar(novasLinhas, opcoes);
      el.innerHTML = renderizarPlacar(placar);
      return placar;
    },

    /**
     * Atualiza só a contagem da urna que acabou de receber um voto, e deixa
     * o resto da árvore em paz.
     */
    atualizarContagem(novasLinhas) {
      placar = calcularPlacar(novasLinhas, { espectadores: placar.espectadores ?? undefined });
      el.innerHTML = renderizarPlacar(placar);
      return placar;
    },
  };
}
