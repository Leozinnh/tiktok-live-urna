/**
 * A vitrine de presentes — a legenda que liga cada presente a uma urna.
 *
 * Fica embaixo da mesa, no lugar mais vazio do enquadramento, e responde a
 * única pergunta que quem chega no meio da live tem: "o que eu mando para
 * votar no 22?". Sem ela, a cena mostra duas urnas e nenhuma instrução.
 *
 * Os desenhos são SVG, e não emoji nem imagem colada. Emoji muda de forma
 * em cada sistema e não aceita a cor da urna; imagem pronta seria a arte de
 * outra pessoa no meio da sua transmissão. Desenhados aqui, os dois
 * presentes ficam iguais em qualquer máquina e acompanham a identidade da
 * urna que representam.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * A rosa: o presente mais mandado numa live, e o que a referência usa na
 * urna vermelha.
 *
 * As pétalas são três espirais concêntricas, do escuro para o claro — é o
 * que faz o botão da flor ler como volume em vez de um círculo rosa. As
 * folhas ficam atrás, com o verde escuro por baixo.
 */
export function desenhoRosa() {
  /*
   * A flor é um círculo com uma espiral por cima, e não camadas de
   * círculos preenchidos. Círculo dentro de círculo vira uma bola rosa: o
   * olho não acha onde a pétala começa nem onde acaba. O que faz a leitura
   * de rosa são os arcos abertos concêntricos — é assim que a rosa é
   * desenhada de lado, e é o que o desenho do presente imita.
   */
  return `<svg class="presente__desenho" viewBox="0 0 120 120" role="img" aria-hidden="true">
    <defs>
      <radialGradient id="rosa-petala" cx="36%" cy="28%" r="80%">
        <stop offset="0%" stop-color="#ff8cc4"/>
        <stop offset="50%" stop-color="#f52a83"/>
        <stop offset="100%" stop-color="#9c0c4c"/>
      </radialGradient>
    </defs>
    <path d="M60 96 C52 86 46 76 46 66" stroke="#1b7a34" stroke-width="6"
          fill="none" stroke-linecap="round"/>
    <path d="M62 88 C74 76 88 70 104 68 C100 82 88 92 70 95 Z" fill="#1f8a3c"/>
    <path d="M58 84 C46 72 32 66 16 64 C20 78 32 88 50 91 Z" fill="#27a94a"/>
    <circle cx="60" cy="52" r="38" fill="url(#rosa-petala)"/>
    <path d="M60 20 A32 32 0 1 1 28 52" fill="none" stroke="#ff8ec6"
          stroke-width="8" stroke-linecap="round" opacity="0.9"/>
    <path d="M60 32 A20 20 0 1 1 40 52" fill="none" stroke="#ffb3d8"
          stroke-width="7" stroke-linecap="round" opacity="0.92"/>
    <path d="M60 42 A10 10 0 1 1 50 52" fill="none" stroke="#ffdcea"
          stroke-width="6" stroke-linecap="round" opacity="0.95"/>
  </svg>`;
}

/**
 * O joinha: o presente de entrada, o que a maioria manda.
 *
 * A mão é um punho fechado com o polegar para cima, em rosa, com a nota
 * musical ao lado — é o desenho clássico do presente de "curtida", e o
 * brilho branco nas costas é o que dá a leitura de adesivo brilhante.
 */
export function desenhoJoinha() {
  /*
   * A mão é UMA silhueta só: o punho fechado com o polegar subindo pela
   * esquerda, no contorno clássico do joinha.
   *
   * A versão anterior montava a mão com peças separadas — um bloco para o
   * punho, um para o polegar, três barras brancas por cima dos dedos. No
   * tamanho da cena isso não lê como mão: lê como uma mancha rosa com
   * listras. O contorno único resolve porque a silhueta do joinha é
   * reconhecível sozinha, antes de qualquer sombreado; o que vem depois
   * (as dobras dos dedos e a unha) é detalhe, não estrutura.
   *
   * A nota musical é o enfeite do presente de curtida, e o azul dela é o
   * único ponto frio do desenho: é o que separa o joinha da rosa quando os
   * dois estão na tela ao mesmo tempo e pequenos.
   */
  return `<svg class="presente__desenho" viewBox="0 0 120 120" role="img" aria-hidden="true">
    <defs>
      <linearGradient id="joinha-mao" x1="0.15" y1="0" x2="0.5" y2="1">
        <stop offset="0%" stop-color="#fff4fb"/>
        <stop offset="40%" stop-color="#ff9ed4"/>
        <stop offset="100%" stop-color="#d42a90"/>
      </linearGradient>
    </defs>
    <path d="M30 94 L30 120 L76 120 L76 94 Z" fill="#eef2ff"/>
    <path d="M30 94 L30 120 L46 120 L46 94 Z" fill="#c3d0ea"/>
    <!-- O polegar: uma coluna grossa subindo pela esquerda, com a ponta
         arredondada. É a metade do desenho que diz "para cima". -->
    <path d="M20 74 C10 64 9 36 19 23 C28 11 48 12 56 25 C62 34 62 46 61 56
             L61 74 Z" fill="url(#joinha-mao)"/>
    <!-- O punho, com os nós dos dedos como três lóbulos na borda direita.
         É o contorno que faz a mão ler como mão fechada: um bloco de lado
         reto vira uma caixa rosa, e três arcos viram dedos dobrados.

         A sobreposição com o polegar é generosa de propósito (x de 42 a 61,
         y de 44 a 74). Na primeira tentativa as duas peças se tocavam por
         10px e o resultado, com o brilho por cima, era um oval rosa ao lado
         de um bloco rosa — duas manchas, não uma mão. -->
    <path d="M42 44 L100 44
             A10.7 10.7 0 0 1 100 65.3 A10.7 10.7 0 0 1 100 86.7
             A10.7 10.7 0 0 1 100 108
             L42 108 Z" fill="url(#joinha-mao)"/>
    <!-- As dobras entre os dedos, curtas e no vão de cada par de lóbulos,
         sem atravessar o punho. -->
    <path d="M92 65.3 L104 65.3" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round"
          fill="none" opacity="0.38"/>
    <path d="M92 86.7 L104 86.7" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round"
          fill="none" opacity="0.30"/>
    <ellipse cx="34" cy="34" rx="7" ry="10" fill="#ffffff" opacity="0.40"
             transform="rotate(-16 34 34)"/>
    <!-- A nota musical, no canto livre acima do punho. -->
    <ellipse cx="88" cy="38" rx="9" ry="6.8" fill="#39d6ff" transform="rotate(-22 88 38)"/>
    <rect x="94" y="8" width="5" height="30" rx="2.5" fill="#39d6ff"/>
    <path d="M94 8 C103 13 107 20 105 29 C104 33 101 36 97 37
             C101 30 101 22 94 16 Z" fill="#39d6ff"/>
  </svg>`;
}

const DESENHOS = { rosa: desenhoRosa, joinha: desenhoJoinha };

/**
 * Um presente da vitrine: o desenho em cima, a etiqueta embaixo.
 *
 * A etiqueta é escura com o texto na cor da urna e um brilho da mesma cor —
 * é o que a faz parecer acesa, e é o que liga o presente à urna mesmo
 * quando o desenho é parecido com o do vizinho.
 */
export function markupPresente({ nome = '', numero = '', cor = '#8a8f98', desenho = 'rosa' }) {
  const svg = (DESENHOS[desenho] ?? desenhoRosa)();
  return `
    <div class="presente" style="--cor-urna:${esc(cor)}">
      <div class="presente__brilho"></div>
      ${svg}
      <div class="presente__etiqueta">
        <span class="presente__verbo">Votar</span>
        <span class="presente__numero">${esc(numero)}</span>
      </div>
      <div class="presente__nome">${esc(nome)}</div>
    </div>`;
}

/**
 * Os dois presentes que a cena mostra por padrão.
 *
 * O `urnaId` de cada um é uma SUGESTÃO da vitrine, e não uma regra do
 * sistema: é a legenda que responde "o que eu mando para votar no 22?" para
 * quem chega no meio da live, e é por isso que ela aparece embaixo do
 * desenho. Quem manda o presente escolhe onde ele vale, e o mesmo presente
 * pode estar valendo nas duas urnas — quem decide é a configuração do
 * adaptador, não esta lista.
 *
 * Ela chegou a ser o casamento "este presente vale um voto naquela urna", e
 * não é mais: com dois espectadores presentes ao mesmo tempo, prender cada
 * presente a uma urna só transformava a escolha do espectador em espera.
 */
export const PRESENTES_PADRAO = Object.freeze([
  { id: 'p1', nome: 'Joinha', desenho: 'joinha', urnaId: 'u1' },
  { id: 'p2', nome: 'Rosa',   desenho: 'rosa',   urnaId: 'u2' },
]);

/** Monta a vitrine na camada dada. Devolve os elementos para ajuste fino. */
export function criarPresentes(camada, presentes) {
  const el = document.createElement('div');
  el.className = 'vitrine';
  el.innerHTML = presentes.map((p, i) => `
    <div class="vitrine__posicao vitrine__posicao--${i === 0 ? 'esq' : 'dir'}">
      ${markupPresente(p)}
    </div>`).join('');
  camada.append(el);
  return { el };
}
