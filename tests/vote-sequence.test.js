import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timeline } from '../public/js/anim/timeline.js';
import { construirSequenciaDeVoto, FASES } from '../public/js/vote-sequence.js';

const geometria = {
  teclas: {
    // O '0' precisa estar aqui: o teste de três dígitos usa o número '210',
    // e uma tecla fora da geometria é pulada — sem ela, os dois números
    // durariam exatamente o mesmo e o teste mediria a si mesmo.
    '2': { centro: { x: 700, y: 900 } },
    '1': { centro: { x: 640, y: 900 } },
    '0': { centro: { x: 580, y: 990 } },
    CONFIRMA: { centro: { x: 820, y: 1120 } },
  },
  slot: { centro: { x: 540, y: 620 } },
  tela: { centro: { x: 300, y: 760 } },
  corpo: { centro: { x: 540, y: 900 } },
};

/**
 * Os dígitos que a mão realmente digitou, sem o CONFIRMA.
 *
 * CONFIRMA também é uma tecla e também produz `teclar:`, então um filtro
 * que só olha o prefixo mistura "o último dígito do número" com "a tecla
 * de confirmação" e as duas afirmações passam a apontar para o mesmo
 * evento. O filtro explícito é o que separa as duas coisas.
 */
const digitosTeclados = (eventos) =>
  eventos
    .filter((e) => e.startsWith('teclar:') && e !== 'teclar:CONFIRMA')
    .map((e) => e.split(':')[1]);

function montar(extra = {}) {
  const eventos = [];
  const timeline = new Timeline();
  construirSequenciaDeVoto({
    geometria,
    numero: '21',
    votos: 1,
    timeline,
    callbacks: {
      aoDestacar: () => eventos.push('destacar'),
      // `aoMoverMao` recebe { alvo, pose }: a pose é o que o ator da Task 13
      // interpola, então registrar só a pose perderia o alvo e registrar o
      // objeto inteiro daria "[object Object]". As coordenadas identificam
      // o alvo sem ambiguidade.
      aoMoverMao: ({ alvo }) => eventos.push(`mover:${alvo.x},${alvo.y}`),
      aoTeclar: (t) => eventos.push(`teclar:${t}`),
      aoSoltarTecla: (t) => eventos.push(`soltar:${t}`),
      aoMostrarTela: (e) => eventos.push(`tela:${e.tipo}`),
      aoSairCedula: () => eventos.push('cedula-sai'),
      aoDepositarCedula: () => eventos.push('cedula-entra'),
      aoContar: () => eventos.push('contar'),
    },
    ...extra,
  });
  return { timeline, eventos };
}

/** Roda a timeline inteira em passos de 50ms (o delta máximo do ticker). */
function rodar(timeline, passos = 200) {
  timeline.play();
  for (let i = 0; i < passos; i++) timeline.tick(50);
}

/**
 * Executa a agenda da sequência sem uma timeline de verdade.
 *
 * O que se quer medir é o INSTANTE em que cada passo foi agendado. Uma
 * timeline real só entrega isso quantizado em ticks de 50ms, grosseiro
 * demais para comparar com uma descida de dedo de 80ms — a medida ficaria
 * maior que o fenômeno. Com um dublê que só guarda os itens, o
 * agendamento sai exato.
 */
function agendaDe(numero = '21') {
  const itens = [];
  const timeline = {
    itens,
    chamar(id, { at = 0, fn } = {}) { itens.push({ id, at, fn }); return this; },
    add() { return this; },
  };
  const eventos = [];
  let agora = 0;
  construirSequenciaDeVoto({
    geometria,
    numero,
    votos: 1,
    timeline,
    callbacks: {
      aoMoverMao: (dados) => eventos.push({ tipo: 'mover', at: agora, ...dados }),
      aoTeclar: (t) => eventos.push({ tipo: 'teclar', at: agora, tecla: t }),
      aoSoltarTecla: (t) => eventos.push({ tipo: 'soltar', at: agora, tecla: t }),
      aoDepositarCedula: () => eventos.push({ tipo: 'cedula-entra', at: agora }),
    },
  });
  for (const item of [...itens].sort((a, b) => a.at - b.at)) {
    agora = item.at;
    item.fn?.();
  }
  return eventos;
}

test('a sequência cobre todas as fases obrigatórias', () => {
  const { timeline } = montar();
  assert.ok(timeline.duracao > 3000, `duração curta demais: ${timeline.duracao}`);
  const nomes = FASES.map((f) => f.nome);
  const obrigatorias = [
    'anuncio', 'aproximacao', 'digitacao', 'confirmacao',
    'confirmado', 'cedula', 'deposito', 'contagem', 'retirada',
  ];
  for (const nome of obrigatorias) {
    assert.ok(nomes.includes(nome), `falta a fase ${nome}`);
  }
});

test('um voto de dois dígitos a 1x dura perto dos 4,5s da spec', () => {
  const { timeline } = montar();
  assert.ok(timeline.duracao > 4000 && timeline.duracao < 5200,
    `duração fora da faixa orçada pela spec: ${timeline.duracao}ms`);
});

test('a mão vai para cada dígito do número, na ordem', () => {
  const { timeline, eventos } = montar();
  rodar(timeline);
  assert.deepEqual(digitosTeclados(eventos), ['2', '1']);
});

test('cada tecla pressionada é solta depois', () => {
  const { timeline, eventos } = montar();
  rodar(timeline);

  const teclas = eventos.filter((e) => e.startsWith('teclar:')).map((e) => e.split(':')[1]);
  const soltas = eventos.filter((e) => e.startsWith('soltar:')).map((e) => e.split(':')[1]);
  for (const t of teclas) assert.ok(soltas.includes(t), `a tecla ${t} nunca foi solta`);
});

test('a ordem global é: digitar, confirmar, sair cédula, depositar, contar', () => {
  const { timeline, eventos } = montar();
  rodar(timeline);

  const ultimoDigito = eventos
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.startsWith('teclar:') && e !== 'teclar:CONFIRMA')
    .at(-1).i;
  const confirma = eventos.indexOf('teclar:CONFIRMA');
  const sai = eventos.indexOf('cedula-sai');
  const entra = eventos.indexOf('cedula-entra');
  const conta = eventos.indexOf('contar');

  assert.ok(confirma >= 0, 'o CONFIRMA nunca foi pressionado');
  assert.ok(ultimoDigito < confirma, 'confirmar veio antes de digitar tudo');
  assert.ok(confirma < sai, 'a cédula saiu antes de confirmar');
  assert.ok(sai < entra, 'a cédula entrou antes de sair');
  assert.ok(entra < conta, 'contou antes de depositar');
});

test('a mão mira o slot correto no depósito', () => {
  const { timeline, eventos } = montar();
  rodar(timeline);
  assert.ok(eventos.includes(`mover:${geometria.slot.centro.x},${geometria.slot.centro.y}`),
    'a mão deveria ter ido até o slot');
});

test('a tela passa por digitando e confirmado', () => {
  const { timeline, eventos } = montar();
  rodar(timeline);
  assert.ok(eventos.some((e) => e === 'tela:digitando'));
  assert.ok(eventos.some((e) => e === 'tela:confirmado'));
});

test('a urna é destacada logo no começo', () => {
  const { timeline, eventos } = montar();
  timeline.play();
  timeline.tick(50);
  assert.equal(eventos[0], 'destacar');
});

test('um número de três dígitos dura mais que um de dois', () => {
  const curto = new Timeline();
  construirSequenciaDeVoto({ geometria, numero: '21', votos: 1, timeline: curto, callbacks: {} });
  const longo = new Timeline();
  construirSequenciaDeVoto({ geometria, numero: '210', votos: 1, timeline: longo, callbacks: {} });
  assert.ok(longo.duracao > curto.duracao);
});

test('uma tecla ausente na geometria não quebra a sequência', () => {
  const geoSemUma = { ...geometria, teclas: { '2': geometria.teclas['2'], CONFIRMA: geometria.teclas.CONFIRMA } };
  const timeline = new Timeline();
  assert.doesNotThrow(() => {
    construirSequenciaDeVoto({ geometria: geoSemUma, numero: '21', votos: 1, timeline, callbacks: {} });
    rodar(timeline);
  });
});

test('callbacks ausentes não quebram a sequência', () => {
  const timeline = new Timeline();
  construirSequenciaDeVoto({ geometria, numero: '21', votos: 1, timeline, callbacks: {} });
  assert.doesNotThrow(() => rodar(timeline));
});

test('velocidade 4x conclui a sequência em menos ticks', () => {
  const { timeline } = montar();
  timeline.play();
  timeline.setVelocidade(4);
  let ticks = 0;
  while (!timeline.concluida && ticks < 1000) { timeline.tick(50); ticks++; }
  assert.ok(ticks < 30, `levou ${ticks} ticks a 4x`);
});

test('a sequência nunca deixa a cédula sair antes de a urna confirmar', () => {
  // A ordem já é checada acima pelo índice dos eventos; aqui o que se
  // verifica é que ela sobrevive a um número de um dígito só, em que a
  // fase de digitação tem metade do tamanho.
  const eventos = [];
  const timeline = new Timeline();
  construirSequenciaDeVoto({
    geometria,
    numero: '2',
    votos: 1,
    timeline,
    callbacks: { aoTeclar: (t) => eventos.push(`teclar:${t}`), aoSairCedula: () => eventos.push('cedula-sai') },
  });
  rodar(timeline);
  assert.deepEqual(eventos, ['teclar:2', 'teclar:CONFIRMA', 'cedula-sai']);
});

test('a contagem recebe o número de votos do evento', () => {
  // Um presente de vários votos (combo) precisa que a contagem saiba
  // quantos votos somar — sem isso o placar e o espetáculo divergem.
  const recebidos = [];
  const timeline = new Timeline();
  construirSequenciaDeVoto({
    geometria, numero: '21', votos: 7, timeline,
    callbacks: { aoContar: (dados) => recebidos.push(dados) },
  });
  rodar(timeline);
  assert.equal(recebidos.length, 1);
  assert.equal(recebidos[0].votos, 7);
});

// ------------------------------------------------- o dedo encosta na tecla

test('a tecla só afunda quando a ponta do dedo chega nela', () => {
  /*
   * O defeito que este teste existe para pegar: o ator levava 420ms para
   * percorrer o arco, enquanto a fase que continha o movimento orçava 320.
   * O resultado na transmissão era a tecla afundando — e a tela mostrando
   * o dígito — 244ms ANTES de o dedo chegar, que é o inverso das 17 etapas
   * pedidas. O tempo do percurso agora viaja junto com o alvo, e a tecla
   * afunda no instante em que a descida termina.
   */
  const eventos = agendaDe('21');
  const contatos = eventos.filter((e) => e.tipo === 'teclar' || e.tipo === 'cedula-entra');
  assert.equal(contatos.length, 4, `esperava 3 teclas e 1 depósito: ${contatos.length}`);

  for (const contato of contatos) {
    const chegada = eventos.filter((e) => e.tipo === 'mover' && e.at <= contato.at).at(-1);
    assert.ok(chegada, `nenhum movimento antes de ${contato.tipo}`);
    assert.ok(chegada.duracao > 0,
      `o movimento até ${contato.tipo} não declara quanto dura`);
    const pouso = chegada.at + chegada.duracao;
    assert.ok(contato.at >= pouso,
      `${contato.tipo} disparou ${pouso - contato.at}ms antes de o dedo chegar`);
    assert.ok(contato.at - pouso <= 60,
      `${contato.tipo} disparou ${contato.at - pouso}ms depois de o dedo parar`);
  }
});

test('a mão paira acima da tecla e só então desce até o centro dela', () => {
  /*
   * A pose sozinha não bastava: `pressionando` mudava o formato do dedo,
   * mas a mão continuava 40px acima do alvo, então a tecla afundava com a
   * ponta pairando no ar. Pairar e encostar são duas posições distintas, e
   * as duas precisam existir na coreografia — é a etapa 4 das 17.
   */
  const eventos = agendaDe('21');
  const descidas = eventos.filter(
    (e) => e.tipo === 'mover' && (e.pose === 'pressionando' || e.pose === 'inserindo'));
  assert.equal(descidas.length, 4, `esperava 4 descidas de dedo: ${descidas.length}`);

  // Os únicos pontos que o dedo pode encostar: o centro de uma tecla ou o slot.
  const centros = [...Object.values(geometria.teclas).map((t) => t.centro), geometria.slot.centro];
  const ehCentroConhecido = (alvo) => centros.some(
    (c) => Math.abs(c.x - alvo.x) < 0.5 && Math.abs(c.y - alvo.y) < 0.5);

  for (const desce of descidas) {
    assert.ok(ehCentroConhecido(desce.alvo),
      `a descida mira um ponto que não é tecla nem slot: ${JSON.stringify(desce.alvo)}`);

    const paira = eventos.filter((e) => e.tipo === 'mover' && e.at <= desce.at).at(-2);
    assert.ok(paira, 'a mão desceu sem ter pairado antes');
    assert.equal(paira.alvo.x, desce.alvo.x, 'a mão pairou fora do eixo da tecla');
    assert.ok(paira.alvo.y < desce.alvo.y,
      `a mão já estava sobre a tecla antes de descer: ${paira.alvo.y} vs ${desce.alvo.y}`);
  }
});
