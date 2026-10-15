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

const COR_PADRAO = '#8a8f98';
const COR_VALIDA = /^#[0-9a-f]{3}$|^#[0-9a-f]{6}$|^#[0-9a-f]{8}$/i;

/**
 * Hex para rgba.
 *
 * Existe porque `color-mix()` só chegou ao Chromium 111 e o OBS 30 embarca
 * o 103: com color-mix o halo da urna simplesmente não apareceria, sem erro
 * nenhum no console, para quem estivesse numa versão mais antiga do OBS.
 * Aqui o valor sai pronto e funciona em qualquer navegador embutido.
 */
export function corParaRgba(cor, alfa) {
  const hex = cor.slice(1);
  const cheio = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const r = parseInt(cheio.slice(0, 2), 16);
  const g = parseInt(cheio.slice(2, 4), 16);
  const b = parseInt(cheio.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

/**
 * As variáveis CSS que dão identidade a uma urna.
 *
 * `--tecla-led-cor` sai no elemento raiz da urna, não em cada tecla: as
 * teclas numéricas herdam a cor da urna, e BRANCO, CORRIGE e CONFIRMA
 * continuam com as cores características declaradas por classe.
 */
export function variaveisDeIdentidade(config) {
  const primaria = COR_VALIDA.test(config.corPrimaria ?? '') ? config.corPrimaria : COR_PADRAO;
  const secundaria = COR_VALIDA.test(config.corSecundaria ?? '') ? config.corSecundaria : primaria;
  return {
    '--cor-urna': primaria,
    '--cor-urna-2': secundaria,
    '--cor-urna-fraca': corParaRgba(primaria, 0.55),
    '--cor-urna-media': corParaRgba(primaria, 0.65),
    '--tecla-led-cor': primaria,
  };
}

export function aplicarIdentidade(el, config) {
  for (const [nome, valor] of Object.entries(variaveisDeIdentidade(config))) {
    el.style.setProperty(nome, valor);
  }
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * Retrato desenhado do candidato.
 *
 * É um desenho, e não a foto de alguém. A urna padrão não tem candidato de
 * verdade, e pôr o rosto de uma pessoa real num cartão de "candidato" de
 * uma votação que não existe é apresentar alguém como o que ele não é.
 * Quem tiver a foto do seu candidato aponta para ela em `candidato.foto`,
 * e a foto aparece no lugar do desenho.
 *
 * Sem `defs` e sem gradiente de propósito: dois destes na mesma página
 * repetiriam o mesmo `id`, e o segundo passaria a usar as cores do
 * primeiro.
 */
export function retratoSvg(cor = '#1a5fd0') {
  const pele = '#e8b98f';
  const peleSombra = '#d19a6c';
  const cabelo = '#33291f';
  return `<svg class="tela__retrato-svg" viewBox="0 0 100 120" role="img" aria-label="Retrato do candidato">
    <rect width="100" height="120" fill="#cdd8e6"/>
    <rect y="86" width="100" height="34" fill="#bcc9da"/>
    <path d="M6 120 C8 98 26 88 50 88 C74 88 92 98 94 120 Z" fill="#2c333f"/>
    <path d="M50 88 L50 120 L38 120 L44 92 Z" fill="#232935"/>
    <path d="M50 88 L50 120 L62 120 L56 92 Z" fill="#232935"/>
    <path d="M42 90 L50 108 L58 90 Z" fill="#f2f5fa"/>
    <path d="M50 100 L45 112 L50 120 L55 112 Z" fill="${cor}"/>
    <rect x="43" y="72" width="14" height="20" rx="6" fill="${peleSombra}"/>
    <ellipse cx="50" cy="52" rx="20" ry="24" fill="${pele}"/>
    <path d="M30 50 C29 27 41 19 50 19 C59 19 71 27 70 50 C70 41 63 35 50 35 C37 35 30 41 30 50 Z" fill="${cabelo}"/>
    <ellipse cx="42" cy="51" rx="3" ry="3.4" fill="#2b2b2b"/>
    <ellipse cx="58" cy="51" rx="3" ry="3.4" fill="#2b2b2b"/>
    <path d="M36 43 C38 40.5 42 40.5 45 42.5" stroke="${cabelo}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M55 42.5 C58 40.5 62 40.5 64 43" stroke="${cabelo}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M46 63 C48 65 52 65 54 63" stroke="#b9764f" stroke-width="2" fill="none" stroke-linecap="round"/>
  </svg>`;
}

/**
 * O retrato do candidato: a foto do usuário, se houver, senão o desenho.
 *
 * O endereço da foto entra num atributo, então passa pelo mesmo escape do
 * resto: sem isso, uma aspa no caminho fecha o atributo e o que vier
 * depois vira marcação.
 */
function markupRetrato(estado, cor) {
  const foto = estado.candidato?.foto;
  if (foto) {
    return `<img class="tela__retrato-foto" src="${esc(foto)}" alt="">`;
  }
  return retratoSvg(cor);
}

function markupFaixa(estado) {
  // O cargo é a primeira linha da urna de verdade. Sem cargo configurado,
  // o nome da urna faz as vezes — é o que ele é, e é honesto.
  const cargo = estado.cargo ?? estado.nome ?? 'URNA';
  return `
    <div class="tela__faixa">
      <span class="tela__faixa-rotulo">SEU VOTO PARA</span>
      <span class="tela__faixa-cargo">${esc(cargo)}</span>
    </div>`;
}

function markupFicha(estado, cor, slotNumero) {
  const c = estado.candidato ?? {};
  const nome = c.nome ?? estado.nome ?? '';
  const partido = c.partido ?? '—';
  const numero = slotNumero ?? `<span class="tela__numero">${esc(estado.numero ?? '')}</span>`;
  return `
    <div class="tela__ficha">
      <div class="tela__retrato">${markupRetrato(estado, cor)}</div>
      <div class="tela__dados">
        <div class="tela__campo">
          <span class="tela__campo-rotulo">Nome:</span>
          <span class="tela__campo-valor">${esc(nome)}</span>
        </div>
        <div class="tela__campo">
          <span class="tela__campo-rotulo">Partido:</span>
          <span class="tela__campo-valor">${esc(partido)}</span>
        </div>
        <div class="tela__campo tela__campo--numero">
          <span class="tela__campo-rotulo">Número:</span>
          ${numero}
        </div>
      </div>
    </div>`;
}

function markupRodape() {
  /*
   * O rodapé é o da urna de verdade, e não um lugar de recado nosso.
   *
   * Havia aqui uma contagem — "0 VOTOS" — que parecia inofensiva e era o
   * detalhe que mais denunciava a imitação: a urna do TSE não tem placar
   * nenhum no visor. Quem conta voto é o painel, no alto do enquadramento.
   */
  /*
   * Duas linhas, uma por tecla, e não uma frase corrida: numa tela de 228px
   * a frase inteira não cabe, e o navegador quebrava no meio dela — "para"
   * numa linha e "CONFIRMAR" na outra. É assim que a urna de verdade mostra,
   * aliás: uma instrução por linha.
   */
  return `
    <div class="tela__rodape">
      <div class="tela__rodape-linha">
        <span class="tela__rodape-tecla">VERDE</span>
        <span class="tela__rodape-texto">para CONFIRMAR</span>
      </div>
      <div class="tela__rodape-linha">
        <span class="tela__rodape-tecla tela__rodape-tecla--laranja">LARANJA</span>
        <span class="tela__rodape-texto">para REINICIAR</span>
      </div>
    </div>`;
}

/**
 * Produz o HTML interno da tela. Função pura — recebe o estado, devolve string.
 * O nome da urna vem da configuração do usuário, então é sempre escapado.
 *
 * A ordem dos elementos é a da urna brasileira: faixa do cargo em cima,
 * retrato do candidato ao lado da ficha no meio, e a instrução da tecla no
 * rodapé. Os dígitos que a mão digita entram no lugar do número.
 */
export function renderizarTela(estado) {
  const { tipo } = estado;
  const cor = estado.cor ?? '#1a5fd0';

  if (tipo === 'digitando') {
    /*
     * Os dígitos ocupam o lugar do número, e não um bloco à parte: a urna
     * de verdade tem um lugar só para o número, e ele é o mesmo antes e
     * depois de a mão digitar. Dois lugares para o mesmo número fariam a
     * tela mostrar "22" e "2_" ao mesmo tempo.
     */
    const digitos = String(estado.numeroDigitado ?? '');
    const campos = String(estado.numero ?? '  ').split('').map((_, i) => {
      const d = digitos[i] ?? '';
      return `<span class="tela__digito${d ? ' is-preenchido' : ''}">${esc(d)}</span>`;
    }).join('');
    return `
      ${markupFaixa(estado)}
      ${markupFicha(estado, cor, `<span class="tela__numeros">${campos}</span>`)}
      ${markupRodape(estado)}`;
  }

  if (tipo === 'confirmado') {
    return `
      ${markupFaixa(estado)}
      <div class="tela__confirmado">VOTO CONFIRMADO</div>
      <div class="tela__contagem">${esc(estado.votos ?? 0)}</div>
      ${estado.votosAdicionados ? `<div class="tela__delta">+${esc(estado.votosAdicionados)}</div>` : ''}`;
  }

  if (tipo === 'corrija') {
    return `
      ${markupFaixa(estado)}
      <div class="tela__corrija">VOTO NULO</div>
      <div class="tela__corrija-dica">Aperte LARANJA para CORRIGIR</div>`;
  }

  // Ocioso — e também o destino de qualquer estado desconhecido, que não
  // pode deixar a tela em branco no meio da live.
  return `
    ${markupFaixa(estado)}
    ${markupFicha(estado, cor)}
    ${markupRodape(estado)}`;
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

/**
 * A cédula que sai da impressora depois do CONFIRMA.
 *
 * Papel de verdade, com número, quem votou e qual presente valeu o voto.
 * Todo campo entra escapado: a cédula é montada por concatenação de string
 * e vai direto para o `innerHTML` da urna.
 */
export function markupDaCedula({ usuario = '', presente = '', votos = 1, numero = '' } = {}) {
  return `
    <div class="cedula__borda">
      <div class="cedula__titulo">VOTO</div>
      <div class="cedula__urna">${esc(numero)}</div>
      <div class="cedula__linha"></div>
      <div class="cedula__quem">${esc(usuario)}</div>
      <div class="cedula__presente">${esc(presente)}</div>
      ${votos > 1 ? `<div class="cedula__votos">${esc(votos)} votos</div>` : ''}
      <div class="cedula__picotado"></div>
    </div>`;
}

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

/**
 * As classes de estado transitório que a urna veste durante um voto.
 *
 * Estão aqui, e não soltas em quem as aplica, porque quem as REMOVE precisa
 * conhecer a lista inteira. Enquanto cada `classList.add` morava no ator e a
 * limpeza era uma lista escrita à mão ao lado dele, uma classe nova nascia
 * sem par: a urna ficava acesa depois do voto e ninguém descobria até ver a
 * transmissão.
 */
export const CLASSES_DE_ESTADO = Object.freeze({
  destacada: 'is-destacada',
  contando: 'is-contando',
  cedulaSaindo: 'is-cedula-saindo',
  cedulaEntrando: 'is-cedula-entrando',
});

export function criarUrna(config) {
  const el = document.createElement('div');
  el.className = 'urna';
  el.dataset.urnaId = config.id;
  el.style.setProperty('--x', `${config.x}px`);
  el.style.setProperty('--y', `${config.y}%`);
  el.style.setProperty('--rot', `${config.rot ?? 0}deg`);
  aplicarIdentidade(el, config);

  el.innerHTML = `
    <div class="urna__sombra"></div>
    <div class="urna__lado"></div>
    <div class="urna__topo"></div>
    <div class="urna__corpo">
      <div class="urna__placa">JUSTIÇA ELEITORAL</div>
      <div class="urna__slot" data-papel="entrada">
        <div class="urna__slot-boca"></div>
      </div>
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

  // O compartimento da cédula fica fora do __corpo para não herdar o
  // rotateY do gabinete: o papel precisa sair de frente para a câmera.
  const cedulaEl = document.createElement('div');
  cedulaEl.className = 'urna__cedula';
  el.append(cedulaEl);

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
    /**
     * Escreve a tela. O que muda por voto é só o estado (tipo, dígitos,
     * contagem); o resto — número, cargo, candidato, cor — é identidade da
     * urna e vem da configuração dela.
     *
     * A identidade entra AQUI, e não em cada chamada: enquanto ela vinha de
     * fora, cada lugar que chamava `definirTela` tinha que lembrar de
     * repassar quatro campos, e o dia em que um esquecesse a tela aparecia
     * sem candidato e sem cor, só naquele caminho.
     */
    definirTela(estado = {}) {
      telaConteudo.innerHTML = renderizarTela({
        numero: config.numero,
        nome: config.nome,
        cargo: config.cargo,
        candidato: config.candidato,
        cor: config.corPrimaria,
        // O total é consultado na contagem, não recebido de fora: quem
        // escreve na tela não sabe — nem deve saber — quantos votos a urna
        // tem. Sem contagem ligada, a urna mostra zero e não inventa.
        votos: typeof config.contagem === 'function' ? config.contagem() : 0,
        ...estado,
      });
    },
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
    /** Imprime a cédula e a faz sair do compartimento. */
    mostrarCedula(dados = {}) {
      cedulaEl.innerHTML = markupDaCedula({ numero: config.numero ?? '', ...dados });
      // Remover e forçar um reflow antes de readicionar reinicia a
      // transição: sem isso, uma cédula já visível não se move na segunda
      // vez, porque a classe nunca chegou a sair do elemento.
      cedulaEl.classList.remove('is-visivel');
      void cedulaEl.offsetWidth;
      cedulaEl.classList.add('is-visivel');
    },
    esconderCedula() { cedulaEl.classList.remove('is-visivel'); },
    /**
     * Devolve a urna ao repouso visual.
     *
     * Roda no fim de todo voto, inclusive quando o voto morre no meio. Sem
     * ela, a tecla que estava afundada continua afundada e o LED do CONFIRMA
     * continua aceso até alguém recarregar a página — para quem assiste, a
     * urna travou.
     *
     * Não mexe na tela: o conteúdo dela é do motor de votos, que é quem sabe
     * a contagem. Escrever um número aqui, por conta própria, seria inventar
     * um placar.
     */
    restaurarAoRepouso() {
      el.classList.remove(...Object.values(CLASSES_DE_ESTADO));
      for (const btn of el.querySelectorAll('[data-tecla]')) {
        btn.classList.remove('is-pressionada', 'is-led');
      }
      cedulaEl.classList.remove('is-visivel');
    },
    cedulaEl,
  };
}
