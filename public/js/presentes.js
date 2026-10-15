/**
 * A vitrine de presentes — a legenda que liga cada presente a uma urna.
 *
 * Fica embaixo da mesa, no lugar mais vazio do enquadramento, e responde a
 * única pergunta que quem chega no meio da live tem: "o que eu mando para
 * votar no 22?". Sem ela, a cena mostra duas urnas e nenhuma instrução.
 *
 * Os desenhos são ARQUIVOS, e não emoji: emoji muda de forma em cada
 * sistema e não aceita a cor da urna, então a legenda ensinaria uma coisa no
 * seu PC e outra no do espectador. Os `.webp` moram em `public/img/` e são
 * arte do Leonardo.
 *
 * O caminho do `src` é ABSOLUTO a partir de `/` — `/img/rose.webp`, e não
 * `public/img/rose.webp`. O servidor serve a partir de `public/`, então o
 * caminho relativo à raiz do projeto pede `/public/img/...`, o servidor
 * procura `public/public/img/...` e devolve 404: a imagem não aparece e não
 * há erro nenhum além dela. É o teste `todo desenho da vitrine aponta para
 * um arquivo que o servidor entrega` que prende isso.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * A rosa: o presente mais mandado numa live, e o que a referência usa na
 * urna vermelha.
 *
 * Era um SVG desenhado aqui — três espirais concêntricas para dar volume ao
 * botão da flor. Virou arquivo porque a arte pronta do Leonardo lê melhor no
 * tamanho da cena do que o desenho vetorial que dava para escrever em CSS.
 */
export function desenhoRosa() {
  return `<img class="presente__desenho" src="/img/rose.webp" alt="" />`;
}

/**
 * O Heart Me: o presente de entrada, o que a maioria manda.
 *
 * Chamava-se joinha, e a troca do nome é do Leonardo — é o presente que o
 * TikTok chama de Heart Me, e é esse o nome que a vitrine, o placar e a voz
 * do narrador mostram.
 */
export function desenhoHeartMe() {
  return `<img class="presente__desenho" src="/img/heart_me.webp" alt="" />`;
}

const DESENHOS = { rosa: desenhoRosa, heartme: desenhoHeartMe };

/**
 * Um presente da vitrine: o desenho em cima, a etiqueta embaixo.
 *
 * A etiqueta é escura com o texto na cor da urna e um brilho da mesma cor —
 * é o que a faz parecer acesa, e é o que liga o presente à urna mesmo
 * quando o desenho é parecido com o do vizinho.
 */
export function markupPresente({ nome = '', numero = '', cor = '#8a8f98', desenho = 'rosa' }) {
  const arte = (DESENHOS[desenho] ?? desenhoRosa)();
  return `
    <div class="presente" style="--cor-urna:${esc(cor)}">
      <div class="presente__brilho"></div>
      ${arte}
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
  { id: 'p1', nome: 'Heart Me', desenho: 'heartme', urnaId: 'u1' },
  { id: 'p2', nome: 'Rosa',     desenho: 'rosa',    urnaId: 'u2' },
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
