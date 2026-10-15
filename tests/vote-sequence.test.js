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
