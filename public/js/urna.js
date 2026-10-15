/**
 * A urna eletrônica.
 *
 * O módulo tem duas metades bem separadas: `paraCoordenadasDoPalco` é
 * aritmética pura e roda sob node:test; `criarUrna` monta o DOM.
 *
 * A regra que sustenta o resto do projeto está em `medirGeometria`: as
 * teclas são medidas no navegador, nunca posicionadas por constantes.
 * Nenhuma coordenada de tecla é fixada em código — se o layout mudar de
 * tamanho, a mão continua acertando a tecla sem ninguém tocar na mão.
 */

/**
 * Converte um DOMRect do viewport para coordenadas do palco (1080x1920),
 * independentes da escala aplicada. É isto que permite a mão mirar a
 * tecla sem nenhum mapa de coordenadas fixo em código.
 */
export function paraCoordenadasDoPalco(rect, palcoRect) {
  const escala = palcoRect.width / 1080;
  const x = (rect.left - palcoRect.left) / escala;
  const y = (rect.top - palcoRect.top) / escala;
  const largura = rect.width / escala;
  const altura = rect.height / escala;
  return {
    x, y, largura, altura,
    centro: { x: x + largura / 2, y: y + altura / 2 },
  };
}

const TECLAS_NUMERICAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const TECLAS_ACAO = [
  { id: 'BRANCO',   rotulo: 'BRANCO',   classe: 'tecla--branco' },
  { id: 'CORRIGE',  rotulo: 'CORRIGE',  classe: 'tecla--corrige' },
  { id: 'CONFIRMA', rotulo: 'CONFIRMA', classe: 'tecla--confirma' },
];

export function criarUrna(config) {
  const el = document.createElement('div');
  el.className = 'urna';
  el.dataset.urnaId = config.id;
  el.style.setProperty('--x', `${config.x}px`);
  el.style.setProperty('--y', `${config.y}%`);
  el.style.setProperty('--rot', `${config.rot ?? 0}deg`);
  el.style.setProperty('--cor-urna', config.corPrimaria);

  const grade = TECLAS_NUMERICAS.slice(0, 9);
  el.innerHTML = `
    <div class="urna__sombra"></div>
    <div class="urna__lado"></div>
    <div class="urna__topo">
      <div class="urna__slot" data-papel="entrada">
        <div class="urna__slot-boca"></div>
      </div>
    </div>
    <div class="urna__corpo">
      <div class="urna__placa">JUSTIÇA ELEITORAL</div>
      <div class="urna__tela" data-tela>
        <div class="tela__conteudo" data-tela-conteudo></div>
        <div class="tela__scanlines"></div>
        <div class="tela__vidro"></div>
      </div>
      <div class="urna__teclado">
        <div class="teclado__grade">
          ${grade.map((n) => `
            <button class="tecla" data-tecla="${n}" type="button">
              <span class="tecla__capa"><span class="tecla__rotulo">${n}</span></span>
              <span class="tecla__led"></span>
            </button>`).join('')}
        </div>
        <div class="teclado__acoes">
          ${TECLAS_ACAO.map((t) => `
            <button class="tecla tecla--acao ${t.classe}" data-tecla="${t.id}" type="button">
              <span class="tecla__capa"><span class="tecla__rotulo">${t.rotulo}</span></span>
              <span class="tecla__led"></span>
            </button>`).join('')}
        </div>
      </div>
      <div class="urna__respiros"></div>
      <div class="urna__parafusos">
        <span></span><span></span><span></span><span></span>
      </div>
    </div>
    <div class="urna__glow"></div>
  `;

  const telaConteudo = el.querySelector('[data-tela-conteudo]');

  function teclaEl(id) {
    return el.querySelector(`[data-tecla="${id}"]`);
  }

  /** Mede todas as teclas e pontos notáveis, em coordenadas do palco. */
  function medirGeometria() {
    const palco = el.closest('.palco');
    const palcoRect = palco.getBoundingClientRect();
    const teclas = {};
    for (const btn of el.querySelectorAll('[data-tecla]')) {
      teclas[btn.dataset.tecla] = paraCoordenadasDoPalco(btn.getBoundingClientRect(), palcoRect);
    }
    const slotEl = el.querySelector('[data-papel="entrada"]');
    const telaEl = el.querySelector('[data-tela]');
    return {
      teclas,
      slot: paraCoordenadasDoPalco(slotEl.getBoundingClientRect(), palcoRect),
      tela: paraCoordenadasDoPalco(telaEl.getBoundingClientRect(), palcoRect),
      corpo: paraCoordenadasDoPalco(el.getBoundingClientRect(), palcoRect),
    };
  }

  return {
    el,
    config,
    teclaEl,
    medirGeometria,
    definirTela(html) { telaConteudo.innerHTML = html; },
    pressionarTecla(id) {
      const t = teclaEl(id);
      if (t) t.classList.add('is-pressionada');
    },
    soltarTecla(id) {
      const t = teclaEl(id);
      if (t) t.classList.remove('is-pressionada');
    },
    acenderLed(id, ligado = true) {
      const t = teclaEl(id);
      if (t) t.classList.toggle('is-led', ligado);
    },
  };
}
