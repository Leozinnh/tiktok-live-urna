import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acharUrna, urnasCitadas, palavras, palavrasDaUrna, chaveDoComentario,
  criarChatVoto, INTERVALO_DO_CHAT_MS, VOTOS_DO_CHAT,
} from '../server/chat-voto.js';

/*
 * O voto escrito no chat.
 *
 * O pedido do Leonardo, literal: "quando alguém comentar 'bolsonaro, 22,
 * flavio e tal' automaticamente computar 1 voto pro candidato".
 *
 * O que este arquivo prova é a REGRA, e ela é toda sobre não contar errado. O
 * caminho — o comentário chegando pela fonte, o voto saindo no socket — é
 * assunto do servidor-hub.test.js. Aqui é: quem este texto nomeia, quantas
 * urnas ele cita, e de quanto em quanto tempo a mesma pessoa pode votar.
 *
 * As duas urnas são as da live do Leonardo — o 22 do Flávio e o 13 do Lula —,
 * e não "Urna 1" e "Urna 2": é assim que se descobre, num teste, que
 * "bolsonaro" e "flavio" apontam para o MESMO lugar, e que o apelido
 * ("Lulinha") e o nome ("Lula") também.
 */

const URNAS = [
  {
    id: 'u1', nome: 'Flavio Bolsonaro', apelido: 'Flavio', numero: '22',
    candidato: { nome: 'Flavio Bolsonaro' }, ativo: true,
  },
  {
    id: 'u2', nome: 'Lula', apelido: 'Lulinha', numero: '13',
    candidato: { nome: 'LULA' }, ativo: true,
  },
];

/** A urna que o texto escolheu, ou `null`. */
const alvo = (texto, urnas = URNAS) => acharUrna(texto, urnas)?.urnaId ?? null;

/* ------------------------------------------------------------- as palavras */

test('as palavras perdem o acento e a maiúscula', () => {
  // No chat da live o mesmo nome aparece das três formas na mesma noite. Quem
  // escreve "Flávio", com acento, é quem escreve certo — e seria justamente
  // ele a não votar se o acento separasse as palavras.
  assert.deepEqual(palavras('Flávio, 22!'), ['flavio', '22']);
  assert.deepEqual(palavras('FLÁVIO'), palavras('flavio'));
  assert.deepEqual(palavras(null), []);
});

test('as palavras da urna saem do apelido, do nome e do candidato', () => {
  const chaves = palavrasDaUrna(URNAS[0]);
  assert.ok(chaves.has('flavio'), 'o apelido do painel não nomeia a urna');
  assert.ok(chaves.has('bolsonaro'), 'o nome do candidato não nomeia a urna');
});

test('a palavra neutra não nomeia ninguém', () => {
  /*
   * "voto", "candidato", "presidente" e "deputado" estão nos nomes das duas
   * urnas e não apontam para nenhuma delas. Sem esta lista, "voto no
   * candidato" citaria as duas e não valeria nada — e metade das frases de
   * uma live de política tem uma dessas.
   */
  const chaves = palavrasDaUrna({
    id: 'u9', nome: 'Urna do Deputado', apelido: 'Candidato', numero: '99',
    candidato: { nome: 'Presidente da República' },
  });
  /*
   * "República" sobra, e sobra de propósito: ela é o nome de um CARGO na
   * ficção deste teste e um país de verdade, e a lista de neutras não tem como
   * adivinhar isso. É o lembrete de que a lista é uma peneira, e não uma
   * garantia — o que ela precisa garantir é o caso comum, e ele está abaixo.
   */
  assert.deepEqual([...chaves], ['republica']);
  assert.deepEqual(
    [...palavrasDaUrna({ id: 'u9', nome: 'Urna do Deputado', apelido: 'Candidato', numero: '99' })],
    [], 'uma palavra neutra virou nome de urna',
  );
});

test('palavra curta não nomeia urna', () => {
  // "de", "da" e as iniciais de um nome apareceriam em metade dos comentários
  // de uma live. Quatro letras é o tamanho do menor apelido que ainda
  // identifica alguém ("lula").
  assert.deepEqual([...palavrasDaUrna({ id: 'u9', apelido: 'Léo', numero: '99' })], []);
});

/* ------------------------------------------------------- quem o texto cita */

test('o número do candidato é um voto', () => {
  assert.equal(alvo('22'), 'u1');
  assert.equal(alvo('voto 13!'), 'u2');
});

test('o nome e o apelido também são voto', () => {
  assert.equal(alvo('flavio'), 'u1');
  assert.equal(alvo('BOLSONARO 🇧🇷'), 'u1');
  assert.equal(alvo('voto no lula'), 'u2');
  assert.equal(alvo('lulinha!'), 'u2');
});

test('o exemplo do pedido, inteiro, é um voto', () => {
  /*
   * "bolsonaro, 22, flavio e tal" — as três citações são da MESMA urna, e é
   * por isso que ele conta. O que decide não é quantas vezes o nome aparece, e
   * sim para quantas urnas o texto aponta.
   */
  const r = acharUrna('bolsonaro, 22, flavio e tal', URNAS);
  assert.equal(r.urnaId, 'u1');
  assert.equal(r.numero, '22');
  assert.equal(r.por, 'numero');
});

test('quem escreve o nome vota com o número da URNA, e não com o que digitou', () => {
  // Quem escreve "voto no lula" não escreveu "13" nenhuma vez. O número que a
  // mão vai digitar na cena é o da urna, e ele sai da configuração.
  const r = acharUrna('voto no lula', URNAS);
  assert.equal(r.numero, '13');
  assert.equal(r.por, 'nome');
});

test('texto que cita as duas urnas não é voto de ninguém', () => {
  /*
   * A regra que impede o placar de virar sorteio. "22 e 13" é um comentário
   * sobre a DISPUTA, e a torcida escreve os dois números o tempo todo — quem
   * escreve "flavio e lula" está comparando, não escolhendo. Contar para o
   * primeiro que aparecesse daria o voto a quem escreveu primeiro, e não a
   * quem votou.
   */
  assert.equal(alvo('22 e 13'), null);
  assert.equal(alvo('flavio e lula'), null);
  assert.equal(alvo('entre o 22 e o lulinha, prefiro o 13'), null);
});

test('o comentário comum não é voto', () => {
  // A imensa maioria do chat de uma live: saudação, risada, torcida. Nenhum
  // deles pode mexer no placar.
  for (const texto of ['boa noite galera!', 'kkkkkk', 'cheguei', 'bora!', '']) {
    assert.equal(alvo(texto), null, `"${texto}" contou voto`);
  }
});

test('número que não é de urna nenhuma não vota', () => {
  // Ele pode ter errado o número, ou estar falando de outra coisa. Errar não
  // pode contar para a urna errada.
  assert.equal(alvo('99'), null);
  assert.equal(alvo('voto 45'), null);
});

test('o número no meio de outro número não vale', () => {
  /*
   * "1222" não é o voto 22. Um telefone, um horário, um "2022" num comentário
   * qualquer passariam a contar voto se a busca fosse por trecho.
   */
  assert.equal(alvo('1222'), null);
  assert.equal(alvo('em 2022 eu votei'), null);
  assert.equal(alvo('liguem 2299'), null);
});

test('a urna desligada no painel não recebe voto escrito', () => {
  // Desligar a urna é a decisão de tirá-la da disputa, e ela vale para os dois
  // caminhos: o presente e o comentário.
  const desligada = [{ ...URNAS[0], ativo: false }, URNAS[1]];
  assert.equal(alvo('22', desligada), null);
  assert.equal(alvo('flavio', desligada), null);
  assert.equal(alvo('13', desligada), 'u2', 'a outra urna parou junto');
});

test('urna sem número não casa com o zero de ninguém', () => {
  // O campo apagado no painel viraria `0` e casaria com qualquer "0" escrito
  // no chat — e um "0" no chat de uma live é uma nota, não um voto.
  const semNumero = [{ ...URNAS[0], numero: '' }, { ...URNAS[1], numero: null }];
  assert.equal(alvo('0', semNumero), null);
  assert.equal(alvo('voto no flavio', semNumero), 'u1', 'o nome parou junto com o número');
});

test('"voto no candidato" não cita urna nenhuma', () => {
  // A frase mais comum de uma live de política, e ela não escolhe ninguém.
  assert.equal(alvo('voto no candidato'), null);
  assert.equal(alvo('esse deputado é meu voto'), null);
});

/* ---------------------------------------------------------- o intervalo */

test('a mesma pessoa vota a cada três segundos', () => {
  /*
   * Sem intervalo, quem digita "22" cinquenta vezes seguidas vale cinquenta
   * votos, e a votação vira um teste de quem tem o dedo mais rápido. Três
   * segundos é o tempo de alguém digitar, ver que não aconteceu nada e
   * digitar de novo.
   */
  let relogio = 1_000_000;
  const chat = criarChatVoto({ agora: () => relogio });
  assert.equal(chat.reservar('ana'), true, 'o primeiro voto foi barrado');
  assert.equal(chat.reservar('ana'), false, 'o segundo "22" seguido contou');

  relogio += INTERVALO_DO_CHAT_MS - 1;
  assert.equal(chat.reservar('ana'), false, 'o intervalo terminou cedo demais');
  relogio += 1;
  assert.equal(chat.reservar('ana'), true, 'a Ana ficou muda depois do intervalo');
});

test('o intervalo é de cada pessoa, e não do chat', () => {
  // Duas pessoas votando no mesmo segundo são dois votos legítimos — o que o
  // intervalo impede é a MESMA pessoa votar duas vezes, não a live votar.
  let relogio = 1_000_000;
  const chat = criarChatVoto({ agora: () => relogio });
  assert.equal(chat.reservar('ana'), true);
  assert.equal(chat.reservar('zeca'), true, 'a segunda pessoa foi barrada pelo voto da primeira');
  assert.equal(chat.reservar('ana'), false);
});

test('quem não tem identidade não vota', () => {
  // Sem userId não há como saber de quem é o voto nem de quem é o intervalo:
  // seria um voto sem dono, e o mesmo "22" de sempre.
  const chat = criarChatVoto({ agora: () => 1_000_000 });
  assert.equal(chat.reservar(''), false);
  assert.equal(chat.reservar(null), false);
  assert.equal(chat.reservar(undefined), false);
});

test('a virada da rodada devolve o voto a todo mundo', () => {
  // Quem votou no último segundo de uma rodada não pode começar a próxima em
  // silêncio: o intervalo é da rodada, não da noite.
  let relogio = 1_000_000;
  const chat = criarChatVoto({ agora: () => relogio });
  chat.reservar('ana');
  assert.equal(chat.reservar('ana'), false);
  chat.limpar();
  assert.equal(chat.reservar('ana'), true, 'o relógio do chat atravessou a virada da rodada');
  assert.equal(chat.desde('ana'), 0);
});

test('o intervalo é sempre um tempo, mesmo se o painel mandar lixo', () => {
  // O número vem da configuração, que é editada à mão — e um intervalo que
  // não é número deixaria entrar todo voto, que é o defeito que ele existe
  // para impedir.
  for (const ruim of ['abc', NaN, -1, null, undefined]) {
    const chat = criarChatVoto({ intervaloMs: ruim, agora: () => 1_000_000 });
    assert.equal(chat.intervaloMs, INTERVALO_DO_CHAT_MS, `intervalo "${ruim}" não caiu no padrão`);
    assert.equal(chat.reservar('ana'), true);
    assert.equal(chat.reservar('ana'), false);
  }
});

/* ------------------------------------------------------------- a chave */

test('a chave de um comentário é o autor, o instante e o texto', () => {
  /*
   * O comentário não tem `giftId`, então a chave do motor não serve: ela
   * nasceria igual para todos os comentários da mesma pessoa, e o segundo
   * "22" da Ana seria descartado como repetição do primeiro.
   */
  const um = { plataforma: 'tiktok', userId: 'ana', em: 1700000000000, texto: '22' };
  assert.equal(chaveDoComentario(um), 'chat:tiktok:ana:1700000000000:22');
  assert.equal(chaveDoComentario({ ...um }), chaveDoComentario(um), 'a reentrega contaria duas vezes');
  assert.notEqual(chaveDoComentario({ ...um, userId: 'zeca' }), chaveDoComentario(um));
  assert.notEqual(chaveDoComentario({ ...um, em: um.em + 1 }), chaveDoComentario(um));
});

test('dois "22" da mesma pessoa no mesmo segundo são dois votos', () => {
  // É o caso que a chave do motor perderia: mesmo autor, mesmo instante, e a
  // pessoa escreveu duas vezes. O texto separa os dois.
  const um = { plataforma: 'tiktok', userId: 'ana', em: 1700000000000, texto: '22' };
  assert.notEqual(chaveDoComentario(um), chaveDoComentario({ ...um, texto: '22!' }));
});

test('a chave não cresce com o texto inteiro', () => {
  // O texto entra cortado: a chave é a linha de um banco, e um comentário
  // longo não pode virar uma chave de parágrafo. Quarenta caracteres são
  // muitos para distinguir dois "22" e poucos para caber numa tabela.
  const longo = { plataforma: 'tiktok', userId: 'ana', em: 1, texto: 'a'.repeat(500) };
  assert.ok(chaveDoComentario(longo).length < 100, 'a chave guardou o comentário inteiro');
});

test('um voto escrito vale um, e o presente vale cinco ou mais', () => {
  // A diferença de valor é o desenho inteiro do sistema: quem paga, vale mais.
  assert.equal(VOTOS_DO_CHAT, 1);
  assert.equal(INTERVALO_DO_CHAT_MS, 3_000);
});

test('o texto é lido sem quebrar com o que a live manda', () => {
  // O que chega da fonte é o que a pessoa digitou: emoji, quebra de linha,
  // link. Nada disso pode derrubar a contagem.
  assert.equal(urnasCitadas(undefined, URNAS).size, 0);
  assert.equal(urnasCitadas(null, []).size, 0);
  assert.equal(acharUrna('22', null), null);
  assert.equal(alvo('voto no\nflavio 🎉 https://x.com/a'), 'u1');
});
