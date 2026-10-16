/**
 * Cenário da cabine eleitoral.
 *
 * O palco é sempre desenhado em 1080x1920 e escalado para caber na janela.
 * Toda coordenada do resto do sistema é em pixels do palco — nenhum módulo
 * precisa saber da escala, e é por isso que o OBS pode capturar em qualquer
 * resolução sem que a mão erre as teclas.
 */

/** Dimensões de desenho do palco. A escala é aplicada por cima. */
export const PALCO = Object.freeze({ largura: 1080, altura: 1920 });

/**
 * Escala que faz o palco caber inteiro na janela, encostando em uma das
 * duas bordas. Função pura: é o que garante que não sobra faixa morta
 * nem aparece barra de rolagem.
 */
export function calcularEscala(larguraJanela, alturaJanela) {
  return Math.min(larguraJanela / PALCO.largura, alturaJanela / PALCO.altura);
}

/**
 * A escala pedida pelo endereço, quando houver.
 *
 * `?zoom=1` desenha o palco no tamanho real de 1080x1920 e deixa a página
 * rolar. Serve para conferir de perto o que, numa janela deitada, aparece
 * reduzido a 38% — a 0,38 de escala um rótulo de 9px chega à tela com
 * 3,4px, e não há desenho que sobreviva a isso.
 *
 * É ferramenta de conferência, não de transmissão: o OBS captura a página
 * sem parâmetro nenhum, e sem parâmetro o palco volta a caber na janela.
 */
export function escalaPedida(busca) {
  const bruto = new URLSearchParams(busca).get('zoom');
  if (bruto === null) return null;
  const n = Number(bruto);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * A escala que o palco usa agora.
 *
 * Separada de `montarCenario` porque é a única parte da decisão que dá
 * para conferir sem navegador: com o modo de conferência ligado quem manda
 * é o zoom pedido (ou o tamanho real), e desligado quem manda é a janela.
 */
export function escalaDaCena({ ligado, pedida, larguraJanela, alturaJanela }) {
  if (!ligado) return calcularEscala(larguraJanela, alturaJanela);
  return pedida ?? 1;
}

export function montarCenario(raiz) {
  /*
   * A ordem aqui é a ordem de pintura de trás para a frente: parede, piso,
   * mesa, e só então as camadas de conteúdo. Cada peça também declara o
   * próprio z-index, mas manter a ordem do documento igual à da profundidade
   * é o que faz a cena continuar legível para quem for mexer nela depois.
   */
  raiz.innerHTML = `
    <div class="palco" id="palco">
      <div class="parede"></div>
      <div class="piso"></div>
      <div class="mesa">
        <div class="mesa__tampo"></div>
        <div class="mesa__borda"></div>
        <div class="mesa__saia"></div>
        <div class="mesa__sombra"></div>
        <div class="mesa__pe mesa__pe--esq"></div>
        <div class="mesa__pe mesa__pe--dir"></div>
      </div>
      <div class="luz"></div>
      <div class="camada camada--placar"  id="camada-placar"></div>
      <div class="camada camada--urnas"   id="camada-urnas"></div>
      <div class="camada camada--mao"     id="camada-mao"></div>
      <div class="camada camada--efeitos" id="camada-efeitos"></div>
      <div class="camada camada--resultado" id="camada-resultado"></div>
      <div class="camada camada--popup" id="camada-popup"></div>
    </div>
  `;

  const palco = raiz.querySelector('#palco');

  // Com `?zoom=` na barra de endereços, o palco já abre no modo de conferência.
  const pedida = escalaPedida(window.location.search);
  let ligado = pedida !== null;

  // Redimensionar invalida as coordenadas que a mão mediu das teclas.
  // O evento avisa o ator para remedir — sem isso o dedo passa a errar
  // a tecla depois que o OBS muda a resolução da fonte.
  const ajustar = () => {
    raiz.classList.toggle('cena--zoom', ligado);
    const escala = escalaDaCena({
      ligado, pedida,
      larguraJanela: window.innerWidth,
      alturaJanela: window.innerHeight,
    });
    palco.style.setProperty('--escala', String(escala));
    window.dispatchEvent(new CustomEvent('palco:redimensionado', { detail: { escala } }));
  };
  ajustar();
  window.addEventListener('resize', ajustar);

  return {
    el: palco,
    camadaPlacar: raiz.querySelector('#camada-placar'),
    camadaUrnas: raiz.querySelector('#camada-urnas'),
    camadaMao: raiz.querySelector('#camada-mao'),
    camadaEfeitos: raiz.querySelector('#camada-efeitos'),
    camadaResultado: raiz.querySelector('#camada-resultado'),
    camadaPopup: raiz.querySelector('#camada-popup'),
    /**
     * Liga e desliga o tamanho real do palco.
     *
     * Hoje quem entra no modo de conferência é o `?zoom=1` no endereço, e nada
     * na tela chama este método — ele nasceu para o botão da barra de
     * demonstração, que saiu junto com a barra. Fica porque é a única porta
     * para ligar o zoom sem recarregar a página, e porque `data-zoom` é
     * justamente um dos ganchos que a tela do ar NÃO pode ter.
     */
    alternarZoom() {
      ligado = !ligado;
      ajustar();
      return ligado;
    },
  };
}
