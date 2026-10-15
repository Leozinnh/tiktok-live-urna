import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FilaDeAnimacao, PRIORIDADE } from '../public/js/anim/queue.js';

const voto = (id, extra = {}) => ({ id, urnaId: 'u1', prioridade: PRIORIDADE.normal, votos: 1, ...extra });

test('entrega na ordem de chegada quando as prioridades são iguais', () => {
  const f = new FilaDeAnimacao();
  f.enfileirar(voto('a'));
  f.enfileirar(voto('b'));
  f.enfileirar(voto('c'));
  assert.equal(f.proximo().id, 'a');
  f.concluir('a');
  assert.equal(f.proximo().id, 'b');
});

test('prioridade máxima fura a fila', () => {
  const f = new FilaDeAnimacao();
  f.enfileirar(voto('a'));
  f.enfileirar(voto('b'));
  f.enfileirar(voto('raro', { prioridade: PRIORIDADE.maxima }));
  assert.equal(f.proximo().id, 'raro', 'o raro deveria passar na frente');
});

test('prioridade alta fica atrás da máxima mas na frente da normal', () => {
  const f = new FilaDeAnimacao();
  f.enfileirar(voto('normal'));
  f.enfileirar(voto('alta', { prioridade: PRIORIDADE.alta }));
  f.enfileirar(voto('maxima', { prioridade: PRIORIDADE.maxima }));
  assert.equal(f.proximo().id, 'maxima');
  f.concluir('maxima');
  assert.equal(f.proximo().id, 'alta');
});

test('empate de prioridade mantém a ordem de chegada', () => {
  // O sort do JavaScript é estável desde o ES2019, mas a fila depende
  // disso: sem estabilidade, dois votos da mesma urna trocam de lugar
  // e o placar parece pular.
  const f = new FilaDeAnimacao();
  for (const id of ['a', 'b', 'c', 'd', 'e']) f.enfileirar(voto(id));
  const saiu = [];
  for (const id of ['a', 'b', 'c', 'd', 'e']) {
    const item = f.proximo();
    saiu.push(item.id);
    f.concluir(item.id);
  }
  assert.deepEqual(saiu, ['a', 'b', 'c', 'd', 'e']);
});

test('só uma animação roda por vez — a mão só existe uma', () => {
  const f = new FilaDeAnimacao({ maxSimultaneas: 1 });
  f.enfileirar(voto('a'));
  f.proximo();
  assert.ok(f.ocupada, 'deveria estar ocupada');
  assert.equal(f.proximo(), null, 'não deveria entregar outra enquanto ocupada');
});

test('concluir libera a fila para o próximo', () => {
  const f = new FilaDeAnimacao();
  f.enfileirar(voto('a'));
  f.enfileirar(voto('b'));
  f.proximo();
  assert.equal(f.proximo(), null);
  f.concluir('a');
  assert.equal(f.proximo().id, 'b');
});

test('acima do limiar, os excedentes entram em modo lote', () => {
  const f = new FilaDeAnimacao({ limiarLote: 3 });
  const r = ['a', 'b', 'c', 'd', 'e'].map((id) => f.enfileirar(voto(id)));
  assert.deepEqual(r.map((x) => x.modo), ['completo', 'completo', 'completo', 'lote', 'lote']);
});

test('nenhum voto é recusado, por maior que seja a rajada', () => {
  const f = new FilaDeAnimacao({ limiarLote: 3 });
  for (let i = 0; i < 500; i++) f.enfileirar(voto(`v${i}`));
  // `pendentes` já conta tudo, inclusive os que estão em modo lote.
  assert.equal(f.pendentes, 500, 'a rajada inteira tem de estar na fila');
  assert.equal(f.recusados, 0, 'nenhum voto pode ser recusado');
});

test('a rajada inteira sai da fila, sem perder ninguém no caminho', () => {
  const f = new FilaDeAnimacao({ limiarLote: 3 });
  for (let i = 0; i < 120; i++) f.enfileirar(voto(`v${i}`));
  const saiu = new Set();
  for (let guarda = 0; guarda < 500; guarda++) {
    const item = f.proximo();
    if (!item) break;
    saiu.add(item.id);
    f.concluir(item.id);
  }
  assert.equal(saiu.size, 120, 'todo voto enfileirado tem de ser entregue uma vez');
});

test('o watchdog força o término de uma animação travada', () => {
  const f = new FilaDeAnimacao({ duracaoBaseMs: 1000, fatorWatchdog: 2 });
  f.enfileirar(voto('a'));
  f.enfileirar(voto('b'));
  f.proximo();

  f.tick(500);
  assert.equal(f.proximo(), null, 'ainda dentro do prazo');

  f.tick(2000);   // passou de 2x a duração base
  assert.ok(!f.ocupada, 'o watchdog deveria ter liberado');
  assert.equal(f.proximo().id, 'b');
});

test('a velocidade encurta o prazo do watchdog no tempo real', () => {
  // A 2x a sequência termina na metade do tempo de parede, então o prazo
  // de segurança também cai pela metade. O acúmulo é em tempo virtual
  // (delta × velocidade) contra um limite fixo — que é o mesmo que medir
  // tempo real contra um limite dividido pela velocidade.
  const f = new FilaDeAnimacao({ duracaoBaseMs: 1000, fatorWatchdog: 2 });
  f.enfileirar(voto('a'));
  f.proximo();
  f.setVelocidade(2);

  f.tick(900);   // 1800 virtuais — dentro do limite de 2000
  assert.ok(f.ocupada, 'ainda dentro do prazo');

  f.tick(200);   // 2200 virtuais — passou
  assert.ok(!f.ocupada, 'a 2x o prazo chega em metade do tempo real');
});

test('drenar devolve os pendentes para serem carimbados de uma vez', () => {
  const f = new FilaDeAnimacao();
  f.enfileirar(voto('a'));
  f.enfileirar(voto('b'));
  f.proximo();
  const restantes = f.drenar();
  assert.deepEqual(restantes.map((v) => v.id), ['b']);
  assert.equal(f.pendentes, 0);
});

test('limpar esvazia tudo e libera a fila', () => {
  const f = new FilaDeAnimacao();
  f.enfileirar(voto('a'));
  f.proximo();
  f.limpar();
  assert.equal(f.pendentes, 0);
  assert.ok(!f.ocupada);
});

test('concluir um id que não é o que está rodando é ignorado', () => {
  const f = new FilaDeAnimacao();
  f.enfileirar(voto('a'));
  f.enfileirar(voto('b'));
  f.proximo();
  f.concluir('b');           // 'b' nem começou
  assert.ok(f.ocupada, 'a fila não deveria ter sido liberada');
});

test('esperando devolve quem ainda não começou, na ordem de atendimento', () => {
  // É o que a tela mostra ao espectador que acabou de presentear. Se a ordem
  // aqui divergir da ordem em que a mão atende, a tela mente: promete que ele
  // é o próximo e a mão chama outro.
  const f = new FilaDeAnimacao();
  f.enfileirar(voto('a', { usuario: 'Ana' }));
  f.enfileirar(voto('b', { usuario: 'Bia' }));
  f.enfileirar(voto('raro', { usuario: 'Rui', prioridade: PRIORIDADE.maxima }));
  assert.deepEqual(f.esperando().map((i) => i.usuario), ['Rui', 'Ana', 'Bia']);
});

test('esperando não conta quem já está na mão', () => {
  // O que está animando não está esperando — quem olha a tela já vê o voto
  // dele acontecendo. Contá-lo seria somar a mesma pessoa duas vezes.
  const f = new FilaDeAnimacao();
  f.enfileirar(voto('a'));
  f.enfileirar(voto('b'));
  f.proximo();
  assert.equal(f.esperando().length, 1);
  assert.equal(f.pendentes, 1);
});

test('esperando devolve cópia: mexer nela não estraga a fila', () => {
  const f = new FilaDeAnimacao();
  f.enfileirar(voto('a'));
  f.esperando().push(voto('intruso'));
  f.esperando()[0].usuario = 'outro';
  assert.equal(f.pendentes, 1);
  assert.notEqual(f.esperando()[0].usuario, 'outro');
});

test('fila vazia espera por ninguém', () => {
  assert.deepEqual(new FilaDeAnimacao().esperando(), []);
});
