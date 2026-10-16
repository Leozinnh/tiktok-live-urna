import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco } from '../server/db.js';
import { criarTally, chaveDoEvento } from '../server/tally.js';
import { normalizar } from '../server/config.js';

/*
 * O motor de votos — seção 4.5 da especificação.
 *
 * A ordem do processamento é a da especificação, e ela é a razão de este
 * arquivo existir: evento -> normalizar -> deduplicar -> mapear presente em
 * urna -> gravar no banco -> aplicar na contagem em memória -> conferir a
 * liderança. Cada passo tem um teste, porque cada um já foi um defeito em
 * potencial.
 *
 * A separação que a seção 3 pede — "verdade e teatro" — aparece aqui: o
 * motor conta e não desenha. Ele diz que houve um voto e de quem ele é; quem
 * põe a mão para digitar é a fila da página.
 */

const CONFIG = normalizar({
  urnas: {
    u1: { id: 'u1', nome: 'Urna 1', numero: '22', multiplicador: 2 },
    u2: { id: 'u2', nome: 'Urna 2', numero: '13', multiplicador: 1 },
  },
  presentes: [
    { id: 'p1', nome: 'Heart Me', giftId: '1', urnaId: 'u1', votos: 1 },
    { id: 'p2', nome: 'Rosa', giftId: '2', urnaId: 'u2', votos: 1 },
    { id: 'p3', nome: 'Leão', giftId: '3', urnaId: 'u1', votos: 10 },
  ],
}).config;

function montar(config = CONFIG) {
  const db = abrirBanco(':memory:');
  const tally = criarTally({ db, config });
  tally.abrirRodada({ iniciadaEm: 1000 });
  return { db, tally };
}

const evento = (extra = {}) => ({
  plataforma: 'simulador', userId: 'ana', usuario: 'ana',
  giftId: '2', em: 1700000000000, comboIndex: 0, ...extra,
});

test('o mesmo evento duas vezes conta um voto só', () => {
  // Teste crítico 1 da seção 8. É o WebSocket que cai e volta, e é a TikTok
  // reenviando o que não foi confirmado.
  const { tally } = montar();
  assert.equal(tally.processar(evento()).contado, true);
  const segundo = tally.processar(evento());
  assert.equal(segundo.contado, false);
  assert.equal(segundo.motivo, 'duplicado');
  assert.equal(tally.estado().total, 1);
});

test('a chave de deduplicação é a da especificação', () => {
  /*
   * plataforma:userId:giftId:timestamp:comboIndex. O comboIndex entra porque
   * o combo manda VÁRIOS eventos com o mesmo instante — sem ele, a segunda
   * rosa de uma rajada seria descartada como repetição da primeira.
   */
  assert.equal(
    chaveDoEvento({ plataforma: 'tiktok', userId: 'ana', giftId: '2', em: 5, comboIndex: 3 }),
    'tiktok:ana:2:5:3',
  );
  assert.notEqual(
    chaveDoEvento({ plataforma: 'tiktok', userId: 'ana', giftId: '2', em: 5, comboIndex: 1 }),
    chaveDoEvento({ plataforma: 'tiktok', userId: 'ana', giftId: '2', em: 5, comboIndex: 2 }),
  );
});

test('o combo multiplica os votos, e não as entradas na fila', () => {
  /*
   * Teste crítico 2 da seção 8: combo 5 são 5 votos e UMA entrada na fila.
   * Cinco mãos em fila para o mesmo presente seria a fila crescendo por um
   * motivo que não existe — quem mandou cinco rosas de uma vez mandou um
   * presente, não cinco.
   */
  const { tally } = montar();
  const r = tally.processar(evento({ combo: 5 }));
  assert.equal(r.contado, true);
  assert.equal(r.votos, 5);
  assert.equal(r.animar, true, 'o combo devia pedir UMA animação');
  assert.equal(tally.estado().total, 5);
});

test('o multiplicador da urna entra na conta', () => {
  // A urna do Heart Me vale 2 nesta configuração; dez deles valem vinte.
  const { tally } = montar();
  tally.processar(evento({ giftId: '1', combo: 10 }));
  assert.equal(tally.estado().urnas.find((u) => u.id === 'u1').votos, 20);
});

test('presente sem mapeamento não conta, e o motivo fica registrado', () => {
  /*
   * Seção 7: presente sem mapeamento é registrado no log, não conta voto, e
   * o admin é notificado. Contar para a urna errada seria pior do que não
   * contar — o placar subiria para quem não recebeu o presente.
   */
  const { tally } = montar();
  const r = tally.processar(evento({ giftId: '999' }));
  assert.equal(r.contado, false);
  assert.equal(r.motivo, 'sem-mapeamento');
  assert.equal(tally.estado().total, 0);
  assert.equal(tally.avisos().length, 1);
  assert.match(tally.avisos()[0].texto, /999/);
});

test('presente desativado no painel não conta', () => {
  const { tally } = montar(normalizar({
    presentes: [{ id: 'p2', nome: 'Rosa', giftId: '2', urnaId: 'u2', votos: 1, ativo: false }],
  }).config);
  const r = tally.processar(evento());
  assert.equal(r.contado, false);
  assert.equal(r.motivo, 'presente-inativo');
});

test('o voto entra na contagem ANTES de a animação ser pedida', () => {
  /*
   * A seção 3 é explícita: o placar nunca espera a animação. O voto vale no
   * instante em que chega; a mão digitando é o espetáculo, e o espetáculo
   * pode atrasar ou degradar sem que o número mude.
   */
  const { tally } = montar();
  const r = tally.processar(evento());
  assert.equal(r.contado, true);
  assert.equal(tally.estado().total, 1, 'o número não subiu junto com o voto');
  assert.equal(r.animar, true);
});

test('a ultrapassagem é anunciada com quem assumiu a liderança', () => {
  /*
   * O clímax da disputa: a urna que estava atrás passa na frente. O motor
   * diz QUE aconteceu e QUEM passou; o texto na tela e o som são da página,
   * e saem da configuração do placar.
   */
  const { tally } = montar();
  assert.equal(tally.processar(evento({ giftId: '2', comboIndex: 1 })).lideranca, null,
    'a primeira urna a pontuar não "assumiu" nada');

  // O Heart Me vale 2 nesta configuração: a urna 1 passa de 0 para 2 e assume.
  const r = tally.processar(evento({ giftId: '1', comboIndex: 2, em: 2 }));
  assert.equal(r.lideranca?.tipo, 'virada');
  assert.equal(r.lideranca.urnaId, 'u1');
  assert.equal(r.lideranca.anterior, 'u2');
});

test('o empate é anunciado como empate', () => {
  const { tally } = montar();
  tally.processar(evento({ giftId: '1', comboIndex: 1, em: 1 })); // u1 = 2
  const r = tally.processar(evento({ giftId: '2', comboIndex: 2, em: 2 }));
  assert.equal(r.lideranca, null, 'a urna que só alcançou não virou líder');
  const r2 = tally.processar(evento({ giftId: '2', comboIndex: 3, em: 3 })); // u2 = 2
  assert.equal(r2.lideranca?.tipo, 'empate');
});

test('a rodada fechada recusa voto', () => {
  /*
   * Seção 6.3: os votos recebidos ANTES do fechamento são sempre contados, e
   * os que chegam depois não. A política padrão é `processar-recebidos`.
   */
  const { tally } = montar();
  tally.processar(evento({ comboIndex: 1 }));
  tally.fecharRodada({ em: 2000 });
  const r = tally.processar(evento({ comboIndex: 2, em: 2 }));
  assert.equal(r.contado, false);
  assert.equal(r.motivo, 'rodada-fechada');
  assert.equal(tally.estado().total, 1, 'o voto que chegou depois entrou na conta');
});

test('a rodada nova zera a contagem e começa outra no banco', () => {
  const { tally } = montar();
  tally.processar(evento({ comboIndex: 1 }));
  const primeira = tally.estado().rodada.id;
  tally.fecharRodada({ em: 2000 });
  tally.abrirRodada({ iniciadaEm: 3000 });
  assert.notEqual(tally.estado().rodada.id, primeira);
  assert.equal(tally.estado().total, 0);
});

test('a contagem reconstruída do banco bate com a da memória', () => {
  /*
   * Teste crítico 5 da seção 8: recarregar a página no meio da rodada
   * reconstrói tudo do banco. É por isso que o motor sabe se reconstruir —
   * a página nova não recebe o histórico por push, ela pede o estado.
   */
  const { db, tally } = montar();
  tally.processar(evento({ giftId: '1', comboIndex: 1, usuario: 'ana' }));
  tally.processar(evento({ giftId: '2', comboIndex: 2, usuario: 'bia', em: 2 }));

  const outro = criarTally({ db, config: CONFIG });
  outro.reconstruir();
  assert.deepEqual(
    outro.estado().urnas.map((u) => [u.id, u.votos]),
    tally.estado().urnas.map((u) => [u.id, u.votos]),
  );
  assert.equal(outro.estado().total, tally.estado().total);
  assert.deepEqual(outro.estado().apoiadores, tally.estado().apoiadores);
});

test('e a chave de deduplicação sobrevive à reconstrução', () => {
  // Sem isto, o servidor reiniciado no meio da live aceitaria de novo um
  // evento que a TikTok reenvia, e o voto contaria duas vezes.
  const { db, tally } = montar();
  tally.processar(evento());
  const outro = criarTally({ db, config: CONFIG });
  outro.reconstruir();
  assert.equal(outro.processar(evento()).contado, false);
});

test('o estado traz o que o placar precisa desenhar', () => {
  const { tally } = montar();
  tally.processar(evento({ giftId: '1', comboIndex: 1, usuario: 'ana' }));
  tally.processar(evento({ giftId: '2', comboIndex: 2, usuario: 'bia', em: 2 }));

  const e = tally.estado();
  assert.equal(e.total, 3, 'u1 vale 2 e u2 vale 1');
  assert.equal(e.rodada.aberta, true);
  const u1 = e.urnas.find((u) => u.id === 'u1');
  assert.equal(u1.votos, 2);
  assert.equal(u1.numero, '22');
  assert.equal(u1.percentual, Math.round((2 / 3) * 100));
  assert.equal(u1.lider, true);
  assert.equal(e.urnas.find((u) => u.id === 'u2').lider, false);
  assert.deepEqual(e.apoiadores.map((a) => a.usuario), ['ana', 'bia']);
});

test('o último voto recebido aparece no estado', () => {
  // O cartão do placar mostra "último voto recebido" — é o que faz a tela
  // parecer viva entre uma ultrapassagem e outra.
  const { tally } = montar();
  tally.processar(evento({ usuario: 'ana' }));
  tally.processar(evento({ usuario: 'bia', comboIndex: 9, em: 9 }));
  const u2 = tally.estado().urnas.find((u) => u.id === 'u2');
  assert.equal(u2.ultimoVoto.usuario, 'bia');
});

test('o evento sem remetente não derruba o motor', () => {
  // A TikTok às vezes manda presente sem apelido — conta anônima, ou campo
  // que não veio. O voto vale; o nome é que fica em branco, e o ranking não
  // inventa uma linha vazia.
  const { tally } = montar();
  const r = tally.processar({ plataforma: 'tiktok', giftId: '2', em: 7 });
  assert.equal(r.contado, true);
  assert.equal(tally.estado().total, 1);
  assert.deepEqual(tally.estado().apoiadores, [], 'o ranking ganhou uma linha sem nome');
});

test('o combate a lixo: um evento sem giftId não conta', () => {
  const { tally } = montar();
  const r = tally.processar({ plataforma: 'tiktok', userId: 'ana', em: 1 });
  assert.equal(r.contado, false);
  assert.equal(r.motivo, 'evento-invalido');
});

/*
 * O voto que o chat resgatou.
 *
 * O presente que não tem urna no painel não conta sozinho — mas também não
 * pode sumir: quem pagou por ele merece que o voto aconteça. Quem decide a
 * urna é o número que a pessoa escreve no chat, e o caminho daqui para baixo
 * é o MESMO do presente mapeado: deduplicar, gravar, somar, conferir a
 * liderança. O que muda é só de onde veio o número da urna.
 */

test('o número do chat conta o voto na urna daquele número', () => {
  const { tally } = montar();
  // O giftId '999' não existe na configuração: é o presente que a TikTok
  // inventou ontem e o painel ainda não conhece.
  const r = tally.contarPeloNumero(evento({ giftId: '999', giftNome: 'Diamante' }), { numero: '22' });
  assert.equal(r.contado, true);
  assert.equal(r.urnaId, 'u1');
  assert.equal(r.numero, '22', 'a mão não sabe que número digitar');
  /*
   * Cinco votos do piso, vezes o multiplicador 2 da urna u1, que é a mesma
   * conta de qualquer presente. O resgatado não tem preço no painel — não tem
   * nem mapeamento —, e por isso vale o piso.
   */
  assert.equal(tally.estado().total, 10, 'o multiplicador da urna não foi aplicado');
});

test('o presente resgatado sai com o nome que a TikTok deu a ele', () => {
  /*
   * A etiqueta da fila escreve o nome do presente, e um presente sem
   * mapeamento não tem nome no painel — o único nome que existe é o que veio
   * da live. Sem isto, a fila mostraria "undefined" no lugar do presente.
   */
  const { tally } = montar();
  const r = tally.contarPeloNumero(evento({ giftId: '999', giftNome: 'Diamante' }), { numero: '22' });
  assert.equal(r.presente, 'Diamante');
});

test('o presente resgatado sem nome conhecido não vira etiqueta vazia', () => {
  const { tally } = montar();
  const r = tally.contarPeloNumero(evento({ giftId: '999' }), { numero: '22' });
  assert.equal(r.contado, true);
  assert.ok(r.presente.trim(), 'a etiqueta da fila ficaria em branco');
});

test('o combo do presente resgatado vale os votos que ele pagou', () => {
  // Quem mandou cinco diamantes mandou cinco presentes, e o resgate não pode
  // transformar cinco em um. O combo multiplica o valor do presente, e não o
  // número de eventos: a mão digita uma vez, e o placar sobe cinco vezes.
  const { tally } = montar();
  const r = tally.contarPeloNumero(evento({ giftId: '999', combo: 5 }), { numero: '13' });
  assert.equal(r.votos, 25, 'o resgate perdeu o combo do presente');
  assert.equal(r.animar, true, 'um evento é uma animação, mesmo valendo cinco');
  assert.equal(tally.estado().total, 25);
});

test('o número errado, ou de urna desligada, não conta nada', () => {
  const { tally } = montar();
  assert.equal(tally.contarPeloNumero(evento({ giftId: '999' }), { numero: '99' }).contado, false);
  assert.equal(tally.contarPeloNumero(evento({ giftId: '999' }), { numero: '99' }).motivo, 'numero-sem-urna');
  assert.equal(tally.estado().total, 0);
});

test('o voto resgatado não conta duas vezes', () => {
  /*
   * O chat reentrega, e a mão do espectador treme: a mesma pessoa pode
   * escrever "22" duas vezes, ou a reconexão pode reenviar o comentário. A
   * chave do voto é a do PRESENTE — é ele que vale uma vez só, e não o
   * comentário.
   */
  const { tally } = montar();
  const e = evento({ giftId: '999', comboIndex: 7 });
  assert.equal(tally.contarPeloNumero(e, { numero: '22' }).contado, true);
  const depoisDoPrimeiro = tally.estado().total;   // 2: a urna u1 multiplica por 2
  const segundo = tally.contarPeloNumero(e, { numero: '22' });
  assert.equal(segundo.contado, false);
  assert.equal(segundo.motivo, 'duplicado');
  assert.equal(tally.estado().total, depoisDoPrimeiro, 'o mesmo presente contou duas vezes');
});

test('o voto resgatado com a rodada fechada não conta', () => {
  // O número chega depois de a rodada encerrar. Contar aqui seria mexer num
  // placar que já foi mostrado como final.
  const { tally } = montar();
  tally.fecharRodada({ em: 2000 });
  const r = tally.contarPeloNumero(evento({ giftId: '999' }), { numero: '22' });
  assert.equal(r.contado, false);
  assert.equal(r.motivo, 'rodada-fechada');
});

test('o voto resgatado também move a liderança', () => {
  // Se ele não passasse pelo mesmo caminho do voto normal, a tela não
  // anunciaria a virada — e o voto que decidiu a rodada seria o único mudo.
  const { tally } = montar();
  tally.processar(evento({ usuario: 'ana' }));                       // u2 = 1
  const r = tally.contarPeloNumero(evento({ giftId: '999', em: 42 }), { numero: '22' });
  assert.equal(r.contado, true);
  assert.equal(r.lideranca?.tipo, 'virada', 'a virada não foi detectada');
  assert.equal(r.lideranca?.urnaId, 'u1');
});

/* ------------------------------------ o voto que o chat escreveu */

/*
 * O voto escrito no chat.
 *
 * O pedido do Leonardo, literal: "quando alguém comentar 'bolsonaro, 22,
 * flavio e tal' automaticamente computar 1 voto pro candidato". Quem decide a
 * urna é o `acharUrna` do chat-voto.js — o texto tem que citar UMA urna só —,
 * e essa regra já está presa em chat-voto.test.js. O que se prende aqui é que
 * o voto escrito entra pelo MESMO caminho do presente: deduplica, grava,
 * soma, confere a liderança. Um terceiro caminho que esquecesse um desses
 * passos seria o voto que conta e não move o placar.
 */

/** O comentário que virou voto, já com a urna decidida pelo `acharUrna`. */
const escrito = (extra = {}) => evento({ userId: 'zeca', usuario: 'Zeca', ...extra });

test('o voto escrito no chat conta, e sai com a cara de um voto', () => {
  const { tally } = montar();
  const r = tally.contarPeloChat(escrito({ em: 1 }), { urnaId: 'u1', chave: 'chat:simulador:zeca:1:22' });
  assert.equal(r.contado, true);
  assert.equal(r.urnaId, 'u1');
  assert.equal(r.numero, '22', 'a mão não sabe que número digitar');
  assert.equal(r.origem, 'chat', 'o voto escrito se disfarçou de presente');
  assert.equal(r.votos, 2, 'o multiplicador da urna não foi aplicado ao voto escrito');
  assert.equal(tally.estado().total, 2);
});

test('o voto escrito vale menos que o presente', () => {
  /*
   * A diferença de valor é o desenho inteiro: quem paga, vale mais. O
   * presente de uma moeda vale cinco votos (vezes o multiplicador da urna); o
   * comentário vale um. Se o escrito valesse o mesmo, ninguém teria motivo
   * para mandar presente.
   */
  /*
   * Os presentes daqui NÃO têm `votos` escrito: quem decide é o preço em
   * moedas, que é a regra nova. A configuração do resto do arquivo fixa
   * `votos: 1` de propósito — ela é antiga, e mexer nela mudaria a conta de
   * uma dúzia de testes que não têm nada a ver com o preço.
   */
  const { tally } = montar(normalizar({
    urnas: CONFIG.urnas,
    presentes: [
      { id: 'p1', nome: 'Heart Me', giftId: '1', moedas: 1, urnaId: 'u1' },
      { id: 'p2', nome: 'Diamante', giftId: '9', moedas: 100, urnaId: 'u1' },
    ],
  }).config);
  const barato = tally.processar(evento({ usuario: 'ana', giftId: '1', em: 1 }));
  const caro = tally.processar(evento({ usuario: 'bia', giftId: '9', comboIndex: 1, em: 2 }));
  const doZeca = tally.contarPeloChat(escrito({ em: 3 }), { urnaId: 'u1', chave: 'chat:zeca:3' });

  assert.ok(doZeca.votos < barato.votos,
    `o voto de graça vale ${doZeca.votos} e o presente mais barato vale ${barato.votos}`);
  assert.ok(barato.votos < caro.votos,
    `o Heart Me vale ${barato.votos} e o diamante vale ${caro.votos}`);
});

test('o voto escrito leva o nome do caminho, e não o de um presente', () => {
  /*
   * É este nome que a etiqueta da mão escreve na cena. Quem votou pelo chat
   * não mandou nada, e a etiqueta dizendo "Rosa" faria a live inteira
   * procurar uma rosa que ninguém mandou.
   */
  const { tally } = montar();
  const r = tally.contarPeloChat(escrito(), { urnaId: 'u2', chave: 'chat:zeca:1' });
  assert.equal(r.presente, 'Voto no chat');
  const u2 = tally.estado().urnas.find((u) => u.id === 'u2');
  assert.equal(u2.ultimoVoto.presente, 'Voto no chat');
});

test('o mesmo comentário não conta duas vezes', () => {
  // O WebSocket cai e volta, e a fonte reentrega o que não foi confirmado. A
  // chave do comentário é o autor mais o instante mais o texto, e ela é quem
  // impede o mesmo "22" de valer dois votos na reconexão.
  const { tally } = montar();
  const chave = 'chat:simulador:zeca:1:22';
  assert.equal(tally.contarPeloChat(escrito({ em: 1 }), { urnaId: 'u1', chave }).contado, true);
  const depois = tally.estado().total;
  const segundo = tally.contarPeloChat(escrito({ em: 1 }), { urnaId: 'u1', chave });
  assert.equal(segundo.contado, false);
  assert.equal(segundo.motivo, 'duplicado');
  assert.equal(tally.estado().total, depois, 'o mesmo comentário contou duas vezes');
});

test('a repetição do comentário não vira aviso', () => {
  // Pela mesma razão do presente: a deduplicação é o sistema funcionando, e
  // uma live que reconecta reentrega eventos o tempo todo. A repetição que
  // merece registro é a do INTERVALO, e essa é do hub.
  const { tally } = montar();
  const chave = 'chat:simulador:zeca:1:22';
  tally.contarPeloChat(escrito({ em: 1 }), { urnaId: 'u1', chave });
  const antes = tally.estado().avisos.length;
  tally.contarPeloChat(escrito({ em: 1 }), { urnaId: 'u1', chave });
  assert.equal(tally.estado().avisos.length, antes);
});

test('o voto escrito com a rodada fechada avisa que a rodada fechou', () => {
  /*
   * A mesma promessa da linha do presente recusado: quem escreveu "22" numa
   * rodada encerrada e viu o placar parado precisa de uma resposta. Sem o
   * aviso, o voto escrito seria a única recusa muda do sistema.
   */
  const { tally } = montar();
  tally.fecharRodada({ em: 2000, motivo: 'manual' });
  const antes = tally.estado().avisos.length;
  const r = tally.contarPeloChat(escrito(), { urnaId: 'u1', chave: 'chat:zeca:1' });
  assert.equal(r.contado, false);
  assert.equal(r.motivo, 'rodada-fechada');
  assert.equal(tally.estado().avisos.length, antes + 1, 'a recusa não gerou aviso nenhum');
  assert.match(tally.estado().avisos.at(-1).texto, /chat/i, 'o aviso não diz de que caminho veio');
});

test('o voto escrito para urna que não está na disputa avisa', () => {
  // A urna desligada no painel não recebe voto por nenhum caminho — e o
  // aviso diz QUAL, que é a pergunta que o operador vai fazer.
  const { tally } = montar();
  const inexistente = tally.contarPeloChat(escrito(), { urnaId: 'u9', chave: 'chat:zeca:1' });
  assert.equal(inexistente.contado, false);
  assert.equal(inexistente.motivo, 'urna-inativa');
  assert.match(tally.estado().avisos.at(-1).texto, /u9/);

  const desligada = montar(normalizar({
    urnas: {
      u1: { id: 'u1', nome: 'Urna 1', numero: '22', multiplicador: 2 },
      u2: { id: 'u2', nome: 'Urna 2', numero: '13', ativo: false },
    },
    presentes: [],
  }).config);
  const r = desligada.tally.contarPeloChat(escrito(), { urnaId: 'u2', chave: 'chat:zeca:1' });
  assert.equal(r.contado, false);
  assert.equal(r.motivo, 'urna-inativa');
});

test('o voto escrito também move a liderança', () => {
  // Sem passar pelo mesmo `contar`, a tela não anunciaria a virada — e o voto
  // que decidiu a rodada seria o único sem clímax.
  const { tally } = montar();
  tally.processar(evento({ usuario: 'ana' }));                       // u2 = 1
  const r = tally.contarPeloChat(escrito({ em: 42 }), { urnaId: 'u1', chave: 'chat:zeca:42' });
  assert.equal(r.contado, true);
  assert.equal(r.lideranca?.tipo, 'virada', 'a virada não foi detectada');
  assert.equal(r.lideranca?.urnaId, 'u1');
});

test('o voto escrito entra no ranking de apoiadores como quem votou', () => {
  /*
   * Quem escreveu no chat é um apoiador, e o monitor "quem mais presentou"
   * conta por pessoa. Deixá-lo fora faria o voto de graça sumir do ranking
   * justamente para quem não tem moeda — e o ranking é o que dá nome a quem
   * está do outro lado da tela.
   */
  const { tally } = montar();
  tally.contarPeloChat(escrito({ em: 1 }), { urnaId: 'u2', chave: 'chat:zeca:1' });
  assert.deepEqual(tally.estado().apoiadores.map((a) => a.usuario), ['Zeca']);
});

test('o voto escrito sobrevive à reconstrução do banco', () => {
  // O reinício no meio da live é o caso que o banco existe para cobrir. Se o
  // voto escrito só vivesse em memória, ele sumiria do placar no primeiro
  // reencontro da noite — e o placar reconstruído seria menor que o mostrado.
  const { db, tally } = montar();
  tally.contarPeloChat(escrito({ em: 1 }), { urnaId: 'u1', chave: 'chat:zeca:1' });
  const outro = criarTally({ db, config: CONFIG });
  outro.reconstruir();
  assert.equal(outro.estado().total, tally.estado().total);
  assert.equal(outro.estado().urnas.find((u) => u.id === 'u1').ultimoVoto.presente, 'Voto no chat');
});

/* ------------------------------------ a recusa que não avisava ninguém */

/*
 * Estas duas recusas eram MUDAS: o motor dizia "não contou" e não contava
 * para ninguém. O Leonardo mandou uma Rosa pelo painel com a rodada fechada,
 * não ouviu voz nenhuma, não viu voto nenhum e não teve onde ler por quê.
 *
 * Um presente que não conta não pode ser um presente que sumiu: ou o placar
 * mostra o voto, ou o painel mostra a razão. É a mesma regra dos outros
 * avisos do motor — "presente 999 não tem mapeamento" já existia pelo mesmo
 * motivo.
 */

test('o presente que chega com a rodada fechada avisa, em vez de sumir', () => {
  const { tally } = montar();
  tally.fecharRodada({ em: 2000, motivo: 'manual' });
  const antes = tally.estado().avisos.length;
  const r = tally.processar(evento({ giftNome: 'Rosa' }));
  assert.equal(r.contado, false);
  assert.equal(r.motivo, 'rodada-fechada');
  const avisos = tally.estado().avisos;
  assert.equal(avisos.length, antes + 1, 'a recusa não gerou aviso nenhum');
  assert.match(avisos.at(-1).texto, /rodada .{0,6}fechada/i, `o aviso não diz o motivo: ${avisos.at(-1).texto}`);
});

test('o aviso da rodada fechada diz QUAL presente não contou', () => {
  // Sem o nome, o aviso não responde a pergunta que o operador vai fazer ao
  // ver o placar parado: "foi o meu presente?".
  const { tally } = montar();
  tally.fecharRodada({ em: 2000, motivo: 'manual' });
  tally.processar(evento({ giftNome: 'Rosa' }));
  assert.match(tally.estado().avisos.at(-1).texto, /Rosa/);
});

test('o presente desativado avisa que está desativado', () => {
  const { tally } = montar(normalizar({
    urnas: CONFIG.urnas,
    presentes: [
      { id: 'p1', nome: 'Heart Me', giftId: '1', urnaId: 'u1', votos: 1 },
      { id: 'p2', nome: 'Rosa', giftId: '2', urnaId: 'u2', votos: 1, ativo: false },
    ],
  }).config);
  const r = tally.processar(evento());
  assert.equal(r.motivo, 'presente-inativo');
  const aviso = tally.estado().avisos.at(-1).texto;
  assert.match(aviso, /Rosa/);
  assert.match(aviso, /desativad|desligad/i, `o aviso não diz o motivo: ${aviso}`);
});

test('a repetição NÃO vira aviso: ela é o sistema funcionando', () => {
  /*
   * O contrário dos dois acima, e é uma decisão: a deduplicação existe para
   * o placar não contar duas vezes o mesmo presente, e uma live que
   * reconecta reentrega eventos o tempo todo. Encher o painel de avisos
   * corretos é o caminho mais curto para ninguém ler os avisos.
   */
  const { tally } = montar();
  tally.processar(evento());
  const antes = tally.estado().avisos.length;
  assert.equal(tally.processar(evento()).motivo, 'duplicado');
  assert.equal(tally.estado().avisos.length, antes);
});
