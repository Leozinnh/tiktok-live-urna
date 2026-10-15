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
  return `<img class="presente__desenho" src="public/img/rose.webp" />`;
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
  return `<img class="presente__desenho" src="public/img/heart_me.webp" />`;
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
