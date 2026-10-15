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

const PAINEIS = 4;

export function montarCenario(raiz) {
  raiz.innerHTML = `
    <div class="palco" id="palco">
      <div class="parede">
        ${Array.from({ length: PAINEIS }, () => '<div class="parede__painel"></div>').join('')}
      </div>
      <div class="armario"></div>
      <div class="mesa"><div class="mesa__tampo"></div></div>
      <div class="piso">
        <div class="piso__reflexo" data-reflexo="u1"></div>
        <div class="piso__reflexo" data-reflexo="u2" style="left:auto; right:12%"></div>
      </div>
      <div class="camada camada--urnas"   id="camada-urnas"></div>
      <div class="camada camada--mao"     id="camada-mao"></div>
      <div class="camada camada--efeitos" id="camada-efeitos"></div>
    </div>
  `;

  const palco = raiz.querySelector('#palco');

  // Redimensionar invalida as coordenadas que a mão mediu das teclas.
  // O evento avisa o ator para remedir — sem isso o dedo passa a errar
  // a tecla depois que o OBS muda a resolução da fonte.
  const ajustar = () => {
    const escala = calcularEscala(window.innerWidth, window.innerHeight);
    palco.style.setProperty('--escala', String(escala));
    window.dispatchEvent(new CustomEvent('palco:redimensionado', { detail: { escala } }));
  };
  ajustar();
  window.addEventListener('resize', ajustar);

  return {
    el: palco,
    camadaUrnas: raiz.querySelector('#camada-urnas'),
    camadaMao: raiz.querySelector('#camada-mao'),
    camadaEfeitos: raiz.querySelector('#camada-efeitos'),
  };
}
