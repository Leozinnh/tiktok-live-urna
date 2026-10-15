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

/*
 * As mensagens da faixa, com os padrões da spec (seção 6).
 *
 * `{urna}` é o NOME da urna e `{numero}` é o número dela. Os dois marcadores
 * existem porque são coisas diferentes: "URNA 2" é como o Leonardo chama a
 * urna, e "13" é o que o espectador digita. Quem escreve a mensagem escolhe
 * qual dos dois nomes a frase pede.
 */
export const PLACAR_PADRAO = Object.freeze({
  mensagemLideranca: '{urna} ASSUMIU A LIDERANÇA!',
  mensagemEmpate: 'EMPATE NA DISPUTA!',
  mensagemVitoria: '{urna} VENCEU!',
});

const SEM_VOTOS = 'sem votos ainda';

/** Troca `{urna}` e `{numero}` pelo que a urna for. */
export function preencherMensagem(modelo, cartao) {
  return String(modelo ?? '')
    .replace(/\{urna\}/g, cartao?.nome ?? '')
    .replace(/\{numero\}/g, cartao?.numero ?? '');
}

/**
 * O que a faixa diz agora — a única decisão de texto do placar.
 *
 * Devolve `{ texto, cor, vazio }`. `cor: null` é "não há cor de ninguém para
 * vestir", que é o caso do empate e do placar zerado: pintar a faixa do
 * empate com a cor de uma das urnas diria que ela está na frente.
 *
 * `aviso` é o momento que está no ar: `{ tipo: 'lideranca', cartao }` ou
 * `{ tipo: 'empate' }`. Sem ele, a faixa diz o estado — quem está à frente,
 * ou que ninguém está.
 */
export function textoDaFaixa(placar, { aviso = null, modelos = PLACAR_PADRAO } = {}) {
  if (aviso?.tipo === 'empate') {
    return { texto: preencherMensagem(modelos.mensagemEmpate, null), cor: null, vazio: false };
  }

  // No aviso de liderança a faixa veste a urna que ACABOU de assumir, e não a
  // que o placar aponta: as duas são a mesma, mas depender disso amarraria o
  // aviso a um cálculo que pode ter mudado no meio do caminho.
  const cartao = aviso?.cartao ?? placar.cartoes.find((c) => c.id === placar.lider);

  if (cartao) {
    return aviso
      ? { texto: preencherMensagem(modelos.mensagemLideranca, cartao), cor: cartao.cor, vazio: false }
      : { texto: `${cartao.numero} À FRENTE`, cor: cartao.cor, vazio: false };
  }

  /*
   * Chegou aqui: ninguém lidera. Isso é empate OU placar zerado, e as duas
   * coisas nunca se pareceram tanto quanto nesta linha — o placar zerado não
   * tem o que anunciar, e o empate tem o seu próprio anúncio, que o código
   * antigo engolia. Cinco a cinco na tela dizia "sem votos ainda".
   */
  if (placar.empate) {
    return { texto: preencherMensagem(modelos.mensagemEmpate, null), cor: null, vazio: false };
  }
  return { texto: SEM_VOTOS, cor: null, vazio: true };
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

/*
 * O cabeçalho e o rodapé do cartão saem em funções próprias porque são
 * reescritos a cada voto, enquanto o `<article>` em volta é preservado — é
 * ele que a animação de ultrapassagem move, e é o `.cartao__barra-cheia`
 * dentro dele que desliza de uma largura para a outra. Recriar o article
 * jogaria fora os dois.
 */
function markupTopo(c) {
  const selo = c.posicao === 'lider'
    ? `<span class="cartao__selo">${RAIO}na frente</span>`
    : '';
  return `
          <span class="cartao__lugar">${esc(c.lugar)}º</span>
          <span class="cartao__numero">${esc(c.numero)}</span>
          <span class="cartao__nome">${esc(c.nome)}</span>
          ${selo}
        `;
}

function markupCartao(c) {
  // A largura da barra vai em % inline: é o único valor que muda a cada
  // voto, e uma classe por nível de 0 a 100 seria uma lista sem fim.
  const largura = (c.fracaoBarra * 100).toFixed(2);
  return `
      <article class="cartao cartao--${c.posicao}" data-urna="${esc(c.id)}"
               style="--cor-urna:${esc(c.cor ?? '#666')}">
        <header class="cartao__topo">${markupTopo(c)}</header>
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

export function renderizarPlacar(placar, { aviso = null, modelos } = {}) {
  const espectadores = placar.espectadores === null
    ? ''
    : `<div class="placar__bloco">
          <span class="placar__rotulo">espectadores</span>
          <span class="placar__valor placar__valor--menor">${esc(placar.espectadores)}</span>
        </div>`;

  const banda = textoDaFaixa(placar, { aviso, modelos });
  const classes = ['placar__faixa'];
  if (banda.vazio) classes.push('placar__faixa--vazia');
  if (aviso) classes.push('placar__faixa--aviso');
  const faixa
    = `<div class="${classes.join(' ')}"${banda.cor ? ` style="--cor-urna:${esc(banda.cor)}"` : ''}>`
    + `\n         ${esc(banda.texto)}\n       </div>`;

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

/** Quanto tempo a mensagem da ultrapassagem fica no ar antes de a faixa voltar. */
export const DURACAO_DO_AVISO = 3400;

/**
 * O placar em cena: monta uma vez e depois só atualiza os pedaços que mudam.
 *
 * Redesenhar o HTML inteiro a cada voto seria mais simples de escrever e pior
 * de assistir. Duas coisas quebrariam junto:
 *
 *   - a barra que deveria deslizar de 44% para 45% pisca em vez de deslizar,
 *     porque o elemento que carrega a transição nasce de novo já na largura
 *     final;
 *   - a troca de lugar dos cartões na ultrapassagem não teria o que animar,
 *     porque não haveria "antes" — os dois cartões seriam elementos novos.
 *
 * Daí a regra: o `<article>` de cada urna e a `.cartao__barra-cheia` dentro
 * dele nunca são recriados. O que é reescrito por voto é só o texto do topo,
 * o número de votos e o rodapé.
 */
export function criarPlacar(camada, linhas, {
  aoVirarLideranca,
  modelos,
  duracaoDoAviso = DURACAO_DO_AVISO,
} = {}) {
  const el = document.createElement('div');
  el.className = 'placar';
  camada.append(el);

  let placar = calcularPlacar(linhas);
  el.innerHTML = renderizarPlacar(placar, { modelos });

  const container = el.querySelector('.placar__cartoes');
  const cartoes = new Map();
  for (const no of container.querySelectorAll('.cartao')) {
    cartoes.set(no.dataset.urna, no);
  }

  let aviso = null;
  let timerDoAviso = null;

  /** O que muda de um desenho para o outro dentro de um cartão. */
  function pintarCartao(no, c) {
    no.className = `cartao cartao--${c.posicao}`;
    no.style.setProperty('--cor-urna', c.cor ?? '#666');
    no.querySelector('.cartao__topo').innerHTML = markupTopo(c);
    no.querySelector('.cartao__votos').textContent = c.votos;
    no.querySelector('.cartao__barra-cheia').style.width
      = `${(c.fracaoBarra * 100).toFixed(2)}%`;
    no.querySelector('.cartao__rodape').innerHTML
      = `<span class="cartao__percentual">${esc(c.percentual)}</span>${markupDiferenca(c)}`;
  }

  function pintarFaixa() {
    const no = el.querySelector('.placar__faixa');
    const banda = textoDaFaixa(placar, { aviso, modelos });
    no.className = ['placar__faixa', banda.vazio && 'placar__faixa--vazia',
      aviso && 'placar__faixa--aviso'].filter(Boolean).join(' ');
    no.textContent = banda.texto;
    if (banda.cor) no.style.setProperty('--cor-urna', banda.cor);
    else no.style.removeProperty('--cor-urna');
  }

  /**
   * Troca os cartões de lugar, animando a travessia.
   *
   * A ordem é montada em DOM e depois invertida com um `translateX` do quanto
   * cada cartão andou; o navegador anima esse deslocamento até zero e o
   * cartão parece deslizar de uma coluna para a outra. Fazer isso com
   * `left`/`order` daria o mesmo resultado visual gastando layout a cada
   * quadro; com `transform` o trabalho fica no compositor.
   *
   * `Element.animate` e não `transition` mais classe: a animação some sozinha
   * quando termina, sem ficar uma classe presa no elemento esperando alguém
   * lembrar de tirá-la.
   *
   * O `append` que reordena TIRA e RECOLOCA o cartão, e isso cancela qualquer
   * transição de CSS que estivesse correndo dentro dele: no voto que vira a
   * liderança, a barra de proporção chega na largura nova de uma vez, sem
   * deslizar. Foi medido — no voto comum, que não reordena, ela desliza.
   *
   * Fica assim de propósito. Dá para trocar o `append` por `order` no grid e
   * não cancelar nada, mas aí a ordem no DOM deixa de ser a ordem na tela e
   * passa a ser preciso guardar a ordem visual à parte — mais estado, para
   * consertar algo que não se vê: a barra pularia dentro de um cartão que
   * está atravessando 538px na frente dele.
   */
  function trocarDeLugar() {
    const ordem = ordemDosCartoes(placar);
    const atual = [...container.querySelectorAll('.cartao')].map((n) => n.dataset.urna);
    if (ordem.join() === atual.join()) return;

    const antes = new Map();
    for (const [id, no] of cartoes) antes.set(id, no.getBoundingClientRect().left);

    for (const id of ordem) container.append(cartoes.get(id));

    for (const [id, no] of cartoes) {
      const andou = antes.get(id) - no.getBoundingClientRect().left;
      if (Math.abs(andou) < 1) continue;
      no.animate(
        [{ transform: `translateX(${andou}px)` }, { transform: 'none' }],
        { duration: 620, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' },
      );
    }
  }

  function fecharAviso() {
    clearTimeout(timerDoAviso);
    timerDoAviso = null;
    aviso = null;
    pintarFaixa();
  }

  function abrirAviso(mudanca) {
    const cartao = placar.cartoes.find((c) => c.id === mudanca.para) ?? null;
    aviso = mudanca.tipo === 'empate' ? { tipo: 'empate' } : { tipo: 'lideranca', cartao };
    pintarFaixa();

    clearTimeout(timerDoAviso);
    timerDoAviso = setTimeout(fecharAviso, duracaoDoAviso);

    aoVirarLideranca?.({ ...mudanca, cartao });
  }

  function desenhar(novasLinhas, opcoes) {
    const anterior = placar;
    placar = calcularPlacar(novasLinhas, opcoes);

    const mudanca = mudancaDeLideranca(anterior, placar);

    el.querySelector('[data-total]').textContent = placar.total;
    for (const c of placar.cartoes) {
      const no = cartoes.get(c.id);
      if (no) pintarCartao(no, c);
    }

    if (mudanca.tipo === 'nada') {
      pintarFaixa();
    } else {
      // O aviso entra ANTES da troca de lugar: quem escuta o evento já pode
      // tocar o som no mesmo quadro em que os cartões começam a andar.
      abrirAviso(mudanca);
      trocarDeLugar();
    }
    return placar;
  }

  return {
    el,
    get estado() { return placar; },
    get aviso() { return aviso; },

    /** Redesenha a partir das contagens atuais. */
    atualizar: desenhar,
  };
}
