import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarEspera, acharNumero, JANELA_PADRAO_MS } from '../server/espera.js';

/*
 * A espera do número no chat.
 *
 * O pedido do Leonardo, literal: "quando alguém enviar outro presente que não
 * seja rosa ou joinha, esperar ele escrever o número no chat; se demorar mais
 * de 15s, avisar por voz".
 *
 * O que isto resolve é o buraco entre o presente e o voto. Um presente
 * mapeado já sabe para onde vai; um presente que a TikTok inventou ontem não
 * sabe, e até agora ele simplesmente sumia — sem voto, sem fala, sem nada na
 * tela. Agora ele abre uma janela: o presente guarda o lugar dele, o número
 * que o espectador escrever decide a urna, e o silêncio de quinze segundos é
 * respondido com uma cobrança falada.
 *
 * O relógio e o sorteio entram por parâmetro pelo mesmo motivo de sempre: o
 * que se testa aqui é a REGRA, e uma regra de tempo testada com o relógio de
 * verdade é um teste que demora quinze segundos e falha uma vez em cada dez.
 */

const URNAS = [
  { id: 'u1', numero: '22' },
  { id: 'u2', numero: '13' },
];

/** Uma espera com o relógio na mão do teste. */
function bancada({ janelaMs = JANELA_PADRAO_MS } = {}) {
  let relogio = 1_000_000;
  const espera = criarEspera({ janelaMs, agora: () => relogio });
  return {
    espera,
    agora: () => relogio,
    avancar: (ms) => { relogio += ms; },
  };
}

const presente = (extra = {}) => ({
  userId: 'u-ana', usuario: 'Ana', giftId: '999', presente: 'Diamante', combo: 1, ...extra,
});

test('o presente sem urna abre uma espera pelo número', () => {
  const { espera } = bancada();
  const p = espera.abrir(presente());
  assert.equal(p.userId, 'u-ana');
  assert.equal(p.combo, 1);
  assert.equal(espera.pendentes, 1);
});

test('o número escrito no chat pelo MESMO autor vira voto', () => {
  // O caminho feliz inteiro: presente órfão, número no chat, urna decidida.
  const { espera } = bancada();
  espera.abrir(presente());
  const resgate = espera.resgatar({ userId: 'u-ana', texto: '22', urnas: URNAS });
  assert.ok(resgate, 'o número certo não resgatou');
  assert.equal(resgate.urnaId, 'u1');
  assert.equal(resgate.numero, '22');
  assert.equal(resgate.presente, 'Diamante', 'o resgate perdeu o presente que o originou');
  assert.equal(espera.pendentes, 0, 'a espera resgatada ficou pendurada');
});

test('o número de OUTRA pessoa não resgata a espera de ninguém', () => {
  /*
   * O defeito caro: qualquer um digitando "22" no chat contaria o presente
   * alheio para a urna que quisesse. O voto é de quem MANDOU o presente, e o
   * chat é público — por isso a espera é indexada por autor.
   */
  const { espera } = bancada();
  espera.abrir(presente());
  assert.equal(espera.resgatar({ userId: 'u-zeca', texto: '22', urnas: URNAS }), null);
  assert.equal(espera.pendentes, 1, 'a espera da Ana sumiu por causa do chat do Zeca');
});

test('quem escreve número sem ter presente pendente não vota', () => {
  // Sem esta guarda, o chat inteiro viraria urna: qualquer "13" solto no meio
  // de uma conversa contaria um voto que ninguém pagou.
  const { espera } = bancada();
  assert.equal(espera.resgatar({ userId: 'u-ana', texto: '13', urnas: URNAS }), null);
});

test('texto sem número nenhum deixa a espera de pé', () => {
  // O caso comum: ele manda o presente e continua conversando. Nada disso
  // pode queimar a espera — o número ainda pode vir dez segundos depois.
  const { espera } = bancada();
  espera.abrir(presente());
  assert.equal(espera.resgatar({ userId: 'u-ana', texto: 'boa noite galera!', urnas: URNAS }), null);
  assert.equal(espera.pendentes, 1);
  assert.ok(espera.resgatar({ userId: 'u-ana', texto: '22', urnas: URNAS }), 'a conversa queimou a espera');
});

test('o número colado numa palavra vale', () => {
  // "voto22" e "22!" são a mesma intenção. Exigir o número isolado por espaço
  // puniria quem escreve rápido, que é todo mundo no chat da live.
  const { espera } = bancada();
  espera.abrir(presente());
  assert.equal(espera.resgatar({ userId: 'u-ana', texto: 'voto22', urnas: URNAS })?.numero, '22');
});

test('número que não é de urna nenhuma não resgata', () => {
  // Ele pode ter errado o número. Errar não pode contar para a urna errada —
  // e também não pode queimar a espera: o certo é continuar esperando.
  const { espera } = bancada();
  espera.abrir(presente());
  assert.equal(espera.resgatar({ userId: 'u-ana', texto: '99', urnas: URNAS }), null);
  assert.equal(espera.pendentes, 1);
  assert.ok(espera.resgatar({ userId: 'u-ana', texto: '13', urnas: URNAS }), 'a segunda tentativa não valeu');
});

test('o número no meio de outro número não vale', () => {
  /*
   * "1222" não é o voto 22. A diferença não é preciosismo: um telefone, um
   * horário, um "2022" num comentário qualquer passariam a contar voto se a
   * busca fosse por trecho em vez de por número inteiro.
   */
  const { espera } = bancada();
  espera.abrir(presente());
  assert.equal(espera.resgatar({ userId: 'u-ana', texto: '1222', urnas: URNAS }), null);
});

test('o número é achado com sujeira em volta', () => {
  // Como as pessoas escrevem de verdade: com emoji, exclamação e espaço.
  const { espera } = bancada();
  espera.abrir(presente());
  const r = espera.resgatar({ userId: 'u-ana', texto: 'voto 13! 🙌', urnas: URNAS });
  assert.equal(r?.numero, '13');
  assert.equal(r?.urnaId, 'u2');
});

test('quinze segundos de silêncio vencem a espera', () => {
  const { espera, avancar } = bancada();
  espera.abrir(presente());
  avancar(JANELA_PADRAO_MS - 1);
  assert.deepEqual(espera.vencidas(), [], 'venceu antes da hora');
  avancar(1);
  const vencidas = espera.vencidas();
  assert.equal(vencidas.length, 1);
  assert.equal(vencidas[0].usuario, 'Ana', 'a cobrança falada não sabe de quem é o presente');
});

test('a cobrança sai UMA vez, e a espera continua de pé', () => {
  /*
   * A vencida é MARCADA, e não apagada — e a diferença é quem escreve no
   * segundo dezesseis.
   *
   * O presente foi pago e o número veio; o voto tem que acontecer. Apagar a
   * espera no instante da cobrança puniria a demora de quem já tinha pagado, e
   * logo depois de a voz ter pedido exatamente o número que ele escreveu.
   *
   * O que a marcação impede é a cobrança REPETIDA, que era o motivo de apagar:
   * sem ela, a voz cobraria a cada segundo até alguém reiniciar o servidor.
   */
  const { espera, avancar } = bancada();
  espera.abrir(presente());
  avancar(JANELA_PADRAO_MS * 3);
  assert.equal(espera.vencidas().length, 1);
  assert.deepEqual(espera.vencidas(), [], 'a mesma espera foi cobrada de novo');
  assert.equal(espera.pendentes, 1, 'a espera sumiu sem o voto ter acontecido');
});

test('quem escreve depois da cobrança ainda vota', () => {
  const { espera, avancar } = bancada();
  espera.abrir(presente({ combo: 3 }));
  avancar(JANELA_PADRAO_MS * 2);
  espera.vencidas();                        // a voz já cobrou o número
  const r = espera.resgatar({ userId: 'u-ana', texto: '13', urnas: URNAS });
  assert.equal(r?.numero, '13', 'o voto tardio foi perdido');
  assert.equal(r?.combo, 3, 'os votos do presente tardio sumiram no caminho');
  assert.equal(espera.pendentes, 0, 'a espera resgatada ficou pendurada');
});

test('um presente novo depois da cobrança merece outra cobrança', () => {
  /*
   * Já cobrado uma vez, quem manda OUTRO presente órfão volta a merecer a
   * voz: é um gesto novo, com dinheiro novo, e não a repetição do antigo.
   */
  const { espera, avancar } = bancada();
  espera.abrir(presente());
  avancar(JANELA_PADRAO_MS);
  espera.vencidas();
  avancar(1_000);
  espera.abrir(presente({ combo: 2 }));
  avancar(JANELA_PADRAO_MS);
  const vencidas = espera.vencidas();
  assert.equal(vencidas.length, 1, 'o segundo presente da mesma pessoa foi cobrado em silêncio');
  assert.equal(vencidas[0].combo, 3, 'o combo somado se perdeu no caminho');
});

test('a janela é de 15 segundos', () => {
  // O número está escrito no pedido; solto no código ele viraria 20 sem
  // ninguém notar.
  assert.equal(JANELA_PADRAO_MS, 15_000);
});

test('mais presentes do mesmo autor somam o combo e renovam o relógio', () => {
  /*
   * Quem manda três diamantes seguidos está mandando três votos e pedindo
   * mais tempo. O relógio reinicia no último: a espera é do GESTO, e o gesto
   * terminou agora.
   */
  const { espera, avancar } = bancada();
  espera.abrir(presente({ combo: 3 }));
  avancar(10_000);
  espera.abrir(presente({ combo: 2 }));
  assert.equal(espera.pendentes, 1, 'virou duas esperas para a mesma pessoa');
  avancar(JANELA_PADRAO_MS - 1_001);
  assert.deepEqual(espera.vencidas(), [], 'o relógio não foi renovado pelo segundo presente');
  avancar(1_001);
  const vencidas = espera.vencidas();
  assert.equal(vencidas[0].combo, 5, 'os presentes somados perderam votos no caminho');
});

test('a espera resgatada não vence depois', () => {
  // Depois de contar o voto, cobrar o número por voz seria cobrar o que já
  // foi respondido — e o Leonardo ouviria a voz reclamando de um voto que já
  // está no placar.
  const { espera, avancar } = bancada();
  espera.abrir(presente());
  espera.resgatar({ userId: 'u-ana', texto: '22', urnas: URNAS });
  avancar(JANELA_PADRAO_MS * 2);
  assert.deepEqual(espera.vencidas(), []);
});

test('duas pessoas esperando são cobradas separadamente', () => {
  const { espera, avancar } = bancada();
  espera.abrir(presente({ userId: 'u-ana', usuario: 'Ana' }));
  avancar(5_000);
  espera.abrir(presente({ userId: 'u-zeca', usuario: 'Zeca' }));
  avancar(10_000);
  const vencidas = espera.vencidas();
  assert.equal(vencidas.length, 1, 'as duas venceram juntas');
  assert.equal(vencidas[0].usuario, 'Ana');
  // A do Zeca ainda tem tempo: ele continua esperando sem ter sido cobrado.
  // Quem separa as duas não é mais o número de pendentes — Ana segue de pé
  // para o caso de escrever atrasada —, e sim quem foi cobrado nesta rodada.
  assert.equal(espera.pendentes, 2, 'a espera do Zeca sumiu junto com a da Ana');
  assert.deepEqual(espera.vencidas(), [], 'o Zeca foi cobrado antes dos quinze segundos dele');
});

test('acharNumero lê o primeiro número válido do texto', () => {
  assert.deepEqual(acharNumero('quero 13', URNAS), { numero: '13', urnaId: 'u2' });
  assert.equal(acharNumero('', URNAS), null);
  assert.equal(acharNumero(null, URNAS), null);
  assert.equal(acharNumero('22', []), null, 'sem urna cadastrada não há número que valha');
});
