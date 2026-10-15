/**
 * Ponto de entrada da página de demonstração.
 *
 * Por enquanto monta o cenário e as duas urnas. A mão e a coreografia
 * entram nas tarefas seguintes, sempre por cima desta mesma cena.
 */

import { montarCenario } from './scene.js';
import { criarUrna } from './urna.js';

export const cena = montarCenario(document.getElementById('cena'));

export const urnas = [
  criarUrna({ id: 'u1', x: 60,  y: 30, rot: -8, corPrimaria: '#1a5fd0' }),
  criarUrna({ id: 'u2', x: 580, y: 30, rot:  8, corPrimaria: '#e02020' }),
];

cena.camadaUrnas.append(...urnas.map((u) => u.el));

// Estado de demonstração enquanto o motor de votos não existe (Etapa 4).
const [u1, u2] = urnas;
u1.definirTela({ tipo: 'ocioso', numero: '22', nome: 'URNA 1', votos: 61 });
u2.definirTela({ tipo: 'digitando', numero: '13', nome: 'URNA 2', numeroDigitado: '1' });

// Relevo e pressão das teclas, para conferência visual.
u1.pressionarTecla('5');
u1.acenderLed('5', true);
u2.acenderLed('CONFIRMA', true);
