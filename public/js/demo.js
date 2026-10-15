/**
 * Ponto de entrada da página de demonstração.
 *
 * Por enquanto só monta o cenário. As urnas, a mão e a coreografia
 * entram nas tarefas seguintes, sempre por cima desta mesma cena.
 */

import { montarCenario } from './scene.js';

export const cena = montarCenario(document.getElementById('cena'));
