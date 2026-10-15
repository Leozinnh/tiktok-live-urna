import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularCaminho, MAO_FORA_DE_CENA, AtorDaMao } from '../public/js/hand-actor.js';
import { Timeline, Ticker } from '../public/js/anim/timeline.js';

// ---------------------------------------------------------------- caminho

test('o caminho parte da origem e termina no alvo', () => {
  const p = calcularCaminho({ x: 540, y: 1500 }, { x: 700, y: 900 }, { arco: 90 });
  assert.deepEqual(p[0], { x: 540, y: 1500 });
  const fim = p.at(-1);
  assert.ok(Math.abs(fim.x - 700) < 0.01);
  assert.ok(Math.abs(fim.y - 900) < 0.01);
});

test('o caminho faz arco — o ponto médio sai da reta', () => {
  const reto = calcularCaminho({ x: 0, y: 0 }, { x: 100, y: 0 }, { arco: 0 });
  const curvo = calcularCaminho({ x: 0, y: 0 }, { x: 100, y: 0 }, { arco: 80 });
  const meioReto = reto[Math.floor(reto.length / 2)];
  const meioCurvo = curvo[Math.floor(curvo.length / 2)];
  assert.ok(meioCurvo.y < meioReto.y - 20, 'o arco deveria levantar a mão');
});

test('o caminho tem pelo menos 12 amostras para o movimento ser suave', () => {
  const p = calcularCaminho({ x: 0, y: 0 }, { x: 400, y: 400 }, { arco: 60 });
  assert.ok(p.length >= 12, `poucas amostras: ${p.length}`);
});

test('mover para o mesmo ponto devolve um caminho válido', () => {
  const p = calcularCaminho({ x: 100, y: 100 }, { x: 100, y: 100 }, { arco: 50 });
  assert.ok(p.length >= 12);
  assert.deepEqual(p.at(-1), { x: 100, y: 100 });
});

test('MAO_FORA_DE_CENA fica abaixo do palco', () => {
  assert.ok(MAO_FORA_DE_CENA.y > 1920, 'a mão deveria ficar fora do palco quando recolhida');
});

// ------------------------------------------------------------------- ator

/** Um renderizador de mentira: registra o que foi pedido, sem tocar no DOM. */
function renderFalso() {
  return {
    el: { id: 'el' },
    sombra: { id: 'sombra' },
    posicoes: [],
    poses: [],
    posicionar(x, y, opcoes = {}) { this.posicoes.push({ x, y, ...opcoes }); },
    aplicarPose(pose) { this.poses.push(pose); },
  };
}

/** Uma urna de mentira com a mesma interface que o ator consome. */
function urnaFalsa(geometria = { teclas: {}, slot: null }) {
  return {
    el: { classList: { add() {}, remove() {} } },
    config: { nome: 'URNA X' },
    teclasPressionadas: [],
    contados: 0,
    medirGeometria: () => geometria,
    pressionarTecla(t) { this.teclasPressionadas.push(t); },
    soltarTecla() {},
    acenderLed() {},
    definirTela() {},
  };
}

function montarAtor(opcoes = {}) {
  const render = renderFalso();
  const camada = { append() {} };
  // O ticker de teste não agenda RAF nenhum: os frames são entregues à mão
  // por avancar(), que é exatamente o que o Ticker já expõe para isto.
  const ticker = new Ticker({ raf: () => 0, agora: () => 0 });
  const ator = new AtorDaMao({ renderizador: render, camada, opcoes: { ticker, ...opcoes } });
  return { ator, render, ticker };
}

const proximaVolta = () => new Promise((r) => setImmediate(r));

test('o ator começa com a mão fora de cena', () => {
  const { ator } = montarAtor();
  assert.deepEqual(ator.posicao, MAO_FORA_DE_CENA);
});

test('recolher devolve a mão para fora de cena', () => {
  const { ator } = montarAtor();
  ator.moverPara({ alvo: { x: 700, y: 900 }, timeline: new Timeline() });
  ator.recolher();
  assert.deepEqual(ator.posicao, MAO_FORA_DE_CENA);
});

test('um percurso disparado no meio do tick não teleporta a mão', () => {
  // Este é o defeito que o tween ancorado em zero produz: o percurso nasce
  // com `at: 0` e duração curta, o primeiro tick já o encontra vencido, e a
  // mão aparece colada no alvo em vez de percorrer o arco.
  const { ator } = montarAtor();
  const t = new Timeline();
  t.chamar('vai', {
    at: 0,
    fn: () => ator.moverPara({ alvo: { x: 900, y: 1400 }, duracao: 40, timeline: t }),
  });
  t.play();
  t.tick(50);

  const d = Math.hypot(ator.posicao.x - MAO_FORA_DE_CENA.x, ator.posicao.y - MAO_FORA_DE_CENA.y);
  assert.ok(d < 60, `a mão saltou ${Math.round(d)}px no primeiro frame`);
});

test('dois percursos na mesma timeline não disputam a posição', () => {
  // Com id fixo, o segundo percurso sobrescreve o primeiro e os dois passam
  // a escrever a posição da mão no mesmo frame.
  const { ator } = montarAtor();
  const t = new Timeline();
  ator.moverPara({ alvo: { x: 700, y: 900 }, timeline: t });
  ator.moverPara({ alvo: { x: 800, y: 1000 }, timeline: t });

  const percursos = t.itens.filter((i) => String(i.id).startsWith('percurso-'));
  assert.equal(percursos.length, 2);
  assert.notEqual(percursos[0].id, percursos[1].id);
});

test('a mão levanta no meio do trajeto e a sombra acompanha', () => {
  const { ator, render } = montarAtor();
  const t = new Timeline();
  t.play();
  ator.moverPara({ alvo: { x: 900, y: 900 }, duracao: 400, timeline: t });
  for (let i = 0; i < 4; i++) t.tick(50);   // metade do trajeto

  const alturas = render.posicoes.map((p) => p.altura ?? 0);
  assert.ok(Math.max(...alturas) > 30, `a mão não levantou: ${Math.max(...alturas)}`);
  assert.ok(render.poses.length > 0, 'a pose nunca foi aplicada durante o percurso');
});

test('a fila não trava quando uma animação falha', async () => {
  const { ator, ticker } = montarAtor();
  const geometria = { teclas: { '2': { centro: { x: 700, y: 900 } } }, slot: null };
  const quebrada = { el: { classList: { add() {}, remove() {} } }, config: { nome: 'X' } };  // sem medirGeometria
  const boa = urnaFalsa(geometria);

  ator.fila.enfileirar({ id: 'a', urna: quebrada, numero: '2', votos: 1 });
  ator.fila.enfileirar({ id: 'b', urna: boa, numero: '2', votos: 1 });
  ator.iniciar();

  const erroOriginal = console.error;
  console.error = () => {};
  try {
    // Esperar só a fila esvaziar não basta: `proximo()` tira o item de
    // `itens` e o põe em `rodando` no mesmo frame, então `pendentes` chega
    // a zero com o voto ainda animando. O estado final é a fila vazia
    // *e* o ator livre.
    for (let i = 0; i < 400; i++) {
      ticker.avancar(50);
      await proximaVolta();
      if (ator.fila.pendentes === 0 && !ator.ocupado) break;
    }
    await proximaVolta();
  } finally {
    console.error = erroOriginal;
  }

  assert.deepEqual(boa.teclasPressionadas, ['2'], 'o voto seguinte ficou preso atrás do que falhou');
  assert.equal(ator.ocupado, false, 'a fila ficou marcada como ocupada para sempre');
  assert.equal(ator.fila.pendentes, 0);
});

test('um voto enfileirado é contado na urna certa', async () => {
  const geometria = {
    teclas: { '2': { centro: { x: 700, y: 900 } }, CONFIRMA: { centro: { x: 820, y: 1120 } } },
    slot: { centro: { x: 540, y: 620 } },
  };
  const { ator, ticker } = montarAtor();
  const urna = urnaFalsa(geometria);

  let contados = 0;
  const original = ator.executarVoto.bind(ator);
  ator.executarVoto = (item) => {
    contados++;
    return original(item);
  };

  ator.fila.enfileirar({ id: 'x', urna, numero: '2', votos: 1 });
  ator.iniciar();

  for (let i = 0; i < 300 && contados === 0; i++) {
    ticker.avancar(50);
    await proximaVolta();
  }
  for (let i = 0; i < 400 && ator.ocupado; i++) {
    ticker.avancar(50);
    await proximaVolta();
  }

  assert.equal(contados, 1);
  assert.deepEqual(urna.teclasPressionadas, ['2', 'CONFIRMA']);
  assert.equal(ator.ocupado, false);
});

test('remedir invalida a geometria guardada', () => {
  const { ator } = montarAtor();
  const geometria = { teclas: {}, slot: null };
  let medidas = 0;
  const urna = { ...urnaFalsa(), medirGeometria: () => { medidas++; return geometria; } };

  ator.geometriaDe(urna);
  ator.geometriaDe(urna);
  assert.equal(medidas, 1, 'a geometria foi medida de novo sem necessidade');

  ator.remedir();
  ator.geometriaDe(urna);
  assert.equal(medidas, 2, 'remedir não invalidou o cache');
});
