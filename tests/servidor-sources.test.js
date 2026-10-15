import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarEvento, criarFonte } from '../server/sources/base.js';
import { criarSimulador } from '../server/sources/simulator.js';

/*
 * As fontes de evento — seção 4.7 da especificação.
 *
 * O adaptador da TikTok é a Etapa 7, e é justamente por isso que a interface
 * existe agora: o resto do sistema não pode saber de onde o presente veio.
 * Ele recebe eventos no formato comum, e o formato comum é o único lugar
 * onde a bagunça do mundo real é resolvida.
 *
 * O simulador não é um brinquedo de demonstração — é o modo em que o sistema
 * roda enquanto o adaptador real não existe, e é o que permite entregar e
 * validar todo o resto antes. Ele passa pela MESMA normalização que a TikTok
 * vai passar, senão o dia da virada seria o dia do primeiro teste de verdade.
 */

/* ---------------------------------------------------------------- formato */

test('um presente vira o evento comum, com plataforma e apelido', () => {
  const e = normalizarEvento(
    { giftId: '2', userId: 'ana', userName: 'Ana', combo: 3 },
    'simulador',
  );
  assert.equal(e.plataforma, 'simulador');
  assert.equal(e.giftId, '2');
  assert.equal(e.userId, 'ana');
  assert.equal(e.usuario, 'Ana');
  assert.equal(e.combo, 3);
  assert.equal(e.comboIndex, 0);
  assert.equal(typeof e.em, 'number');
});

test('o giftId vira texto, venha número ou texto', () => {
  /*
   * A TikTok manda o `giftId` como número em algumas versões do protocolo e
   * como texto em outras. A chave de deduplicação é montada com `join(':')`,
   * e `2` e `'2'` dão a mesma chave — mas o mapeamento da configuração
   * compara com `===` contra o texto do painel, e aí `2 !== '2'`. O presente
   * chegaria, não acharia urna, e não contaria. Normalizar aqui é o que faz
   * o defeito não existir.
   */
  assert.equal(normalizarEvento({ giftId: 2 }, 'tiktok').giftId, '2');
  assert.equal(
    normalizarEvento({ giftId: 2 }, 'tiktok').giftId,
    normalizarEvento({ giftId: '2' }, 'tiktok').giftId,
  );
});

test('o combo nunca vira zero nem negativo', () => {
  // Um combo 0 contaria zero votos e o presente sumiria da contagem sem
  // aviso nenhum. Um combo ausente vale 1: é o presente simples.
  assert.equal(normalizarEvento({ giftId: '2' }).combo, 1);
  assert.equal(normalizarEvento({ giftId: '2', combo: 0 }).combo, 1);
  assert.equal(normalizarEvento({ giftId: '2', combo: -3 }).combo, 1);
  assert.equal(normalizarEvento({ giftId: '2', combo: 'x' }).combo, 1);
  assert.equal(normalizarEvento({ giftId: '2', combo: '7' }).combo, 7);
});

test('um presente sem giftId não é evento', () => {
  /*
   * Seção 7: contar para a urna errada é pior do que não contar. Um evento
   * sem `giftId` não tem como ser mapeado, e deixá-lo passar faria o motor
   * procurar um presente `undefined` na configuração a cada mensagem
   * malformada que a rede entregasse.
   */
  assert.equal(normalizarEvento({ userId: 'ana' }), null);
  assert.equal(normalizarEvento({ giftId: '' }), null);
  assert.equal(normalizarEvento(null), null);
});

test('o apelido em branco é apelido vazio, e não a palavra undefined', () => {
  // O nome vai para o cartão do placar. `undefined` impresso na tela da live
  // é o tipo de coisa que ninguém vê no teste e todo mundo vê na transmissão.
  const e = normalizarEvento({ giftId: '2' });
  assert.equal(e.usuario, '');
  assert.equal(e.userId, '');
  assert.equal(e.giftNome, '');
});

/* -------------------------------------------------------------- a casca */

test('a fonte entrega a quem se inscreveu, na ordem em que chegaram', () => {
  const recebidos = [];
  const fonte = criarFonte({ modo: 'teste' });
  fonte.aoEvento((e) => recebidos.push(e.giftId));
  fonte.emitir(normalizarEvento({ giftId: '1' }));
  fonte.emitir(normalizarEvento({ giftId: '2' }));
  assert.deepEqual(recebidos, ['1', '2']);
});

test('quem se descasca para de receber, e a fonte não reclama', () => {
  const recebidos = [];
  const fonte = criarFonte({ modo: 'teste' });
  const sair = fonte.aoEvento((e) => recebidos.push(e.giftId));
  fonte.emitir(normalizarEvento({ giftId: '1' }));
  sair();
  fonte.emitir(normalizarEvento({ giftId: '2' }));
  assert.deepEqual(recebidos, ['1']);
});

test('um ouvinte quebrado não cala os outros', () => {
  /*
   * Seção 7: a live não pode parar por causa de um erro. Um ouvinte que
   * lança — o hub com a conexão já fechada, por exemplo — não pode impedir
   * o próximo de receber o voto.
   */
  const recebidos = [];
  const fonte = criarFonte({ modo: 'teste' });
  fonte.aoEvento(() => { throw new Error('conexão caiu'); });
  fonte.aoEvento((e) => recebidos.push(e.giftId));
  fonte.emitir(normalizarEvento({ giftId: '1' }));
  assert.deepEqual(recebidos, ['1']);
});

test('um evento inválido não é emitido para ninguém', () => {
  const recebidos = [];
  const fonte = criarFonte({ modo: 'teste' });
  fonte.aoEvento((e) => recebidos.push(e));
  assert.equal(fonte.emitir(null), false);
  assert.deepEqual(recebidos, []);
});

/* ----------------------------------------------------------- o simulador */

test('o presente do painel vira um evento na hora', () => {
  const recebidos = [];
  const sim = criarSimulador();
  sim.aoEvento((e) => recebidos.push(e));
  sim.iniciar();
  sim.enviar({ giftId: '2', userId: 'ana', userName: 'Ana', combo: 4 });
  assert.equal(recebidos.length, 1);
  assert.equal(recebidos[0].plataforma, 'simulador');
  assert.equal(recebidos[0].combo, 4);
  assert.equal(recebidos[0].usuario, 'Ana');
});

test('a rajada manda eventos separados, e não um combo gigante', () => {
  /*
   * Doze toques no botão são doze eventos, como na vida real: a TikTok manda
   * uma mensagem por presente, e o combo é o contador que vem dentro dela.
   * Um único evento de combo 12 desenharia UMA mão digitando doze votos, e a
   * fila é justamente o que faz a tela parecer uma votação acontecendo.
   */
  const recebidos = [];
  const sim = criarSimulador();
  sim.aoEvento((e) => recebidos.push(e));
  sim.iniciar();
  sim.rajada({ giftId: '2', userId: 'ana', userName: 'Ana', quantidade: 12 });
  assert.equal(recebidos.length, 12);
  assert.deepEqual(recebidos.map((e) => e.combo), Array(12).fill(1));
  assert.deepEqual(recebidos.map((e) => e.comboIndex), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});

test('a rajada no mesmo milissegundo não é descartada como repetição', () => {
  /*
   * Este é o defeito que o `comboIndex` da chave de deduplicação existe para
   * evitar, e é por isso que a rajada não inventa um `em` diferente para
   * cada evento: uma rajada de verdade chega toda no mesmo instante. Sem o
   * índice na chave, o espectador mandaria doze e o placar subiria um.
   */
  const recebidos = [];
  const sim = criarSimulador();
  sim.aoEvento((e) => recebidos.push(e));
  sim.iniciar();
  sim.rajada({ giftId: '2', userId: 'ana', quantidade: 12 });
  assert.equal(new Set(recebidos.map((e) => e.em)).size, 1, 'a rajada devia ser toda no mesmo instante');
  const chaves = new Set(recebidos.map((e) => `${e.userId}:${e.giftId}:${e.em}:${e.comboIndex}`));
  assert.equal(chaves.size, 12, 'duas rosas da rajada viraram a mesma chave');
});

test('a rajada de dois usuários diferentes não se mistura', () => {
  // O `comboIndex` é por remetente: a Ana e o Bruno tocando o mesmo botão ao
  // mesmo tempo são duas rajadas, não uma de 24 pela metade de cada.
  const recebidos = [];
  const sim = criarSimulador();
  sim.aoEvento((e) => recebidos.push(e));
  sim.iniciar();
  sim.rajada({ giftId: '2', userId: 'ana', quantidade: 3 });
  sim.rajada({ giftId: '2', userId: 'bruno', quantidade: 3 });
  const daAna = recebidos.filter((e) => e.userId === 'ana');
  assert.deepEqual(daAna.map((e) => e.comboIndex), [0, 1, 2]);
  const chaves = new Set(recebidos.map((e) => `${e.userId}:${e.giftId}:${e.em}:${e.comboIndex}`));
  assert.equal(chaves.size, 6);
});

test('o simulador está sempre conectado, e diz o que é', () => {
  // O painel mostra este status na aba Integração. Um simulador "desconectado"
  // faria o Leonardo procurar um problema de rede que não existe.
  const sim = criarSimulador();
  assert.equal(sim.status().modo, 'simulador');
  assert.equal(sim.status().conectado, false, 'antes de iniciar, nada está no ar');
  sim.iniciar();
  assert.equal(sim.status().conectado, true);
  assert.match(sim.status().detalhe, /painel/i);
});

test('iniciar duas vezes não abre dois canais', () => {
  const sim = criarSimulador();
  sim.iniciar();
  assert.equal(sim.iniciar(), false, 'a segunda partida devia ser recusada');
});

test('parar o simulador cala a boca dele', () => {
  // Um adaptador parado que continua emitindo é um voto entrando numa rodada
  // que o Leonardo já encerrou — e ele não teria como saber de onde veio.
  const recebidos = [];
  const sim = criarSimulador();
  sim.aoEvento((e) => recebidos.push(e));
  sim.iniciar();
  sim.enviar({ giftId: '2', userId: 'ana' });
  sim.parar();
  sim.enviar({ giftId: '2', userId: 'ana' });
  assert.equal(recebidos.length, 1);
  assert.equal(sim.status().conectado, false);
});

test('a mudança de status avisa quem está olhando', () => {
  // A aba Integração mostra a conexão ao vivo. Sem este aviso, ela mostraria
  // o estado de quando a página abriu, para sempre.
  const vistos = [];
  const sim = criarSimulador();
  sim.aoStatus((s) => vistos.push(s.conectado));
  sim.iniciar();
  sim.parar();
  assert.deepEqual(vistos, [true, false]);
});
