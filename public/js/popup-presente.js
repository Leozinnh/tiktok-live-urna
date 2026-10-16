/**
 * O pop-up do presente — o presente que toma a tela.
 *
 * A faixa dourada diz o que aconteceu; ela é uma linha no rodapé, do tamanho
 * de um aviso, e some no meio de tudo o que já está na tela. Para quem PAGOU,
 * isso não é suficiente: o presente é o momento da live em que alguém gastou
 * dinheiro, e o Leonardo olhou a Rosa sair e disse o que faltava — "não quero
 * só um badge falando, quero um pop-up na tela com a imagem do presente; se
 * não tiver a imagem, falar o nome e tal".
 *
 * Quatro decisões organizam este arquivo:
 *
 *   - **a tela é tomada por alguns segundos, e devolvida.** Um véu escuro
 *     atrás do cartão apaga o resto do enquadramento, e é isso que faz o
 *     presente ser visto — sem ele, o pop-up brigaria com o placar, com as
 *     urnas e com a vitrine, e perderia;
 *   - **a imagem manda; sem imagem, o nome manda.** O desenho do presente é
 *     `public/img/<desenho>.webp`, o mesmo da vitrine, e vem da configuração.
 *     Quando ele não existe — arquivo errado, presente sem desenho —, o nome
 *     do presente ocupou o lugar dele em corpo de manchete, em vez de deixar
 *     um buraco;
 *   - **a cor é da URNA, e não do presente.** A mesma rosa é vermelha na 13 e
 *     azul na 22, porque quem escolhe a cor de um voto é quem o recebe. O
 *     segundo pedido do Leonardo foi este, olhando o pop-up já na tela: "a cor
 *     tem que ser de acordo com o voto dele, se for Lula vermelho e tal";
 *   - **quem decide o que aparece é uma função pura.** `dadosDoPresente` não
 *     toca no DOM, e é onde moram os cortes de texto e a peneira da cor: é a
 *     mesma peneira que o `falaDoServidor` da faixa faz, e pela mesma razão —
 *     o que chega aqui vem de uma rede social, e vai parar no que o OBS está
 *     capturando.
 */

/**
 * Quanto texto cada campo aceita.
 *
 * O pop-up escreve em corpo de manchete: o nome do presente a 84px e o apelido
 * de quem mandou a 54px, numa tela de 1080. Um apelido de rede social tem
 * quarenta caracteres com folga, e quarenta caracteres a 54px são três linhas
 * atravessando o enquadramento. Os números são o que cabe em duas linhas.
 */
export const LIMITE_DO_NOME = 26;
export const LIMITE_DO_QUEM = 20;
export const LIMITE_DA_URNA = 16;

/**
 * A mesma expressão do `COR_VALIDA` do `server/config.js` e do `public/js/urna.js`.
 *
 * Três cópias da mesma linha, e é de propósito: são as três pontas do fio por
 * onde uma cor passa — a configuração que a escreve, a urna que a desenha, e
 * este pop-up. Uma delas esquecida é uma cor que entra sem ser conferida.
 *
 * Aqui ela é a mais importante das três, porque este é o único campo do pop-up
 * que vira PROPRIEDADE DE ESTILO, e não texto. `textContent` neutraliza o que
 * vier — um apelido com `<script>` sai como os caracteres que ele tem —, mas o
 * valor de uma propriedade é INTERPRETADO. Só hexadecimal, com o `#`.
 */
export const COR_VALIDA = /^#[0-9a-f]{3}$|^#[0-9a-f]{6}$|^#[0-9a-f]{8}$/i;

/** O corte avisa que cortou — sem reticências ele parece defeito da tela. */
function cortar(valor, limite) {
  const texto = String(valor ?? '').trim();
  return texto.length > limite ? `${texto.slice(0, limite - 1).trimEnd()}…` : texto;
}

/**
 * O que o pop-up mostra de uma fala — ou `null` quando não há o que mostrar.
 *
 * Pura de propósito: é aqui que se decide o que pode chegar à tela que o OBS
 * está capturando, e é a única parte deste arquivo que dá para conferir sem
 * navegador.
 */
export function dadosDoPresente(fala) {
  if (!fala || typeof fala !== 'object') return null;
  if (fala.tipo !== 'presente') return null;

  const presente = fala.presente;
  if (!presente || typeof presente !== 'object' || Array.isArray(presente)) return null;

  const nome = cortar(presente.nome, LIMITE_DO_NOME);
  /*
   * O desenho já chega conferido: o `falaDoServidor` da faixa aplica a mesma
   * expressão que o `config.js` usa para escrever, e é a mesma peneira nas
   * duas pontas do fio. Aqui ele só é copiado adiante.
   */
  const desenho = typeof presente.desenho === 'string' && presente.desenho ? presente.desenho : null;

  // Sem imagem E sem nome, o pop-up seria um clarão sem explicação nenhuma.
  if (!nome && !desenho) return null;

  /*
   * A cor é o único campo que este arquivo NÃO copia adiante de olhos
   * fechados, e a assimetria tem motivo: ela vai virar `style`, e não texto.
   * `null` é a resposta para tudo o que não for hexadecimal — e quem decide o
   * dourado, aí, é o CSS.
   */
  const cor = COR_VALIDA.test(String(presente.cor ?? '').trim()) ? String(presente.cor).trim() : null;

  return {
    nome,
    desenho,
    cor,
    quem: cortar(fala.usuario, LIMITE_DO_QUEM),
    urna: cortar(presente.urna, LIMITE_DA_URNA),
  };
}

/** Quantas faíscas saem do centro na entrada. Par, para o leque ser simétrico. */
const FAISCAS = 16;

/**
 * O pop-up na tela.
 *
 * @param {HTMLElement} camada  onde ele é pendurado (a camada de pop-up)
 * @param {object} [opcoes]
 * @param {number} [opcoes.duracaoMs] quanto tempo ele fica depois de entrar
 */
export function criarPopupPresente(camada, { duracaoMs = 4_500 } = {}) {
  const el = document.createElement('div');
  el.className = 'popup';
  el.setAttribute('aria-hidden', 'true');
  /*
   * A estrutura é montada de uma vez, e não campo a campo no `mostrar`: são
   * poucos elementos fixos, e criá-los a cada presente deixaria lixo no DOM a
   * cada rosa da noite — a página do OBS fica aberta por horas.
   *
   * As camadas de efeito vêm ANTES do cartão na ordem do documento, e é isso
   * que as põe atrás dele: a explosão é o fundo do presente, não uma coisa em
   * cima do nome.
   */
  el.innerHTML = `
    <div class="popup__veu"></div>
    <div class="popup__explosao">
      <span class="popup__onda"></span>
      <span class="popup__onda popup__onda--tarde"></span>
    </div>
    <div class="popup__faiscas"></div>
    <div class="popup__cartao">
      <div class="popup__nome"></div>
      <div class="popup__figura">
        <div class="popup__raios"></div>
        <img class="popup__desenho" alt="" hidden />
      </div>
      <div class="popup__quem"></div>
      <div class="popup__urna"></div>
    </div>`;
  camada.append(el);

  const cartao = el.querySelector('.popup__cartao');
  const campoNome = el.querySelector('.popup__nome');
  const campoQuem = el.querySelector('.popup__quem');
  const campoUrna = el.querySelector('.popup__urna');
  const figura = el.querySelector('.popup__desenho');
  const faiscas = el.querySelector('.popup__faiscas');

  /*
   * As faíscas nascem uma vez e ficam paradas, fora de cena.
   *
   * Quem as acende é a classe de visível, no CSS — como todo o resto daqui.
   * Elas são criadas agora, e não a cada presente, porque criar e destruir
   * dezesseis elementos a cada rosa da noite é trabalho que o navegador faz
   * dentro do quadro em que o presente precisa aparecer.
   *
   * O lugar de cada uma é escrito aqui e lido pelo CSS: o ângulo abre o leque
   * em volta do cartão, e a distância varia para elas não saírem todas na
   * mesma casca. Sem `cos()` — o OBS 30 embarca um Chromium 103, e a função
   * trigonométrica do CSS só existe a partir do 111. O CSS gira o eixo e anda
   * por ele, que é a mesma conta feita pelo navegador.
   */
  for (let i = 0; i < FAISCAS; i++) {
    const f = document.createElement('span');
    f.className = 'popup__faisca';
    f.style.setProperty('--angulo', `${Math.round((360 / FAISCAS) * i + (i % 3) * 6)}deg`);
    // Até 540px do centro, que é a metade da largura do palco: mais longe do
    // que isso e as faíscas dos lados saem de cena antes de serem vistas.
    f.style.setProperty('--dist', `${300 + (i % 4) * 80}px`);
    f.style.setProperty('--atraso', `${(i % 4) * 45}ms`);
    faiscas.append(f);
  }

  /*
   * Um desenho que não veio não deixa buraco: ele some e o nome do presente
   * cresce para o lugar dele.
   *
   * O nome do arquivo é escrito à mão no `config/local.json` — um
   * `"desenho": "roses"` com um "s" a mais viraria um quadrado de imagem
   * quebrada na tela da transmissão, no meio de um presente pago. A classe no
   * CARTÃO, e não na figura, porque quem cresce é o texto.
   */
  figura.addEventListener('error', () => {
    figura.hidden = true;
    cartao.classList.add('popup--sem-desenho');
  });

  let escondendo = null;

  function esconder() {
    clearTimeout(escondendo);
    escondendo = null;
    el.classList.remove('popup--visivel');
  }

  return {
    /** Mostra o pop-up de uma fala. Devolve `false` quando não era presente. */
    mostrar(fala) {
      const dados = dadosDoPresente(fala);
      if (!dados) return false;

      campoNome.textContent = dados.nome;
      campoQuem.textContent = dados.quem ? `de ${dados.quem}` : '';
      campoUrna.textContent = dados.urna ? `vai pra ${dados.urna}` : '';

      /*
       * A cor da urna entra como uma variável no PRÓPRIO pop-up, e todo o
       * resto do CSS a herda: o nome, o crachá, o brilho do desenho, as
       * faíscas, as ondas e o veu.
       *
       * Uma variável, e não uma classe por cor: as cores vêm da configuração
       * do Leonardo e são escolhidas por ele — `#1a5fd0` para o 22, `#e02020`
       * para o 13 —, então nenhuma lista de classes aqui saberia quais são.
       *
       * Sem cor conhecida a propriedade é REMOVIDA, e não posta em vazio: o
       * vazio apagaria o dourado que o CSS declara como padrão e o pop-up
       * sairia cinza.
       */
      if (dados.cor) el.style.setProperty('--cor-urna', dados.cor);
      else el.style.removeProperty('--cor-urna');

      /*
       * A imagem decide o resto do cartão: com ela, o nome do presente é a
       * etiqueta em cima; sem ela, o nome É a figura, e cresce.
       */
      cartao.classList.toggle('popup--sem-desenho', !dados.desenho);
      if (dados.desenho) {
        figura.src = `/img/${dados.desenho}.webp`;
        figura.hidden = false;
      } else {
        figura.hidden = true;
        figura.removeAttribute('src');
      }

      /*
       * O reinício da animação, e por que ele precisa deste `offsetWidth`.
       *
       * Um presente atrás do outro — dois combos na mesma rajada — reusa o
       * MESMO elemento, que já está visível. Tirar e pôr a classe no mesmo
       * quadro não reinicia nada: o navegador junta as duas mudanças e o
       * segundo presente aparece parado, sem entrada nenhuma. Ler `offsetWidth`
       * força o navegador a calcular o layout no meio do caminho, e é o que
       * separa "escondido" de "visível" em dois estados de verdade.
       *
       * Vale para a explosão inteira — ondas, faíscas e raios —, que é toda
       * presa à mesma classe.
       */
      el.classList.remove('popup--visivel');
      void el.offsetWidth;
      el.classList.add('popup--visivel');

      clearTimeout(escondendo);
      escondendo = setTimeout(esconder, duracaoMs);
      return true;
    },

    esconder,

    get naTela() { return el.classList.contains('popup--visivel'); },
    /** O que a sonda do navegador alcança. */
    get el() { return el; },
  };
}
