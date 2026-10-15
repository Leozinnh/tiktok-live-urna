/**
 * Ponto de entrada da página de demonstração.
 *
 * Monta o cenário, as duas urnas e a mão, e liga dois botões que
 * enfileiram votos — o mesmo caminho que um presente real vai percorrer
 * na Etapa 7. O que muda é só a origem do evento.
 */

import { montarCenario } from './scene.js';
import { criarUrna } from './urna.js';
import { criarMaoSvg } from './hand/hand-svg.js';
import { AtorDaMao } from './hand-actor.js';

export const cena = montarCenario(document.getElementById('cena'));

export const urnas = {
  u1: criarUrna({ id: 'u1', x: 60,  y: 30, rot: -8, corPrimaria: '#1a5fd0', corSecundaria: '#0d3a8f', nome: 'URNA 1' }),
  u2: criarUrna({ id: 'u2', x: 580, y: 30, rot:  8, corPrimaria: '#e02020', corSecundaria: '#8f0d0d', nome: 'URNA 2' }),
};

for (const urna of Object.values(urnas)) {
  cena.camadaUrnas.append(urna.el);
  urna.definirTela({
    tipo: 'ocioso',
    numero: urna.config.id === 'u1' ? '22' : '13',
    nome: urna.config.nome,
    votos: 0,
  });
}

export const mao = criarMaoSvg();
export const ator = new AtorDaMao({ renderizador: mao, camada: cena.camadaMao });
ator.iniciar();

// Controles de demonstração — somem quando o modo de teste real chegar.
const barra = document.createElement('div');
barra.className = 'demo-barra';
barra.innerHTML = `
  <button data-votar="u1">Rosa na Urna 1</button>
  <button data-votar="u2">Heart Me na Urna 2</button>`;
document.body.append(barra);

barra.addEventListener('click', (evento) => {
  const id = evento.target.dataset.votar;
  if (!id) return;
  const urna = urnas[id];
  ator.fila.enfileirar({
    id: `demo-${performance.now()}`,
    urna,
    urnaId: id,
    numero: id === 'u1' ? '22' : '13',
    votos: 1,
    prioridade: 0,
  });
});
