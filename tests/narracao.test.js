import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarNarrador, preencher, FALAS_PADRAO } from '../server/narracao.js';

/*
 * Quem fala o que, e quando fica quieto.
 *
 * Este módulo decide UMA coisa: dada a chegada de um evento social, sai fala
 * ou sai silêncio. Ele não sintetiza, não toca e não conhece o navegador — é
 * puro de propósito, porque é aqui que moram as regras que ninguém consegue
 * conferir de ouvido no meio de uma live.
 *
 * A regra que dá mais trabalho é a do silêncio. Numa live movimentada chegam
 * dezenas de entradas por minuto, e o TikTok repete a entrada de quem sai e
 * volta. Um narrador que fala tudo o que chega vira uma metralhadora de nomes
 * que ninguém entende — e o que era para dar boas-vindas passa a atrapalhar.
 * Por isso há cooldown por pessoa, e por isso ele é testado com relógio
 * injetado: um teste que espera 60 segundos de verdade não roda.
 */

/* ---------------------------------------------------------- o preenchedor */

test('a fala troca o nome de quem chegou', () => {
  assert.equal(preencher('Olha o {nome} aí!', { nome: 'Ana' }), 'Olha o Ana aí!');
});

test('o nome em branco não deixa buraco na frase', () => {
  /*
   * O apelido vem da rede e pode chegar vazio — a TikTok manda `nickname`
   * nulo para conta sem nome definido. "Olha o  aí!" na tela é o tipo de coisa
   * que só aparece na transmissão.
   */
  assert.equal(preencher('Fala, {nome}!', { nome: '' }), 'Fala, Alguém!');
  assert.equal(preencher('Fala, {nome}!', { nome: '   ' }), 'Fala, Alguém!');
  assert.equal(preencher('Fala, {nome}!', {}), 'Fala, Alguém!');
});

test('a mesma frase com dois marcadores troca os dois', () => {
  // `replace` sem `/g` trocaria só o primeiro, e a frase sairia com o segundo
  // `{nome}` cru na tela — visível, feio, e fácil de não notar no teste.
  assert.equal(
    preencher('{nome} mandou {quantidade} e o {nome} é fera', { nome: 'Bia', quantidade: 3 }),
    'Bia mandou 3 e o Bia é fera',
  );
});

/* ------------------------------------------------------------- a escolha */

const TUDO = { seguidor: ['Seguiu: {nome}', 'Mais um: {nome}'] };

/** Narrador com relógio e sorteio na mão: 0 sempre pega o primeiro do saco. */
function montar({ falas = TUDO, aoNarrar = null } = {}) {
  let relogio = 0;
  const narrador = criarNarrador({
    falas,
    sorteio: () => 0,
    agora: () => relogio,
    aoNarrar,
  });
  return { narrador, avancar: (ms) => { relogio += ms; } };
}

const seguidor = (nome, userId = nome) => ({ tipo: 'seguidor', usuario: nome, userId });

test('o seguidor vira uma fala com o nome dele', () => {
  const { narrador } = montar();
  const fala = narrador.narrar(seguidor('Ana'));
  assert.match(fala, /Ana/);
});

test('a mesma frase nunca sai duas vezes seguidas', () => {
  /*
   * Duas pessoas diferentes seguidas, as duas frases no sorteio. Sem esta
   * regra o sorteio pode devolver a mesma duas vezes, e a live ouve "mais um
   * seguidor" duas vezes colado — o que soa como um bug, mesmo sendo sorte.
   *
   * O sorteio devolve 0 sempre, então o saco é quem garante a diferença: ele
   * recarrega sem o último que saiu.
   */
  const { narrador } = montar();
  const primeira = narrador.narrar(seguidor('Ana'));
  const segunda = narrador.narrar(seguidor('Bia'));
  assert.notEqual(primeira, segunda, 'a mesma frase saiu duas vezes seguidas');
  const terceira = narrador.narrar(seguidor('Caio'));
  assert.notEqual(segunda, terceira);
});

test('com uma frase só, ela repete sem drama', () => {
  // A regra do "não repete" não pode virar silêncio quando não há alternativa:
  // quem apagou as frases extras no painel ainda quer ouvir o aviso.
  const { narrador } = montar({ falas: { seguidor: ['Só esta: {nome}'] } });
  assert.equal(narrador.narrar(seguidor('Ana')), 'Só esta: Ana');
  assert.equal(narrador.narrar(seguidor('Bia')), 'Só esta: Bia');
});

/* ----------------------------------------------------------- o cooldown */

test('a mesma pessoa não é anunciada duas vezes seguidas', () => {
  /*
   * O TikTok repete a entrada de quem sai e volta, e a rede entrega o mesmo
   * evento mais de uma vez quando a conexão oscila. Sem cooldown, a live ouve
   * o nome do mesmo sujeito três vezes em cinco segundos.
   */
  const { narrador } = montar({ falas: { entrada: ['Oi, {nome}'] } });
  assert.equal(narrador.narrar({ tipo: 'entrada', usuario: 'Ana', userId: 'ana' }), 'Oi, Ana');
  assert.equal(narrador.narrar({ tipo: 'entrada', usuario: 'Ana', userId: 'ana' }), null);
});

test('passado o cooldown, a mesma pessoa é anunciada de novo', () => {
  // Sair e voltar meia hora depois é uma chegada nova, e merece o oi de novo.
  const { narrador, avancar } = montar({ falas: { entrada: ['Oi, {nome}'] } });
  const ana = { tipo: 'entrada', usuario: 'Ana', userId: 'ana' };
  assert.ok(narrador.narrar(ana));
  avancar(61_000);
  assert.ok(narrador.narrar(ana), 'a Ana voltou depois de um minuto e ninguém falou nada');
});

test('o cooldown é de cada pessoa, e não da live', () => {
  // A versão ingênua — um cooldown só para o tipo — faria a chegada da Ana
  // calar a chegada da Bia, e numa live com gente entrando não se ouviria
  // mais ninguém.
  const { narrador } = montar({ falas: { entrada: ['Oi, {nome}'] } });
  assert.ok(narrador.narrar({ tipo: 'entrada', usuario: 'Ana', userId: 'ana' }));
  assert.equal(narrador.narrar({ tipo: 'entrada', usuario: 'Bia', userId: 'bia' }), 'Oi, Bia');
});

test('o cooldown é de cada tipo, e não da pessoa', () => {
  // Quem entra e logo segue merece as duas falas. Um cooldown por pessoa
  // engoliria o agradecimento do follow, que é o momento mais importante.
  const { narrador } = montar({
    falas: { entrada: ['Oi, {nome}'], seguidor: ['Valeu, {nome}'] },
  });
  assert.ok(narrador.narrar({ tipo: 'entrada', usuario: 'Ana', userId: 'ana' }));
  assert.equal(narrador.narrar({ tipo: 'seguidor', usuario: 'Ana', userId: 'ana' }), 'Valeu, Ana');
});

/* ------------------------------------------------------------- a curtida */

test('uma curtida sozinha não merece fala', () => {
  /*
   * O TikTok manda um evento por toque. Narrar cada um encheria a fila de
   * fala com "valeu pela curtida" centenas de vezes, e o narrador ficaria
   * minutos atrás da live.
   */
  const { narrador } = montar({ falas: { curtida: ['{quantidade} curtidas, {nome}'] } });
  assert.equal(narrador.narrar({ tipo: 'curtida', usuario: 'Ana', userId: 'ana', quantidade: 1 }), null);
  assert.equal(narrador.narrar({ tipo: 'curtida', usuario: 'Ana', userId: 'ana', quantidade: 2 }), null);
});

test('a rajada de curtidas vira UMA fala, com o total junto', () => {
  // Cinco toques seguidos são um gesto só, e é assim que a live deve ouvir.
  const { narrador } = montar({ falas: { curtida: ['{quantidade} curtidas, {nome}'] } });
  const ana = (q) => ({ tipo: 'curtida', usuario: 'Ana', userId: 'ana', quantidade: q });
  assert.equal(narrador.narrar(ana(2)), null);
  assert.equal(narrador.narrar(ana(2)), null);
  assert.equal(narrador.narrar(ana(2)), '6 curtidas, Ana');
  // E a rajada continua depois da fala sem soar de novo na hora.
  assert.equal(narrador.narrar(ana(5)), null);
});

test('a rajada lenta não acumula', () => {
  /*
   * A janela existe para separar gesto de hábito. Se ela não fechasse, quem
   * curtisse uma vez a cada meia hora acabaria ouvindo "5 curtidas" no fim da
   * noite por um gesto que nunca existiu.
   */
  const { narrador, avancar } = montar({ falas: { curtida: ['{quantidade} curtidas, {nome}'] } });
  const ana = { tipo: 'curtida', usuario: 'Ana', userId: 'ana', quantidade: 2 };
  assert.equal(narrador.narrar(ana), null);
  avancar(10_000);
  assert.equal(narrador.narrar(ana), null);
  avancar(10_000);
  assert.equal(narrador.narrar(ana), null, 'a janela não fechou e o total vazou');
});

/* --------------------------------------------------------- o que se cala */

test('um evento sem tipo conhecido não narra nada', () => {
  const { narrador } = montar();
  assert.equal(narrador.narrar({ tipo: 'dancou', usuario: 'Ana' }), null);
  assert.equal(narrador.narrar({ usuario: 'Ana' }), null);
  assert.equal(narrador.narrar(null), null);
});

test('um tipo sem frase configurada fica em silêncio, e não estoura', () => {
  // O painel deixa apagar a lista inteira. Um `undefined` na tela da live é
  // pior do que não falar.
  const { narrador } = montar({ falas: { seguidor: [] } });
  assert.equal(narrador.narrar(seguidor('Ana')), null);
});

test('sem lista nenhuma no config, valem as frases que vêm no código', () => {
  /*
   * Uma lista vazia no painel é mais provável de ser campo esquecido do que
   * vontade de ficar mudo — para ficar mudo existe o interruptor. Então o
   * padrão do código assume, e o painel mostra ele escrito desde o começo.
   */
  const { narrador } = montar({ falas: {} });
  assert.ok(FALAS_PADRAO.seguidor.length > 0, 'o padrão do seguidor está vazio');
  assert.match(narrador.narrar(seguidor('Ana')), /Ana/);
});

test('o padrão tem frase para todo tipo social', () => {
  // Um tipo que passa pela normalização e não tem frase é um evento que
  // atravessa o sistema inteiro para morrer no fim, em silêncio.
  for (const tipo of ['seguidor', 'curtida', 'entrada', 'compartilhou', 'assinatura']) {
    assert.ok(FALAS_PADRAO[tipo]?.length > 0, `falta a frase padrão de ${tipo}`);
  }
});

test('a fala pronta é entregue a quem pediu para saber', () => {
  // O hub precisa do texto para mandar à tela junto com o áudio. O narrador
  // avisa — ele não conhece WebSocket nem arquivo.
  const ditas = [];
  const { narrador } = montar({ aoNarrar: (f) => ditas.push(f) });
  const fala = narrador.narrar(seguidor('Ana'));
  assert.deepEqual(ditas, [fala]);
  assert.equal(ditas[0], fala);
});
