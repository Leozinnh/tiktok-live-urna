import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularCaminho, MAO_FORA_DE_CENA, ESCALA_DA_MAO, AtorDaMao } from '../public/js/hand-actor.js';
import { Timeline, Ticker } from '../public/js/anim/timeline.js';
import { POSES, deslocamentoDaPonta } from '../public/js/hand/poses.js';

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
    repousos: 0,
    medirGeometria: () => geometria,
    pressionarTecla(t) { this.teclasPressionadas.push(t); },
    soltarTecla() {},
    acenderLed() {},
    definirTela() {},
    cedulas: [],
    mostrarCedula(dados) { this.cedulas.push(dados); },
    esconderCedula() { this.cedulaEscondida = true; },
    restaurarAoRepouso() { this.repousos++; },
  };
}

/**
 * Leva a fila até o fim, entregando frames à mão.
 *
 * O mesmo laço dos testes de fila: esperar só `pendentes === 0` não basta,
 * porque `proximo()` tira o item de `itens` e o põe em execução no mesmo
 * frame. O estado final é a fila vazia *e* o ator livre.
 */
async function esvaziarFila(ator, ticker) {
  for (let i = 0; i < 400; i++) {
    ticker.avancar(50);
    await proximaVolta();
    if (ator.fila.pendentes === 0 && !ator.ocupado) break;
  }
  await proximaVolta();
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

test('a ponta do dedo para exatamente no alvo, sem folga', () => {
  // O ator subtraía 40px de todo alvo, para o dedo não tapar a tecla. Mas a
  // pose `pressionando` também é um alvo, então o dedo parava no ar enquanto
  // a tecla afundava embaixo dele. Quem sabe a que altura a mão paira é a
  // coreografia, que tem uma posição para pairar e outra para encostar: o
  // ator entrega o ponto que lhe pedem, sem corrigir por conta própria.
  const { ator } = montarAtor();
  const t = new Timeline();
  t.play();
  ator.moverPara({ alvo: { x: 700, y: 900 }, duracao: 100, timeline: t });
  for (let i = 0; i < 4; i++) t.tick(50);

  assert.ok(Math.abs(ator.posicao.x - 700) < 0.01, `o x errou por ${ator.posicao.x - 700}`);
  assert.ok(Math.abs(ator.posicao.y - 900) < 0.01, `o y errou por ${ator.posicao.y - 900}`);
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

test('uma falha ao encerrar o voto não trava o ator para sempre', async () => {
  /*
   * O teste acima força a falha na MONTAGEM da sequência, onde o erro cai
   * dentro do executor da promessa e vira rejeição. A falha que importa é a
   * outra: o encerramento. O `resolve()` era a última linha do callback de
   * `aoTerminar`, e `Timeline` engole o que sai de lá (linha 109) — então um
   * erro em `recolher()` deixava a promessa pendente para sempre, o
   * `.finally` do laço nunca rodava e `this.ocupado` ficava `true`. A partir
   * daí o passo do ator saía cedo em todo frame. A fila morria em silêncio,
   * sem erro na tela e sem nada para o operador ver além de uma live que
   * parou de reagir.
   *
   * O gatilho é realista: um resize do OBS que remonta o palco troca os
   * elementos da mão, e `recolher()` escreve neles.
   */
  const { ator, render, ticker } = montarAtor();
  const geometria = {
    teclas: { '2': { centro: { x: 700, y: 900 } }, CONFIRMA: { centro: { x: 820, y: 1120 } } },
    slot: { centro: { x: 540, y: 620 } },
  };
  const urna = urnaFalsa(geometria);

  const aplicarOriginal = render.aplicarPose.bind(render);
  render.aplicarPose = (pose) => {
    if (pose === POSES.repouso) throw new Error('o palco foi remontado');
    aplicarOriginal(pose);
  };

  ator.fila.enfileirar({ id: 'a', urna, numero: '2', votos: 1 });
  ator.fila.enfileirar({ id: 'b', urna, numero: '2', votos: 1 });
  ator.iniciar();

  const erroOriginal = console.error;
  console.error = () => {};
  try {
    await esvaziarFila(ator, ticker);
  } finally {
    console.error = erroOriginal;
  }

  assert.equal(ator.ocupado, false, 'o ator ficou ocupado para sempre depois da falha');
  assert.deepEqual(urna.teclasPressionadas, ['2', 'CONFIRMA', '2', 'CONFIRMA'],
    'o voto seguinte não animou depois da falha no encerramento do primeiro');
});

test('ao encerrar o voto o ator pede que a urna volte ao repouso', async () => {
  /*
   * O encerramento removia quatro classes na mão, escritas aqui dentro, e
   * mais nada: a tecla que estava afundada continuava afundada e o LED do
   * CONFIRMA continuava aceso. Quem sabe o que é "estado a limpar" é a urna,
   * não o ator — uma classe nova entra na urna e o ator não fica sabendo.
   */
  const { ator, ticker } = montarAtor();
  const geometria = {
    teclas: { '2': { centro: { x: 700, y: 900 } }, CONFIRMA: { centro: { x: 820, y: 1120 } } },
    slot: { centro: { x: 540, y: 620 } },
  };
  const urna = urnaFalsa(geometria);

  ator.fila.enfileirar({ id: 'a', urna, numero: '2', votos: 1 });
  ator.iniciar();
  await esvaziarFila(ator, ticker);

  assert.equal(urna.repousos, 1, 'a urna não foi devolvida ao repouso depois do voto');
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

  ator.fila.enfileirar({ id: 'x', urna, numero: '2', votos: 1, usuario: 'João', presente: 'Rosa' });
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

  // O voto que sai na cédula é o voto que foi enfileirado — sem isso a
  // cédula impressa poderia trazer o presente de outro espectador.
  assert.deepEqual(urna.cedulas, [{ usuario: 'João', presente: 'Rosa', votos: 1 }],
    'a cédula não foi impressa com os dados do voto');
  assert.ok(urna.cedulaEscondida, 'a cédula ficou visível depois de contabilizada');
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

test('o ator desloca a âncora para a ponta DESENHADA cair no alvo', () => {
  /*
   * `posicao` é onde a ponta do dedo deve estar; o que se escreve no DOM é
   * a âncora, e as duas não são o mesmo ponto — a flexão da pose encurta o
   * dedo, e sob `pressionando` a diferença passa de 40 unidades do viewBox.
   * O ator subtrai esse deslocamento para o dedo desenhado parar no alvo.
   * Sem isso o dedo aperta o ar ao lado da tecla: o portão visual mediu 30
   * frames seguidos de tecla afundada com a ponta desenhada fora dela.
   */
  const { ator, render } = montarAtor();
  const t = new Timeline();
  t.play();
  ator.moverPara({ alvo: { x: 700, y: 900 }, pose: 'pressionando', duracao: 100, timeline: t });
  for (let i = 0; i < 4; i++) t.tick(50);

  const desvio = deslocamentoDaPonta(POSES.pressionando);
  const ultima = render.posicoes.at(-1);
  assert.ok(Math.abs(ultima.x - (700 - desvio.x * ESCALA_DA_MAO)) < 0.01,
    `a âncora foi escrita em x=${ultima.x}, esperado ${700 - desvio.x * ESCALA_DA_MAO}`);
  assert.ok(Math.abs(ultima.y - (900 - desvio.y * ESCALA_DA_MAO)) < 0.01,
    `a âncora foi escrita em y=${ultima.y}, esperado ${900 - desvio.y * ESCALA_DA_MAO}`);

  // E o que importa: a ponta, essa sim, chegou ao alvo.
  assert.ok(Math.abs(ator.posicao.x - 700) < 0.01 && Math.abs(ator.posicao.y - 900) < 0.01,
    `a ponta parou em ${JSON.stringify(ator.posicao)}`);
});
