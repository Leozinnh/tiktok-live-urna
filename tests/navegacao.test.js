import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularCaminho, AtorDaMao } from '../public/js/hand-actor.js';
import { Ticker } from '../public/js/anim/timeline.js';

// Geometria aproximada das duas urnas em um palco 1080x1920
const URNA_1 = { x: 300, y: 900 };
const URNA_2 = { x: 780, y: 900 };

test('da urna 1 para a urna 2 o arco passa por cima, não por baixo', () => {
  const p = calcularCaminho(URNA_1, URNA_2, { arco: 80 });
  const meio = p[Math.floor(p.length / 2)];
  assert.ok(meio.y < URNA_1.y, `o arco deveria subir; y=${meio.y}`);
});

test('o trajeto entre as urnas é mais longo que o trajeto curto interno', () => {
  const entreUrnas = calcularCaminho(URNA_1, URNA_2);
  const interno = calcularCaminho({ x: 700, y: 900 }, { x: 760, y: 900 });
  const comprimento = (p) => p.slice(1).reduce((s, pt, i) =>
    s + Math.hypot(pt.x - p[i].x, pt.y - p[i].y), 0);
  assert.ok(comprimento(entreUrnas) > comprimento(interno));
});

test('o caminho nunca sai do palco horizontalmente', () => {
  const p = calcularCaminho(URNA_1, URNA_2, { arco: 120 });
  for (const pt of p) {
    assert.ok(pt.x >= -200 && pt.x <= 1280, `ponto fora do palco: x=${pt.x}`);
  }
});

// ---------------------------------------------------------------------
// A navegação de verdade: dois votos, duas urnas, uma mão.
// ---------------------------------------------------------------------

const GEOM_1 = {
  teclas: { '2': { centro: { x: 400, y: 900 } }, CONFIRMA: { centro: { x: 460, y: 1120 } } },
  slot: { centro: { x: 300, y: 620 } },
};
const GEOM_2 = {
  teclas: { '1': { centro: { x: 900, y: 900 } }, CONFIRMA: { centro: { x: 960, y: 1120 } } },
  slot: { centro: { x: 800, y: 620 } },
};

/** O alvo que `moverPara` calcula a partir do centro medido da tecla. */
const alvoDe = (tecla) => ({ x: tecla.centro.x, y: tecla.centro.y - 40 });

function urnaFalsa(geometria) {
  return {
    el: { classList: { add() {}, remove() {} } },
    config: { nome: 'URNA' },
    medirGeometria: () => geometria,
    pressionarTecla() {}, soltarTecla() {}, acenderLed() {},
    definirTela() {}, mostrarCedula() {}, esconderCedula() {},
    restaurarAoRepouso() {},
  };
}

function renderFalso() {
  return {
    el: {}, sombra: {},
    posicoes: [],
    posicionar(x, y, opcoes = {}) { this.posicoes.push({ x, y, ...opcoes }); },
    aplicarPose() {},
  };
}

/** Roda o ator até a fila esvaziar e ele ficar livre. */
async function esvaziar(ator, ticker, limite = 500) {
  for (let i = 0; i < limite; i++) {
    ticker.avancar(50);
    await new Promise((r) => setImmediate(r));
    if (ator.fila.pendentes === 0 && !ator.ocupado) return;
  }
  throw new Error('a fila não esvaziou');
}

const perto = (p, alvo, tolerancia = 30) =>
  Math.hypot(p.x - alvo.x, p.y - alvo.y) <= tolerancia;

test('a mão vai para a urna de cada voto, não fica na primeira', async () => {
  const render = renderFalso();
  const ticker = new Ticker({ raf: () => 0, agora: () => 0 });
  const ator = new AtorDaMao({ renderizador: render, camada: { append() {} }, opcoes: { ticker } });

  const u1 = urnaFalsa(GEOM_1);
  const u2 = urnaFalsa(GEOM_2);
  const comum = { votos: 1, usuario: 'Ana', presente: 'Rosa' };

  ator.fila.enfileirar({ id: 'a', urna: u1, numero: '2', ...comum });
  ator.fila.enfileirar({ id: 'b', urna: u2, numero: '1', ...comum });
  ator.iniciar();
  await esvaziar(ator, ticker);

  const visitou = (tecla) => render.posicoes.some((p) => perto(p, alvoDe(tecla)));

  assert.ok(visitou(GEOM_1.teclas.CONFIRMA), 'a mão não chegou ao CONFIRMA da urna 1');
  assert.ok(visitou(GEOM_2.teclas.CONFIRMA), 'a mão não chegou ao CONFIRMA da urna 2');
  assert.ok(visitou(GEOM_1.slot), 'a urna 1 não recebeu a cédula');
  assert.ok(visitou(GEOM_2.slot), 'a urna 2 não recebeu a cédula');
});

test('a mão fica recolhida entre um voto e outro', async () => {
  const render = renderFalso();
  const ticker = new Ticker({ raf: () => 0, agora: () => 0 });
  const ator = new AtorDaMao({ renderizador: render, camada: { append() {} }, opcoes: { ticker } });

  ator.fila.enfileirar({ id: 'a', urna: urnaFalsa(GEOM_1), numero: '2', votos: 1 });
  ator.iniciar();
  await esvaziar(ator, ticker);

  assert.deepEqual(ator.posicao, { x: 540, y: 2000 }, 'a mão não se retirou ao fim do voto');
});
