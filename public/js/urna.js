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

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * Produz o HTML interno da tela. Função pura — recebe o estado, devolve string.
 * O nome da urna vem da configuração do usuário, então é sempre escapado.
 */
export function renderizarTela(estado) {
  const { tipo } = estado;

  if (tipo === 'digitando') {
    const digitos = String(estado.numeroDigitado ?? '');
    const campos = String(estado.numero ?? '  ').split('').map((_, i) => {
      const d = digitos[i] ?? '';
      return `<span class="tela__digito${d ? ' is-preenchido' : ''}">${esc(d)}</span>`;
    }).join('');
    return `
      <div class="tela__linha tela__linha--topo">${esc(estado.nome ?? '')}</div>
      <div class="tela__numeros">${campos}</div>`;
  }

  if (tipo === 'confirmado') {
    return `
      <div class="tela__linha tela__linha--topo">${esc(estado.numero ?? '')}</div>
      <div class="tela__confirmado">VOTO CONFIRMADO</div>
      <div class="tela__contagem">${esc(estado.votos ?? 0)}</div>
      ${estado.votosAdicionados ? `<div class="tela__delta">+${esc(estado.votosAdicionados)}</div>` : ''}`;
  }

  if (tipo === 'corrija') {
    return `
      <div class="tela__linha tela__linha--topo">${esc(estado.numero ?? '')}</div>
      <div class="tela__corrija">VOTO NULO — CORRIJA</div>`;
  }

  return `
    <div class="tela__linha tela__linha--topo">${esc(estado.nome ?? '')}</div>
    <div class="tela__idle-numero">${esc(estado.numero ?? '')}</div>
    <div class="tela__idle-votos">${esc(estado.votos ?? 0)} VOTOS</div>`;
}

export const LAYOUT_TECLADO = {
  grade: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
  zero: '0',
  acoes: [
    { id: 'BRANCO',   rotulo: 'BRANCO',   classe: 'tecla--branco',   ledPersistente: false },
    { id: 'CORRIGE',  rotulo: 'CORRIGE',  classe: 'tecla--corrige',  ledPersistente: false },
    { id: 'CONFIRMA', rotulo: 'CONFIRMA', classe: 'tecla--confirma', ledPersistente: true  },
  ],
};

export function todasAsTeclas() {
  return [...LAYOUT_TECLADO.grade, LAYOUT_TECLADO.zero, ...LAYOUT_TECLADO.acoes.map((t) => t.id)];
}

/**
 * O teclado em HTML. Função pura de propósito: o teste confere que toda
 * tecla declarada em LAYOUT_TECLADO realmente virou um botão no DOM, e
 * isso não deveria exigir um navegador para verificar.
 *
 * O zero fica sozinho na coluna do meio, como na urna de verdade.
 */
export function markupTeclado() {
  const tecla = (id, classe = '', rotulo = id) => `
    <button class="tecla ${classe}" data-tecla="${id}" type="button">
      <span class="tecla__capa"><span class="tecla__rotulo">${esc(rotulo)}</span></span>
      <span class="tecla__led"></span>
    </button>`;

  return `
    <div class="teclado__grade">
      ${LAYOUT_TECLADO.grade.map((n) => tecla(n)).join('')}
      ${tecla(LAYOUT_TECLADO.zero, 'tecla--zero')}
    </div>
    <div class="teclado__acoes">
      ${LAYOUT_TECLADO.acoes.map((t) => tecla(t.id, `tecla--acao ${t.classe}`, t.rotulo)).join('')}
    </div>`;
}

export function criarUrna(config) {
  const el = document.createElement('div');
  el.className = 'urna';
  el.dataset.urnaId = config.id;
  el.style.setProperty('--x', `${config.x}px`);
  el.style.setProperty('--y', `${config.y}%`);
  el.style.setProperty('--rot', `${config.rot ?? 0}deg`);
  el.style.setProperty('--cor-urna', config.corPrimaria);

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
        ${markupTeclado()}
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
    definirTela(estado) { telaConteudo.innerHTML = renderizarTela(estado); },
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
