import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escolherUrna, criarReservaDeUrnas } from '../public/js/urnas-livres.js';

/*
 * A urna é uma MÁQUINA, e não um candidato.
 *
 * O defeito que o Leonardo viu na live: dois espectadores mandam o presente
 * do 13 no mesmo segundo, e as duas mãos vão para a mesma urna — a do Lula.
 * Uma fica ao lado da outra, uma delas sem ter onde digitar, e a outra urna
 * parada no enquadramento. A causa era o voto sair da fila já com a urna
 * dentro: quem escolhia era quem ENFILEIRAVA, e no instante em que o segundo
 * presente entrava a primeira urna ainda não estava ocupada.
 *
 * Aqui a escolha é uma função de verdade, e ela roda na hora de trabalhar —
 * quando já se sabe quais máquinas estão livres.
 */

/** Uma urna de mentira: só o que a escolha enxerga. */
const urna = (id, numero) => ({ config: { id, numero } });
const U1 = urna('u1', '22');
const U2 = urna('u2', '13');

test('o voto vai para a urna do próprio candidato quando ela está livre', () => {
  assert.equal(escolherUrna('13', [U1, U2]), U2);
  assert.equal(escolherUrna('22', [U1, U2]), U1);
});

test('com a urna do candidato ocupada, o voto usa a outra máquina', () => {
  /*
   * É o caso do Leonardo, no osso: a segunda rosa do 13 não pode esperar a
   * urna do Lula ficar livre — ela vai para a urna que estiver desocupada.
   * Na frente da câmera isso é a diferença entre duas pessoas votando ao
   * mesmo tempo e duas pessoas esperando a vez.
   */
  assert.equal(escolherUrna('13', [U1]), U1);
});

test('sem máquina livre a escolha não inventa uma', () => {
  // Devolver uma urna ocupada seria pior do que não devolver nada: as duas
  // mãos digitariam por cima uma da outra na mesma tecla.
  assert.equal(escolherUrna('13', []), null);
});

test('a escolha não mexe na lista que recebeu', () => {
  // A lista vem de fora e continua sendo de quem a montou; se a escolha
  // ordenasse ou tirasse dela, a chamada seguinte veria outra lista.
  const livres = [U1, U2];
  escolherUrna('13', livres);
  assert.deepEqual(livres, [U1, U2]);
});

test('a máquina não é entregue duas vezes na mesma leva', () => {
  const reserva = criarReservaDeUrnas([U1, U2]);
  assert.equal(reserva.pegar({ numero: '13' }), U2);
  assert.equal(reserva.pegar({ numero: '13' }), U1, 'a segunda rosa pegou a urna do Lula de novo');
});

test('a máquina volta para a reserva quando o voto acaba', () => {
  const reserva = criarReservaDeUrnas([U1, U2]);
  const primeira = reserva.pegar({ numero: '13' });
  reserva.devolver(primeira);
  assert.equal(reserva.pegar({ numero: '13' }), primeira, 'a urna devolvida não voltou a ser oferecida');
});

test('esgotadas as máquinas, a reserva não entrega nenhuma', () => {
  const reserva = criarReservaDeUrnas([U1, U2]);
  reserva.pegar({ numero: '13' });
  reserva.pegar({ numero: '22' });
  assert.equal(reserva.pegar({ numero: '13' }), null);
  assert.deepEqual(reserva.livres(), []);
});

test('devolver uma urna que não estava reservada não abre vaga', () => {
  /*
   * Duas devoluções do mesmo voto — o `finally` do ator e o do watchdog —
   * não podem liberar uma vaga a mais e deixar uma terceira mão entrar em
   * uma urna que já tem gente dentro.
   */
  const reserva = criarReservaDeUrnas([U1, U2]);
  reserva.devolver(U1);
  assert.deepEqual(reserva.livres(), [U1, U2]);
});
