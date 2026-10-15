/**
 * Ponto de entrada da página de demonstração.
 *
 * Monta o cenário, as duas urnas e a mão, e liga os controles que
 * enfileiram votos — o mesmo caminho que um presente real vai percorrer
 * na Etapa 7. O que muda é só a origem do evento.
 */

import { montarCenario } from './scene.js';
import { criarUrna } from './urna.js';
import { criarPlacar } from './placar.js';
import { criarMaoSvg } from './hand/hand-svg.js';
import { AtorDaMao } from './hand-actor.js';

const cenario = montarCenario(document.getElementById('cena'));
const { camadaUrnas, camadaMao, camadaPlacar } = cenario;

/*
 * A contagem — a única fonte da verdade sobre quantos votos cada urna tem.
 *
 * A urna consulta este número para escrever a própria tela e o placar o
 * consulta para desenhar as barras. Guardar a contagem dentro da urna, ou
 * dentro do placar, daria dois números possíveis para o mesmo fato; o dia
 * em que divergissem, a tela e o placar mostrariam totais diferentes e
 * ninguém saberia qual está certo.
 */
const contagem = Object.create(null);

// Posições em coordenadas do palco (1080x1920). As urnas convergem
// levemente para o centro, o que reforça a perspectiva da cena.
//
// `candidato` e `cargo` são os campos que a tela da urna mostra. Os nomes
// aqui são de exemplo, e é aqui que você troca pelos seus: ponha o nome do
// candidato, o partido, e — se tiver a foto — `foto: '/fotos/fulano.jpg'`.
// Sem foto, a urna desenha um retrato.
const CONFIG_URNAS = [
  { id: 'u1', x: 40,  y: 33, rot: -7, nome: 'URNA 1', numero: '22',
    corPrimaria: '#1a5fd0', corSecundaria: '#0d3a8f',
    cargo: 'DEPUTADO FEDERAL',
    candidato: { nome: 'Ana Prado', partido: 'PARTIDO A' } },
  { id: 'u2', x: 550, y: 33, rot:  7, nome: 'URNA 2', numero: '13',
    corPrimaria: '#e02020', corSecundaria: '#8f0d0d',
    cargo: 'DEPUTADO FEDERAL',
    candidato: { nome: 'Bruno Tavares', partido: 'PARTIDO B' } },
];

const urnas = {};
for (const cfg of CONFIG_URNAS) {
  contagem[cfg.id] = 0;
  const u = criarUrna({ ...cfg, contagem: () => contagem[cfg.id] });
  u.definirTela({ tipo: 'ocioso' });
  camadaUrnas.append(u.el);
  urnas[cfg.id] = u;
}

const placar = criarPlacar(camadaPlacar, CONFIG_URNAS.map((c) => ({
  id: c.id, nome: c.nome, numero: c.numero, votos: 0, cor: c.corPrimaria,
})));

function atualizarPlacar() {
  placar.atualizar(CONFIG_URNAS.map((c) => ({
    id: c.id, nome: c.nome, numero: c.numero, votos: contagem[c.id], cor: c.corPrimaria,
  })));
}

const mao = criarMaoSvg();
const ator = new AtorDaMao({
  renderizador: mao,
  camada: camadaMao,
  opcoes: {
    aoContarVoto: ({ urnaId, votos }) => {
      contagem[urnaId] = (contagem[urnaId] ?? 0) + votos;
      atualizarPlacar();
    },
  },
});
ator.iniciar();

// ---- Controles de demonstração ----------------------------------------
// Substituídos pelo modo de teste real na Etapa 6. Servem para validar
// visualmente as Etapas 1-3 antes de construir o motor de votação.
const PRESENTES_DEMO = [
  { nome: 'Rosa',     urnaId: 'u1' },
  { nome: 'Heart Me', urnaId: 'u2' },
];

const barra = document.createElement('div');
barra.className = 'demo-barra';
barra.innerHTML = PRESENTES_DEMO
  .map((p) => `<button data-presente="${p.nome}" data-urna="${p.urnaId}">${p.nome} → ${urnas[p.urnaId].config.nome}</button>`)
  .join('')
  + '<button data-rajada="1">Rajada de 12</button>'
  /*
   * A urna desenhada em 1080x1920 não cabe inteira numa janela deitada: ela
   * cai para 38% e o texto miúdo do visor vira borrão. Este botão desenha o
   * palco no tamanho real e deixa a página rolar, para conferir de perto o
   * que o OBS vai capturar — a transmissão em si continua capturando a
   * página inteira, sem zoom nenhum.
   */
  + '<button data-zoom="1">Ver no tamanho real</button>';
document.body.append(barra);

/*
 * A barra fica invisível até alguém mexer o mouse.
 *
 * O OBS captura a página sem enviar evento nenhum de ponteiro, então a
 * barra simplesmente não aparece na transmissão — que é o que o requisito
 * de "nenhum controle administrativo no enquadramento" pede. Ela some
 * sozinha depois de três segundos parada, para não ficar no quadro quando
 * você estiver operando a live na mesma máquina.
 */
const mostrarBarra = () => {
  document.body.classList.add('mostrando-demo');
  clearTimeout(mostrarBarra._timer);
  mostrarBarra._timer = setTimeout(() => document.body.classList.remove('mostrando-demo'), 3000);
};
window.addEventListener('mousemove', mostrarBarra, { passive: true });

let contador = 0;

function enfileirar(urnaId, presente) {
  const u = urnas[urnaId];
  contador += 1;
  ator.fila.enfileirar({
    id: `demo-${contador}`,
    urna: u,
    urnaId,
    numero: u.config.numero,
    votos: 1,
    usuario: `Espectador ${contador}`,
    presente,
    prioridade: 0,
  });
}

barra.addEventListener('click', (evento) => {
  const btn = evento.target.closest('button');
  if (!btn) return;
  if (btn.dataset.zoom) {
    const ligado = cenario.alternarZoom();
    btn.textContent = ligado ? 'Voltar ao enquadramento' : 'Ver no tamanho real';
    btn.classList.toggle('demo-barra__botao--ativo', ligado);
    mostrarBarra();
    return;
  }
  if (btn.dataset.rajada) {
    for (let i = 0; i < 12; i++) {
      setTimeout(() => enfileirar(i % 2 ? 'u1' : 'u2', i % 2 ? 'Rosa' : 'Heart Me'), i * 90);
    }
    return;
  }
  enfileirar(btn.dataset.urna, btn.dataset.presente);
});

export { urnas, mao, ator, enfileirar };
