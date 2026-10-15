/*
 * A equipe de mãos.
 *
 * O que estes testes prendem é a partilha: uma fila para todas, um ticker
 * para todas, e — o detalhe que só se vê quando quebra — UM único avanço da
 * fila por quadro, mesmo com duas mãos registradas.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { criarEquipeDeMaos, MAOS_PADRAO } from '../public/js/hand-team.js';
import { Ticker } from '../public/js/anim/timeline.js';

/*
 * O ticker sem navegador.
 *
 * O ator chama `ticker.iniciar()` ao nascer, e `iniciar` pede um
 * `requestAnimationFrame` de verdade. Aqui o quadro é dirigido à mão por
 * `ticker.avancar(delta)` — que é exatamente por isso que ele é separado do
 * laço de RAF (ver o comentário em timeline.js).
 */
const tickerFalso = () => new Ticker({ raf: () => 0, agora: () => 0 });

/** A camada mínima que o ator usa: ele só faz `append` nela. */
const camadaFalsa = () => ({ filhos: [], append(...nos) { this.filhos.push(...nos); } });

/** Um renderizador de mentira, com a interface que o ator consome. */
const renderFalso = () => ({
  el: { tipo: 'mao' },
  sombra: { tipo: 'sombra' },
  badge: { tipo: 'badge' },
  posicionar() {},
  aplicarPose() {},
  mostrarBadge() {},
  esconderBadge() {},
});

const equipeDe = (n, opcoes = {}) => criarEquipeDeMaos({
  camada: camadaFalsa(),
  quantidade: n,
  criarRenderizador: renderFalso,
  opcoes: { ticker: tickerFalso(), ...opcoes },
});

const URNA = {
  config: { id: 'u1', corPrimaria: '#1a5fd0' },
  medirGeometria: () => ({ teclas: {} }),
  el: { classList: { add() {}, remove() {} } },
  pressionarTecla() {}, soltarTecla() {}, acenderLed() {},
  definirTela() {}, mostrarCedula() {}, esconderCedula() {},
  restaurarAoRepouso() {},
};

const item = (id) => ({ id, urna: URNA, urnaId: 'u1', numero: '22', votos: 1, usuario: `p${id}` });

test('a equipe monta a quantidade de mãos pedida', () => {
  assert.equal(equipeDe(2).maos, 2);
  assert.equal(equipeDe(3).maos, 3);
});

test('o padrão do projeto são duas mãos, uma por urna', () => {
  assert.equal(MAOS_PADRAO, 2);
  assert.equal(equipeDe(MAOS_PADRAO).maos, 2);
});

test('todas as mãos compartilham a MESMA fila', () => {
  const equipe = equipeDe(2);
  assert.equal(equipe.atores[0].fila, equipe.atores[1].fila);
  assert.equal(equipe.atores[0].fila, equipe.fila);
});

test('todas as mãos compartilham o MESMO ticker', () => {
  const equipe = equipeDe(2);
  assert.equal(equipe.atores[0].ticker, equipe.atores[1].ticker);
  assert.equal(equipe.atores[0].ticker, equipe.ticker);
});

/*
 * O teste que justifica o `tickDaFila: false`.
 *
 * Se cada mão avançasse a fila, o watchdog — que acumula tempo virtual
 * contra um limite fixo — contaria o dobro e daria por travado um voto que
 * ainda está animando. Aqui a fila é avançada à mão, um quadro por vez, e o
 * prazo tem que continuar valendo o que vale para uma mão só.
 */
test('a fila é avançada UMA vez por quadro, e não uma por mão', () => {
  const equipe = equipeDe(3);
  equipe.iniciar();

  equipe.enfileirar(item('a'));
  equipe.atores[0].fila.proximo();   // uma animação em andamento

  // Metade do prazo do watchdog: 2 × 4500 são 9000, então 4000 não libera.
  const { avancar } = equipe.ticker;
  avancar.call(equipe.ticker, 4000);
  assert.equal(equipe.fila.rodando.size, 1, 'a fila ainda não devia ter destravado');

  // Passado o prazo, destrava. O limite é 9000 e a comparação é estrita,
  // então o segundo avanço precisa passar de 9000, e não encostar nele.
  avancar.call(equipe.ticker, 6000);
  assert.equal(equipe.fila.rodando.size, 0, 'passado o prazo, a fila destrava');
});

test('o watchdog dobra de velocidade se cada mão avançar a fila por conta própria', () => {
  /*
   * A contraprova do teste acima, e a razão de ele existir: com três mãos
   * chamando `tick` no mesmo quadro, o mesmo 4000ms de tempo de parede vira
   * 12000 de tempo virtual e a fila se dá por travada cedo demais — com a
   * mão ainda no meio do voto.
   */
  const equipe = equipeDe(3);
  equipe.enfileirar(item('a'));
  equipe.fila.proximo();

  for (let i = 0; i < 3; i++) equipe.fila.tick(4000);

  assert.equal(equipe.fila.rodando.size, 0,
    'três avanços no mesmo quadro já estouram o prazo — é o defeito que o tickDaFila evita');
});

test('a fila aceita tantas animações simultâneas quantas mãos existem', () => {
  const equipe = equipeDe(2);
  assert.equal(equipe.fila.maxSimultaneas, 2);

  equipe.enfileirar(item('a'));
  equipe.enfileirar(item('b'));
  equipe.enfileirar(item('c'));

  assert.ok(equipe.fila.proximo(), 'a primeira mão pega um voto');
  assert.ok(equipe.fila.proximo(), 'a segunda mão pega outro voto no mesmo instante');
  assert.equal(equipe.fila.ocupada, true, 'com as duas ocupadas a fila fecha');
  assert.equal(equipe.fila.proximo(), null, 'e a terceira espera a vez');
});

test('com uma mão só, a segunda animação espera — o comportamento antigo', () => {
  const equipe = equipeDe(1);
  equipe.enfileirar(item('a'));
  equipe.enfileirar(item('b'));

  assert.ok(equipe.fila.proximo());
  assert.equal(equipe.fila.proximo(), null);
});

test('iniciar duas vezes não registra os passos duas vezes', () => {
  const equipe = equipeDe(2);
  equipe.iniciar();
  const passos = equipe.ticker.passos.size;
  equipe.iniciar();
  assert.equal(equipe.ticker.passos.size, passos,
    'cada mão andaria dois quadros por quadro se registrasse duas vezes');
});

test('cada mão recebe a sua própria etiqueta, e não uma compartilhada', () => {
  const equipe = equipeDe(2);
  assert.notEqual(equipe.atores[0].render.badge, equipe.atores[1].render.badge);
});

test('enfileirar pela equipe é o mesmo que enfileirar pela fila', () => {
  const equipe = equipeDe(2);
  const r = equipe.enfileirar(item('a'));
  assert.deepEqual(r, { aceito: true, modo: 'completo' });
  assert.equal(equipe.fila.pendentes, 1);
});

test('as duas mãos nascem recolhidas, fora de cena', () => {
  const equipe = equipeDe(2);
  assert.equal(equipe.ocupadas, 0);
  for (const ator of equipe.atores) {
    assert.equal(ator.posicao.y, 2000, 'a mão espera abaixo da borda do palco');
  }
});
