/**
 * Ponto de entrada da página de demonstração.
 *
 * Monta o cenário, as duas urnas e a mão, e liga os controles que
 * enfileiram votos — o mesmo caminho que um presente real vai percorrer
 * na Etapa 7. O que muda é só a origem do evento.
 */

import { montarCenario } from './scene.js';
import { criarUrna } from './urna.js';
import { criarMaoSvg } from './hand/hand-svg.js';
import { AtorDaMao } from './hand-actor.js';

const { camadaUrnas, camadaMao } = montarCenario(document.getElementById('cena'));

// Posições em coordenadas do palco (1080x1920). As urnas convergem
// levemente para o centro, o que reforça a perspectiva da cena.
const CONFIG_URNAS = [
  { id: 'u1', x: 60,  y: 30, rot: -7, nome: 'URNA 1', numero: '22',
    corPrimaria: '#1a5fd0', corSecundaria: '#0d3a8f' },
  { id: 'u2', x: 580, y: 30, rot:  7, nome: 'URNA 2', numero: '13',
    corPrimaria: '#e02020', corSecundaria: '#8f0d0d' },
];

const urnas = {};
for (const cfg of CONFIG_URNAS) {
  const u = criarUrna(cfg);
  u.definirTela({ tipo: 'ocioso', numero: cfg.numero, nome: cfg.nome, votos: 0 });
  camadaUrnas.append(u.el);
  urnas[cfg.id] = u;
}

const mao = criarMaoSvg();
const ator = new AtorDaMao({ renderizador: mao, camada: camadaMao });
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
  .join('') + '<button data-rajada="1">Rajada de 12</button>';
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
  if (btn.dataset.rajada) {
    for (let i = 0; i < 12; i++) {
      setTimeout(() => enfileirar(i % 2 ? 'u1' : 'u2', i % 2 ? 'Rosa' : 'Heart Me'), i * 90);
    }
    return;
  }
  enfileirar(btn.dataset.urna, btn.dataset.presente);
});

export { urnas, mao, ator, enfileirar };
