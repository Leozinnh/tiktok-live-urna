import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chaveDeAceite, codificarFrame, decodificarFrames, GUID } from '../server/ws.js';

/*
 * O WebSocket, escrito à mão.
 *
 * O projeto tem zero dependências de execução desde o primeiro commit — é o
 * que faz `npm install` não existir e o site subir com um `npm start`. Um
 * `ws` no package.json resolveria isto em três linhas, e traria junto uma
 * árvore de dependências para manter atualizada numa máquina que fica
 * ligada a noite inteira numa live.
 *
 * O que a especificação pede é pequeno: um canal de mão única para o
 * servidor empurrar estado e eventos, e algumas mensagens de volta. Não
 * precisa de extensões, nem de compressão, nem de fragmentação.
 */

test('a chave de aceite é o SHA-1 da chave do cliente com o GUID do protocolo', () => {
  // RFC 6455, seção 4.2.2. É o que separa um upgrade de verdade de qualquer
  // requisição HTTP que traga o cabeçalho certo por acidente.
  const esperado = createHash('sha1')
    .update('dGhlIHNhbXBsZSBub25jZQ==' + GUID)
    .digest('base64');
  assert.equal(chaveDeAceite('dGhlIHNhbXBsZSBub25jZQ=='), esperado);
  // O valor do exemplo da RFC, que é o que prova que a conta está certa.
  assert.equal(chaveDeAceite('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
});

test('um texto vira um quadro com o opcode de texto', () => {
  const quadro = codificarFrame('oi');
  assert.equal(quadro[0], 0x81, 'o primeiro byte devia ser FIN + opcode de texto');
  assert.equal(quadro[1], 2, 'o servidor NÃO mascara, então o tamanho sai cru');
  assert.equal(quadro.subarray(2).toString('utf8'), 'oi');
});

test('o tamanho do quadro cresce como o protocolo manda', () => {
  /*
   * Três faixas: até 125 o tamanho cabe no próprio byte; até 65535 ele ocupa
   * dois bytes depois; acima disso, oito. É a parte do RFC que qualquer um
   * erra na primeira vez, e o erro só aparece no dia em que a mensagem passa
   * de 125 bytes — o que, num estado completo do placar, é sempre.
   */
  const de126 = codificarFrame('x'.repeat(126));
  assert.equal(de126[1], 126, 'faltou a faixa de dois bytes');
  assert.equal(de126.readUInt16BE(2), 126);

  const de70000 = codificarFrame('x'.repeat(70000));
  assert.equal(de70000[1], 127, 'faltou a faixa de oito bytes');
  assert.equal(Number(de70000.readBigUInt64BE(2)), 70000);
});

test('um quadro do cliente volta como a mensagem que ele mandou', () => {
  const original = { tipo: 'sim.gift', giftId: '2', usuario: 'ana' };
  const quadro = mascara(Buffer.from(JSON.stringify(original), 'utf8'));
  const { mensagens, resto } = decodificarFrames(quadro);
  assert.equal(resto.length, 0);
  assert.equal(mensagens.length, 1);
  assert.deepEqual(JSON.parse(mensagens[0]), original);
});

test('dois quadros colados viram duas mensagens', () => {
  // É o caso normal quando alguém clica dois botões rápido: o TCP entrega
  // os dois num pacote só, e ler apenas o primeiro perderia o segundo em
  // silêncio.
  const pacote = Buffer.concat([
    mascara(Buffer.from('{"a":1}', 'utf8')),
    mascara(Buffer.from('{"b":2}', 'utf8')),
  ]);
  const { mensagens } = decodificarFrames(pacote);
  assert.deepEqual(mensagens.map((m) => JSON.parse(m)), [{ a: 1 }, { b: 2 }]);
});

test('um quadro partido ao meio não é entregue pela metade', () => {
  /*
   * E é por isso que a função devolve `resto`: uma mensagem maior do que a
   * MTU chega em pedaços, e decodificar o pedaço faria o motor receber um
   * JSON truncado e recusar um voto de verdade.
   */
  const inteiro = mascara(Buffer.from('{"tipo":"state.request"}', 'utf8'));
  const metade = inteiro.subarray(0, 7);
  const um = decodificarFrames(metade);
  assert.deepEqual(um.mensagens, [], 'entregou uma mensagem incompleta');
  assert.equal(um.resto.length, 7);

  const dois = decodificarFrames(Buffer.concat([um.resto, inteiro.subarray(7)]));
  assert.deepEqual(JSON.parse(dois.mensagens[0]), { tipo: 'state.request' });
});

test('quadros de controle são ignorados, e não viram mensagem', () => {
  /*
   * `close`, `ping` e `pong` têm opcode próprio e payload que não é JSON.
   * Entregá-los ao motor faria um `JSON.parse` explodir num evento que não é
   * erro nenhum — é o navegador dizendo "tô aqui".
   */
  const ping = Buffer.from([0x89, 0x00]);
  const { mensagens } = decodificarFrames(Buffer.concat([
    ping, mascara(Buffer.from('{"tipo":"hello"}', 'utf8')),
  ]));
  assert.deepEqual(mensagens.map((m) => JSON.parse(m)), [{ tipo: 'hello' }]);
});

test('lixo binário não derruba o decodificador', () => {
  const { mensagens } = decodificarFrames(Buffer.from([0x82, 0xff, 0x01, 0x02]));
  assert.deepEqual(mensagens, [], 'um quadro binário virou mensagem de texto');
});

test('do lado do servidor, um quadro de texto SEM máscara é recusado', () => {
  // RFC 6455, seção 5.1: o cliente é obrigado a mascarar. Um quadro sem
  // máscara chegando no servidor é um cliente fora do protocolo — ou um
  // intermediário reescrevendo bytes —, e aceitar seria adivinhar.
  const { mensagens } = decodificarFrames(codificarFrame('oi'));
  assert.deepEqual(mensagens, []);
});

test('do lado do cliente, o quadro sem máscara é o normal', () => {
  /*
   * E o mesmo RFC proíbe o SERVIDOR de mascarar. São dois papéis, um
   * decodificador só, e a diferença tem que ser dita em voz alta: um
   * decodificador permissivo por padrão daria um servidor que aceita quadro
   * sem máscara, que é exatamente o que o teste acima proíbe.
   */
  const { mensagens } = decodificarFrames(codificarFrame('{"tipo":"state.full"}'), {
    exigirMascara: false,
  });
  assert.deepEqual(JSON.parse(mensagens[0]), { tipo: 'state.full' });
});

/** Mascara um payload como o navegador faz — RFC 6455, seção 5.3. */
function mascara(payload) {
  const chave = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  const corpo = Buffer.from(payload);
  for (let i = 0; i < corpo.length; i++) corpo[i] ^= chave[i % 4];
  const cabecalho = Buffer.alloc(6);
  cabecalho[0] = 0x81;
  cabecalho[1] = 0x80 | corpo.length;
  chave.copy(cabecalho, 2);
  return Buffer.concat([cabecalho, corpo]);
}
