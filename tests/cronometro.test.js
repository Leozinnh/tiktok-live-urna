import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatarTempo, segundosRestantes, estadoDoCronometro, markupCronometro, criarRelogio,
} from '../public/js/cronometro.js';

/*
 * O cronômetro é o primeiro número do enquadramento, e é lido de longe por
 * quem assiste. Um "1:5" no lugar de "01:05" não é detalhe de estilo: os
 * dígitos dançam de largura a cada segundo e o olho perde a referência.
 */
test('o tempo sai sempre com dois dígitos em cada casa', () => {
  assert.equal(formatarTempo(0), '00:00');
  assert.equal(formatarTempo(9), '00:09');
  assert.equal(formatarTempo(41), '00:41');
  assert.equal(formatarTempo(65), '01:05');
  assert.equal(formatarTempo(605), '10:05');
});

test('passando de uma hora os minutos continuam contando', () => {
  // "01:00:00" seria mais correto e pior de ler num enquadramento vertical:
  // a live tem uma rodada, não um relógio de ponto.
  assert.equal(formatarTempo(3600), '60:00');
  assert.equal(formatarTempo(3725), '62:05');
});

test('tempo negativo vira zero em vez de "-1:-5"', () => {
  assert.equal(formatarTempo(-1), '00:00');
  assert.equal(formatarTempo(-999), '00:00');
});

test('segundos quebrados não produzem centésimos no visor', () => {
  assert.equal(formatarTempo(41.7), '00:41');
});

test('o que sobra é a duração menos o que já passou, e nunca abaixo de zero', () => {
  assert.equal(segundosRestantes(600, 0), 600);
  assert.equal(segundosRestantes(600, 559), 41);
  assert.equal(segundosRestantes(600, 600), 0);
  assert.equal(segundosRestantes(600, 900), 0);
});

test('o estado do cronômetro diz o texto e se a rodada acabou', () => {
  /*
   * O fim da rodada é um acontecimento, não um número: quem escuta precisa
   * de um sinal que dispare UMA vez, e não de comparar "restante === 0" a
   * cada tique — a primeira comparação verdadeira seria seguida de infinitas
   * outras, e o fim da rodada aconteceria sessenta vezes por segundo.
   */
  const comecando = estadoDoCronometro(600, 0);
  assert.deepEqual(comecando, { restante: 600, texto: '10:00', acabou: false });

  const quase = estadoDoCronometro(600, 559);
  assert.deepEqual(quase, { restante: 41, texto: '00:41', acabou: false });

  assert.deepEqual(estadoDoCronometro(600, 600),
    { restante: 0, texto: '00:00', acabou: true });
  assert.deepEqual(estadoDoCronometro(600, 601),
    { restante: 0, texto: '00:00', acabou: true },
    'depois do fim o cronômetro fica em zero em vez de contar para trás');
});

test('o cronômetro é desenhado com o tempo e um gancho para o tique', () => {
  const html = markupCronometro(41);
  assert.match(html, /00:41/);
  // O gancho é o que o tique procura a cada segundo. Sem ele, o relógio
  // teria que redesenhar o bloco inteiro sessenta vezes por minuto.
  assert.match(html, /data-cronometro/);
});

/*
 * O relógio em si, com o tempo injetado.
 *
 * Sem poder mexer no relógio da máquina, um teste de contagem regressiva
 * levaria cinco minutos, ou dormiria — e um teste que dorme é um teste que
 * mente sobre quanto tempo o projeto leva. Aqui `agora` é uma função, e o
 * teste avança as horas quando quiser.
 */
function relogioDeTeste(opcoes) {
  let agora = 0;
  const r = criarRelogio({ agora: () => agora, ...opcoes });
  return { ...r, avancar: (s) => { agora += s * 1000; return r.tique(); } };
}

test('o relógio conta para trás a partir da duração', () => {
  const r = relogioDeTeste({ duracao: 300 });
  r.comecar();
  assert.equal(r.estado().texto, '05:00');
  assert.equal(r.avancar(60).texto, '04:00');
  assert.equal(r.avancar(240).texto, '00:00');
});

test('o fim da rodada é avisado uma vez só', () => {
  // Se o aviso saísse a cada tique depois do zero, o encerramento da
  // rodada aconteceria sessenta vezes por segundo.
  let avisos = 0;
  const r = relogioDeTeste({ duracao: 10, aoTerminar: () => { avisos += 1; } });
  r.comecar();
  r.avancar(9);
  assert.equal(avisos, 0, 'avisou antes do tempo acabar');
  r.avancar(1);
  assert.equal(avisos, 1);
  r.avancar(1);
  r.avancar(30);
  assert.equal(avisos, 1, 'o fim da rodada foi anunciado mais de uma vez');
});

test('uma rodada nova pode ter outro tempo', () => {
  /*
   * O cronômetro é reaproveitado entre rodadas. Se ele guardasse a duração
   * da primeira, a segunda rodada — de outro tempo — contaria errado, e o
   * erro só apareceria ao vivo, na segunda rodada da noite.
   */
  const r = relogioDeTeste({ duracao: 300 });
  r.comecar();
  r.avancar(100);
  assert.equal(r.estado().texto, '03:20');

  r.comecar(60);
  assert.equal(r.estado().texto, '01:00', 'a rodada nova não adotou o tempo dela');
  assert.equal(r.avancar(59).texto, '00:01');
});

test('relógio parado não conta nem avisa o fim', () => {
  let avisou = false;
  const r = relogioDeTeste({ duracao: 10, aoTerminar: () => { avisou = true; } });
  r.comecar();
  r.parar();
  r.avancar(60);
  assert.equal(avisou, false, 'um relógio parado anunciou o fim da rodada');
  assert.equal(r.parado, true);
});
