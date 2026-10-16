import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco } from '../server/db.js';
import { criarTally } from '../server/tally.js';
import { criarHub } from '../server/hub.js';
import { criarSimulador } from '../server/sources/simulator.js';
import { normalizar } from '../server/config.js';
import { ACOES_SOCIAIS } from '../public/js/admin/abas.js';
import { LIMIAR_DA_CURTIDA } from '../server/narracao.js';

/*
 * O hub — seção 5 da especificação, o protocolo WebSocket.
 *
 * O transporte já está provado em servidor-ws.test.js: o handshake, os
 * quadros, os pedaços. Aqui é o que o servidor FAZ com o que chega, e o que
 * ele decide contar para quem.
 *
 * O cliente dos testes é um objeto com um `enviar` que anota o que passou.
 * Não é um dublê de navegador — é a interface que o hub de verdade usa, com
 * o socket trocado por um array. O que o navegador faz com esses bytes é
 * assunto da sonda, não daqui.
 *
 * A separação que este arquivo protege é a da seção 3: o motor conta e não
 * desenha. O hub é quem traduz a contagem em mensagens, e é aqui que a
 * página de transmissão fica sabendo de um voto.
 */

const CONFIG = normalizar({
  urnas: {
    u1: { id: 'u1', nome: 'Urna 1', numero: '22', multiplicador: 2 },
    u2: { id: 'u2', nome: 'Urna 2', numero: '13', multiplicador: 1 },
  },
  presentes: [
    { id: 'p1', nome: 'Heart Me', giftId: '1', urnaId: 'u1', votos: 1 },
    { id: 'p2', nome: 'Rosa', giftId: '2', urnaId: 'u2', votos: 1 },
  ],
  rodada: { duracaoSegundos: 300 },
}).config;

function montar({ agora, voz = null, config = CONFIG, log = logFalso() } = {}) {
  const db = abrirBanco(':memory:');
  const tally = criarTally({ db, config });
  tally.abrirRodada({ iniciadaEm: 1000 });
  const fonte = criarSimulador();
  const relogio = { t: agora ?? 100000 };
  const hubs = [];
  const hub = criarHub({
    tally,
    fonte,
    config,
    voz,
    log,
    agora: () => relogio.t,
    aoSalvar: (nova) => hubs.push(nova),
  });
  fonte.iniciar();
  return {
    db, tally, fonte, hub, relogio, log,
    salvas: hubs,
    avancar: (ms) => { relogio.t += ms; },
  };
}

/**
 * Um cliente de mentira, do tamanho exato da interface que o hub usa.
 *
 * O `papel` é o que o `upgrade` do HTTP descobre na URL e entrega junto com o
 * socket — é assim que a página `/admin` e a página da transmissão se
 * distinguem sem que ninguém precise se anunciar.
 */
function cliente(papel = 'broadcast') {
  const recebidas = [];
  return {
    papel,
    recebidas,
    enviar: (texto) => recebidas.push(JSON.parse(texto)),
    ultima: () => recebidas[recebidas.length - 1],
    de: (t) => recebidas.filter((m) => m.tipo === t),
  };
}

const falar = (c, msg) => c.receber(JSON.stringify(msg));

/**
 * Um log de mentira, do tamanho exato do que o hub usa.
 *
 * Como o relógio e a voz, ele é INJETADO: a suíte não pode escrever no
 * terminal de quem roda `npm test` nem no arquivo do dia. O `tem` é a
 * pergunta que quase todo teste faz — "o log contou esta parte da história?".
 */
function logFalso() {
  const linhas = [];
  const anotar = (nivel) => (assunto, texto) => linhas.push({ nivel, assunto, texto });
  return {
    linhas,
    info: anotar('info'),
    aviso: anotar('aviso'),
    erro: anotar('erro'),
    tem: (padrao) => linhas.some((l) => padrao.test(l.texto)),
    texto: () => linhas.map((l) => `[${l.nivel}] ${l.assunto}: ${l.texto}`).join('\n'),
  };
}

/* ------------------------------------------------------- entrada e retrato */

test('quem chega pede o retrato, e recebe o retrato inteiro', () => {
  const { hub, tally } = montar();
  const c = hub.conectar(cliente());
  falar(c, { tipo: 'hello', papel: 'broadcast' });
  const m = c.ultima();
  assert.equal(m.tipo, 'state.full');
  assert.equal(m.payload.config.urnas.u1.numero, '22');
  assert.equal(m.payload.tally.total, 0);
  assert.equal(m.payload.rodada.aberta, true);
  assert.deepEqual(m.payload.votosRecentes, []);
  assert.equal(tally.rodadaId, m.payload.rodada.id);
});

test('a página de transmissão NÃO recebe os avisos do painel', () => {
  /*
   * A seção 1 é explícita: o painel administrativo nunca aparece na captura.
   * Os avisos são o log de diagnóstico — "presente 999 não tem mapeamento" —
   * e são exatamente o tipo de texto que não pode vazar para a tela que o
   * OBS está gravando.
   */
  const { hub, fonte } = montar();
  const c = hub.conectar(cliente('broadcast'));
  fonte.emitir({ plataforma: 'simulador', userId: 'ana', giftId: '999', em: 1 });
  falar(c, { tipo: 'state.request' });
  assert.deepEqual(c.ultima().payload.tally.avisos, []);
  assert.equal(c.ultima().payload.fonte, undefined);
});

test('o painel recebe os avisos e o estado da fonte, que são o trabalho dele', () => {
  // O contrário do teste acima, e o motivo de o hub distinguir os dois: o
  // painel existe para mostrar o que deu errado.
  const { hub, fonte } = montar();
  const c = hub.conectar(cliente('admin'));
  fonte.emitir({ plataforma: 'simulador', userId: 'ana', giftId: '999', em: 1 });
  falar(c, { tipo: 'state.request' });
  assert.equal(c.ultima().payload.tally.avisos.length, 1);
  assert.match(c.ultima().payload.tally.avisos[0].texto, /999/);
  assert.equal(c.ultima().payload.fonte.modo, 'simulador');
  assert.equal(c.ultima().payload.fonte.conectado, true);
});

test('um pedido de retrato antes do hello também é atendido', () => {
  // A página pode reconectar no meio de uma rodada sem repetir a saudação.
  // Recusar aqui deixaria a tela preta até alguém recarregar na mão.
  const { hub } = montar();
  const c = hub.conectar(cliente());
  falar(c, { tipo: 'state.request' });
  assert.equal(c.ultima().tipo, 'state.full');
});

/* ------------------------------------------------------------- o voto */

test('um presente vira contagem e animação para todo mundo', () => {
  /*
   * Os dois passos 8 da seção 4.5, nesta ordem: `vote.counted` — o fato —,
   * `vote.animate` para a fila, e só então `tally.update`, o placar.
   *
   * A ordem entre os dois últimos NÃO é a que a seção 4.5 escreve, e a troca
   * foi medida, não escolhida no gosto. O placar da tela é deliberadamente
   * mais lento que o do servidor: o número sobe quando a cédula cai, e não
   * quando o presente chega (ver `sincronizarContagem` em public/js/ao-vivo.js).
   * Enquanto o placar vinha PRIMEIRO, existia uma janela real — medida a
   * 500 ms de um presente — em que a página já sabia da contagem nova e ainda
   * não sabia que havia um voto a caminho. O passo do ticker rodava nessa
   * janela, via a fila vazia, e subia o número um quadro ANTES de a mão
   * aparecer. Com a animação primeiro, "fila vazia" passa a significar mesmo
   * "nada em voo", que é a premissa de que a auto-correção depende.
   *
   * O placar não atrasa por causa disto: as duas mensagens saem no mesmo
   * tick, e quem espera é a mão, nunca o número.
   */
  const { hub, fonte } = montar();
  const a = hub.conectar(cliente('broadcast'));
  const b = hub.conectar(cliente('admin'));
  fonte.emitir({ plataforma: 'simulador', userId: 'ana', usuario: 'Ana', giftId: '2', em: 5, comboIndex: 1 });

  const tipos = a.recebidas.map((m) => m.tipo);
  assert.deepEqual(tipos, ['vote.counted', 'vote.animate', 'tally.update']);
  assert.deepEqual(b.recebidas.map((m) => m.tipo), tipos, 'o painel ficou sem saber do voto');

  assert.equal(a.de('tally.update')[0].payload.total, 1);
  assert.equal(a.de('vote.counted')[0].payload.usuario, 'Ana');
  assert.equal(a.de('vote.counted')[0].payload.presente, 'Rosa');
});

test('a animação leva o número e o candidato, e não só a urna', () => {
  /*
   * A urna deste projeto é uma MÁQUINA, e não um candidato — é a regra que
   * nasceu do defeito dos dois votos iguais. A mão que vai digitar escolhe
   * uma máquina livre na hora de animar; o que ela digita é o número DESTE
   * payload, e a ficha que a urna mostra é o candidato DESTE payload. Se a
   * página tivesse que deduzir isso da configuração, uma edição no painel
   * entre o voto e a animação faria a mão digitar o número errado.
   */
  const { hub, fonte } = montar();
  const c = hub.conectar(cliente('broadcast'));
  fonte.emitir({ plataforma: 'simulador', userId: 'ana', giftId: '2', em: 5, comboIndex: 1 });
  const a = c.de('vote.animate')[0].payload;
  assert.equal(a.urnaId, 'u2', 'a animação perdeu de quem é o voto');
  assert.equal(a.numero, '13');
  assert.deepEqual(a.candidato, CONFIG.urnas.u2.candidato);
  assert.equal(a.votos, 1);
  assert.equal(typeof a.prioridade, 'number');
});

test('a animação leva o nome do presente, e não só o id dele', () => {
  /*
   * A fila do rodapé escreve "Rosa" na etiqueta de quem está esperando, e
   * quem espera olha para aquela etiqueta para saber que o presente dele foi
   * recebido. O id sozinho faria a página procuRAR o nome na configuração —
   * e uma edição no painel entre o voto e a animação trocaria o nome na
   * etiqueta de um voto que já aconteceu.
   *
   * O nome já viaja no `vote.counted`; aqui é o outro consumidor, e é o
   * caminho que a tela de transmissão realmente usa.
   */
  const { hub, fonte } = montar();
  const c = hub.conectar(cliente('broadcast'));
  fonte.emitir({ plataforma: 'simulador', userId: 'ana', usuario: 'Ana', giftId: '2', em: 5, comboIndex: 1 });
  assert.equal(c.de('vote.animate')[0].payload.presente, 'Rosa');
});

test('a atualização do placar traz a diferença entre primeiro e segundo', () => {
  /*
   * A faixa superior mostra a diferença, e mostrá-la é o que transforma dois
   * números em uma disputa. Ela é calculada aqui, e não no navegador, para a
   * página de transmissão não precisar saber ordenar nada.
   */
  const { hub, fonte } = montar();
  const c = hub.conectar(cliente('broadcast'));
  fonte.emitir({ plataforma: 'simulador', userId: 'ana', giftId: '1', em: 5, comboIndex: 1 }); // u1 = 2
  fonte.emitir({ plataforma: 'simulador', userId: 'bia', giftId: '2', em: 6, comboIndex: 2 }); // u2 = 1
  const t = c.de('tally.update').pop().payload;
  assert.equal(t.total, 3);
  assert.equal(t.diferenca, 1);
  assert.equal(t.lider, 'u1');
  assert.equal(t.urnas.find((u) => u.id === 'u1').percentual, 67);
});

test('sem voto nenhum, a diferença é zero e não NaN', () => {
  // `undefined - undefined` impresso na faixa superior da live é o defeito
  // que só aparece no primeiro segundo da transmissão, quando ainda não
  // votou ninguém.
  const { hub } = montar();
  const c = hub.conectar(cliente('broadcast'));
  falar(c, { tipo: 'state.request' });
  assert.equal(c.ultima().payload.tally.diferenca, 0);
});

test('a ultrapassagem vira um aviso separado', () => {
  /*
   * A seção 4.6: a faixa mostra "{urna} ASSUMIU A LIDERANÇA!". O motor já
   * sabe quando isso acontece; o hub só precisa não perder a informação no
   * caminho, porque uma virada perdida é o clímax da disputa que não toca.
   */
  const { hub, fonte } = montar();
  const c = hub.conectar(cliente('broadcast'));
  fonte.emitir({ plataforma: 'simulador', userId: 'ana', giftId: '2', em: 5, comboIndex: 1 });
  assert.equal(c.de('lead.changed').length, 0, 'a primeira urna a pontuar não assumiu nada');
  fonte.emitir({ plataforma: 'simulador', userId: 'bia', giftId: '1', em: 6, comboIndex: 2 });
  const l = c.de('lead.changed')[0].payload;
  assert.equal(l.urnaId, 'u1');
  assert.equal(l.anteriorId, 'u2');
  assert.equal(l.empate, false);
});

test('um voto que não conta não vira animação', () => {
  // Presente sem mapeamento: a seção 7 manda registrar e não contar. Pedir
  // uma mão para digitar um voto que não existe seria a tela inventando uma
  // votação que o placar não vai mostrar.
  const { hub, fonte } = montar();
  const c = hub.conectar(cliente('broadcast'));
  fonte.emitir({ plataforma: 'simulador', userId: 'ana', giftId: '999', em: 5 });
  assert.deepEqual(c.recebidas, []);
});

/* ------------------------------------------------------------- rodada */

test('começar a rodada anuncia o fim dela', () => {
  const { hub, fonte, relogio } = montar();
  const c = hub.conectar(cliente('admin'));
  falar(c, { tipo: 'round.start' });
  const r = c.ultima();
  assert.equal(r.tipo, 'round.update');
  assert.equal(r.payload.estado, 'aberta');
  assert.equal(r.payload.terminaEm, relogio.t + 300000);
  assert.equal(r.payload.restante, 300000);
});

test('o anúncio da rodada diz DE QUAL rodada ele é', () => {
  /*
   * Sem o id, a tela não tem como distinguir "a rodada continua" de "uma
   * rodada nova começou": o `round.update` sai a cada segundo enquanto o
   * relógio anda, e sai de novo, com a mesma cara, quando o painel zera. A
   * diferença entre os dois é a única coisa que faz a tela esconder o
   * resultado da rodada anterior — e sem ela o resultado fica no ar por cima
   * da disputa seguinte, para sempre.
   */
  const { hub, relogio } = montar();
  const c = hub.conectar(cliente('admin'));
  falar(c, { tipo: 'round.start' });
  const primeira = c.ultima().payload.rodada.id;
  assert.equal(typeof primeira, 'number', 'a rodada não veio identificada');

  // O relógio andando é a MESMA rodada: o id não pode trocar a cada tique,
  // senão a tela esconderia o resultado e zeraria a cada segundo.
  relogio.t += 45000;
  hub.tick();
  assert.equal(c.ultima().payload.rodada.id, primeira);

  falar(c, { tipo: 'round.reset' });
  assert.notEqual(c.ultima().payload.rodada.id, primeira,
    'a rodada nova ficou com o id da anterior');
});

test('o relógio anda, e o painel vê o tempo restante cair', () => {
  const { hub, relogio } = montar();
  const c = hub.conectar(cliente('admin'));
  falar(c, { tipo: 'round.start' });
  relogio.t += 45000;
  hub.tick();
  assert.equal(c.ultima().payload.restante, 255000);
});

test('quando o tempo acaba, a rodada fecha sozinha e o resultado sai', () => {
  /*
   * A seção 6.3: os votos recebidos ANTES do fechamento são sempre contados.
   * Quem fecha é o relógio do servidor, e não o do navegador — uma página
   * de transmissão que dorme no meio da live não pode ser a que decide
   * quando a votação terminou.
   */
  const { hub, fonte, relogio } = montar();
  // Quem começa a rodada é o painel; quem assiste é a tela. São dois
  // clientes, porque são dois papéis — e é essa separação que o hub defende.
  const painel = hub.conectar(cliente('admin'));
  const c = hub.conectar(cliente('broadcast'));
  falar(painel, { tipo: 'round.start' });
  fonte.emitir({ plataforma: 'simulador', userId: 'ana', giftId: '1', em: 5, comboIndex: 1 });
  relogio.t += 300001;
  hub.tick();

  assert.equal(c.de('round.finished').length, 1);
  const r = c.de('round.finished')[0].payload;
  assert.equal(r.resultado[0].id, 'u1');
  assert.equal(r.resultado[0].votos, 2);
  assert.equal(c.ultima().payload.estado, 'encerrada');
});

test('e o voto que chega depois do fim não entra', () => {
  const { hub, fonte, relogio } = montar();
  const painel = hub.conectar(cliente('admin'));
  const c = hub.conectar(cliente('broadcast'));
  falar(painel, { tipo: 'round.start' });
  relogio.t += 300001;
  hub.tick();
  fonte.emitir({ plataforma: 'simulador', userId: 'ana', giftId: '1', em: 5, comboIndex: 1 });
  assert.equal(c.de('vote.counted').length, 0);
  assert.equal(c.de('tally.update').length, 0);
});

test('o relógio não fecha a rodada duas vezes', () => {
  // O `tick` roda de segundo em segundo; sem a guarda, a segunda passada
  // mandaria um segundo `round.finished` e o painel tocaria o som de
  // encerramento em looping pelo resto da live.
  const { hub, relogio } = montar();
  const painel = hub.conectar(cliente('admin'));
  const c = hub.conectar(cliente('broadcast'));
  falar(painel, { tipo: 'round.start' });
  relogio.t += 300001;
  hub.tick();
  hub.tick();
  hub.tick();
  assert.equal(c.de('round.finished').length, 1);
});

test('encerrar na mão fecha a rodada antes do relógio', () => {
  const { hub, relogio } = montar();
  const c = hub.conectar(cliente('admin'));
  falar(c, { tipo: 'round.start' });
  relogio.t += 1000;
  falar(c, { tipo: 'round.stop' });
  assert.equal(c.de('round.finished').length, 1);
  assert.equal(c.ultima().payload.estado, 'encerrada');
});

test('zerar os contadores devolve a rodada ao começo', () => {
  // Aba Rodada do painel: "reset de contadores". É o botão que o Leonardo
  // aperta entre um teste e outro antes de abrir a live.
  const { hub, fonte, tally } = montar();
  const painel = hub.conectar(cliente('admin'));
  const c = hub.conectar(cliente('broadcast'));
  fonte.emitir({ plataforma: 'simulador', userId: 'ana', giftId: '1', em: 5, comboIndex: 1 });
  assert.equal(tally.estado().total, 2);
  falar(painel, { tipo: 'round.reset' });
  assert.equal(tally.estado().total, 0);
  assert.equal(c.ultima().payload.tally.total, 0);
  assert.equal(c.ultima().payload.tally.avisos, undefined, 'zerar não devia virar um retrato de painel');
});

/* ------------------------------------------------------- quem pode o quê */

test('a página de transmissão não manda no jogo', () => {
  /*
   * A página do OBS é uma tela. Se ela pudesse encerrar a rodada ou injetar
   * um presente, uma tecla apertada por engano na janela errada viraria um
   * voto de verdade no placar — e não haveria como distinguir isso de um
   * presente da live.
   */
  const { hub, tally, relogio } = montar();
  const c = hub.conectar(cliente('broadcast'));
  falar(c, { tipo: 'round.stop' });
  falar(c, { tipo: 'round.reset' });
  falar(c, { tipo: 'sim.gift', giftId: '1' });
  falar(c, { tipo: 'config.update', config: { rodada: { duracaoSegundos: 9 } } });
  relogio.t += 1000;
  hub.tick();
  assert.equal(tally.estado().total, 0, 'a tela conseguiu injetar um voto');
  assert.equal(tally.estado().rodada.aberta, true, 'a tela conseguiu encerrar a rodada');
});

test('o painel manda no jogo', () => {
  const { hub, fonte, tally } = montar();
  const c = hub.conectar(cliente('admin'));
  falar(c, { tipo: 'sim.gift', giftId: '1', userId: 'ana', userName: 'Ana' });
  assert.equal(tally.estado().total, 2);
  assert.equal(c.de('vote.animate').length, 1);
  assert.equal(fonte.status().conectado, true);
});

/* ---------------------------------------------------------- configuração */

test('mudar a configuração avisa todo mundo, e o motor passa a usar a nova', () => {
  /*
   * A configuração nova vai para TODOS, e não só para quem pediu: a página
   * de transmissão desenha o número, o nome e a cor das urnas a partir dela.
   * Se ela ficasse com a antiga, o painel mostraria "Urna 3" e a live
   * continuaria escrevendo "Urna 2".
   */
  const { hub, tally } = montar();
  const painel = hub.conectar(cliente('admin'));
  const tela = hub.conectar(cliente('broadcast'));
  falar(painel, { tipo: 'config.update', config: { urnas: { u1: { nome: 'Urna do 22' } } } });

  assert.equal(painel.ultima().tipo, 'config.changed');
  assert.equal(tela.ultima().tipo, 'config.changed');
  assert.equal(tela.ultima().payload.config.urnas.u1.nome, 'Urna do 22');
  // O que não foi dito continua valendo: um remendo não apaga o resto.
  assert.equal(tela.ultima().payload.config.urnas.u1.numero, '22');
  assert.equal(tally.rodadaId != null, true);
});

test('a configuração que chega quebrada é recusada inteira, e o aviso volta', () => {
  // A seção 7: configuração corrompida cai para o padrão e avisa. Salvar um
  // lixo por cima da configuração boa da live seria o pior momento possível
  // para perder o mapeamento dos presentes.
  const { hub } = montar();
  const c = hub.conectar(cliente('admin'));
  falar(c, { tipo: 'config.update', config: 'isto não é um objeto' });
  assert.equal(c.ultima().tipo, 'config.changed');
  assert.equal(c.ultima().payload.config.urnas.u2.numero, '13', 'a configuração boa foi perdida');
  assert.ok(c.ultima().payload.avisos.length > 0);
});

test('a velocidade da animação muda na hora, sem reescrever o arquivo', () => {
  /*
   * O controle que o Leonardo usa DURANTE a rodada: um momento devagar, uma
   * rajada, e ele quer a mão mais rápida. Arrastar um controle não pode
   * reescrever `config/local.json` a cada quadro — o que persiste é o botão
   * de salvar da aba Animação.
   */
  const { hub, salvas } = montar();
  const tela = hub.conectar(cliente('broadcast'));
  const painel = hub.conectar(cliente('admin'));
  falar(painel, { tipo: 'anim.speed', velocidade: 4 });
  assert.equal(tela.ultima().payload.config.animacao.velocidade, 4);
  assert.deepEqual(salvas, [], 'a velocidade foi gravada em disco sem ninguém pedir');
});

/* -------------------------------------------------------------- robustez */

test('mensagem de lixo não derruba o hub nem desconecta quem mandou', () => {
  /*
   * Seção 7: a live não para por causa de um erro. Qualquer coisa pode
   * chegar neste socket — um pedaço de JSON, um `null`, uma mensagem de uma
   * versão futura do painel — e o processo que fica de pé a noite inteira
   * não pode cair por causa disso.
   */
  const { hub } = montar();
  const c = hub.conectar(cliente('admin'));
  c.receber('{isto não é json');
  c.receber('null');
  c.receber(JSON.stringify({ tipo: 'mensagem-do-futuro', dados: 1 }));
  c.receber(JSON.stringify({ semTipo: true }));
  falar(c, { tipo: 'state.request' });
  assert.equal(c.ultima().tipo, 'state.full');
});

test('um cliente que foi embora não recebe mais nada', () => {
  /*
   * O OBS recarrega a fonte de navegador no meio da live, e cada recarga
   * deixa um socket morto. Sem a limpeza, a lista de clientes cresce a noite
   * inteira e cada voto passa a ser escrito em dezenas de sockets fechados.
   */
  const { hub, fonte } = montar();
  const fica = hub.conectar(cliente('broadcast'));
  const vai = hub.conectar(cliente('broadcast'));
  vai.fechar();
  fonte.emitir({ plataforma: 'simulador', userId: 'ana', giftId: '1', em: 5 });
  assert.equal(fica.de('vote.counted').length, 1);
  assert.equal(vai.de('vote.counted').length, 0);
  assert.equal(hub.quantosClientes(), 1);
});

test('um cliente que explode ao receber não cala os outros', () => {
  // O socket já fechado do outro lado lança no `write`. O voto do próximo
  // espectador é mais importante do que o cliente que foi embora.
  const { hub, fonte } = montar();
  const quebrado = cliente('broadcast');
  quebrado.enviar = () => { throw new Error('EPIPE'); };
  hub.conectar(quebrado);
  const bom = hub.conectar(cliente('broadcast'));
  fonte.emitir({ plataforma: 'simulador', userId: 'ana', giftId: '1', em: 5 });
  assert.equal(bom.de('vote.counted').length, 1);
});

test('o estado da fonte vai para o painel quando a conexão muda', () => {
  // Aba Integração: o Leonardo precisa ver a conexão cair no instante em que
  // ela cai, e não quando ele recarregar a página.
  const { hub, fonte } = montar();
  const painel = hub.conectar(cliente('admin'));
  fonte.parar();
  assert.equal(painel.ultima().tipo, 'source.status');
  assert.equal(painel.ultima().payload.conectado, false);
});

/* ------------------------------------------------------------ a narração */

/*
 * A fala de quem segue, entra, curte, compartilha ou assina.
 *
 * O narrador é do servidor, e não da página, por um motivo prático: o OBS não
 * toca `speechSynthesis` nenhuma — o CEF que ele embute não traz motor de voz,
 * e o áudio sintetizado no navegador nem seria capturado. O que o OBS captura
 * é um elemento de áudio com um arquivo de verdade. Então o servidor
 * sintetiza, guarda, e manda para a tela o CAMINHO do arquivo.
 *
 * A regra que estes testes protegem é a de sempre: a faixa da tela não pode
 * depender do áudio. Voz quebrada, voz desligada, arquivo que não saiu — em
 * todos os casos o nome de quem chegou aparece. Perder a fala é um detalhe;
 * perder as boas-vindas é a página parecer morta.
 */

/** Uma voz de mentira, com o tamanho exato do que o hub usa dela. */
function vozDeMentira({ arquivo = null, erro = null, atrasos = [] } = {}) {
  const pedidos = [];
  let n = 0;
  return {
    pedidos,
    async sintetizar(texto) {
      pedidos.push(texto);
      const espera = atrasos[n++] ?? 0;
      if (espera) await new Promise((ok) => setTimeout(ok, espera));
      if (erro) throw new Error(erro);
      return arquivo ? { bytes: null, eco: texto, arquivo } : null;
    },
  };
}

/** O hub não termina de falar no mesmo tick: o `sintetizar` é assíncrono. */
const respirar = (ms = 60) => new Promise((ok) => setTimeout(ok, ms));

/**
 * A mesma configuração, com UMA frase de presente — e com a urna nela.
 *
 * Só ALGUMAS frases do padrão citam `{urna}`, e a do dia é sorteada do
 * baralho: um teste que dependesse do sorteio passaria ou falharia conforme a
 * frase da vez, que é o pior tipo de teste vermelho. Fixando a frase, o que
 * se prende é o DADO que o hub manda para o narrador, e não a sorte.
 */
const CONFIG_COM_URNA_NA_FRASE = normalizar({
  urnas: { u1: { id: 'u1', nome: 'Urna 1', numero: '22', multiplicador: 2 } },
  presentes: [{ id: 'p1', nome: 'Heart Me', giftId: '1', urnaId: 'u1', votos: 1 }],
  narracao: { falas: { presente: ['{nome} mandou {vezes}{presente} pra {urna}!'] } },
}).config;

const seguir = (nome, userId = nome) => ({
  plataforma: 'simulador', tipo: 'seguidor', usuario: nome, userId, em: 7000,
});

test('um seguidor vira fala na tela, e não voto', () => {
  /*
   * As duas metades importam. A primeira é o pedido do Leonardo: quem segue
   * merece ser anunciado. A segunda é a regra da seção 6: só presente conta
   * voto, e um seguidor que subisse o placar seria a urna contando o que
   * ninguém pagou.
   */
  const { hub, fonte } = montar();
  const tela = hub.conectar(cliente('broadcast'));
  fonte.emitir(seguir('Ana'));
  return respirar().then(() => {
    const falas = tela.de('narrate');
    assert.equal(falas.length, 1, 'o seguidor não foi anunciado');
    assert.match(falas[0].payload.texto, /Ana/);
    assert.equal(falas[0].payload.tipo, 'seguidor');
    assert.equal(falas[0].payload.usuario, 'Ana');
    assert.equal(falas[0].payload.em, 7000);
    assert.equal(tela.de('vote.counted').length, 0, 'um seguidor virou voto');
    assert.equal(tela.de('tally.update').length, 0, 'o placar subiu por um seguidor');
  });
});

test('o presente contado vira fala: quem mandou, o quê, quantos e pra quem', () => {
  /*
   * Este teste dizia o CONTRÁRIO até 2026-10-15 — "o presente NÃO vira
   * narração" —, e a decisão mudou a pedido do Leonardo: "narrar cada
   * presente". O motivo antigo era o espetáculo da tela fazer o barulho todo;
   * o motivo novo é que o presente é o ÚNICO evento que conta voto, e o único
   * que custou dinheiro a quem mandou. A pessoa paga e a voz fica muda: é o
   * silêncio mais estranho possível, justamente no evento mais importante.
   *
   * O que a fala precisa dizer é o que a tela não diz junto: a tela mostra a
   * cédula caindo, e não que foram três rosas da Ana para a Urna 1. Sem o
   * combo, quem mandou cinco presentes ouve a mesma frase de quem mandou um.
   */
  const { hub, fonte } = montar({ config: CONFIG_COM_URNA_NA_FRASE });
  const tela = hub.conectar(cliente('broadcast'));
  fonte.emitir({
    plataforma: 'simulador', userId: 'ana', usuario: 'Ana',
    giftId: '1', combo: 3, comboIndex: 1, em: 5,
  });
  return respirar().then(() => {
    assert.equal(tela.de('vote.counted').length, 1, 'o presente deixou de contar');
    const fala = tela.de('narrate')[0];
    assert.ok(fala, 'o presente contado ficou mudo');
    assert.equal(fala.payload.tipo, 'presente');
    assert.match(fala.payload.texto, /Ana/, 'a fala não diz quem mandou');
    assert.match(fala.payload.texto, /Heart Me/, 'a fala não diz o que foi mandado');
    assert.match(fala.payload.texto, /3x Heart Me/, 'a fala perdeu o combo');
    assert.match(fala.payload.texto, /Urna 1/, 'a fala não diz pra quem foi');
  });
});

/*
 * A urna com apelido e a frase que só fala dele.
 *
 * Mesma razão do bloco de cima: a frase do dia sai de um baralho, então o que
 * se prende aqui é o DADO que o hub entrega — o apelido da urna que recebeu o
 * voto —, e não a sorte da frase sorteada.
 */
const CONFIG_COM_APELIDO = normalizar({
  urnas: { u2: { id: 'u2', nome: 'Lula', apelido: 'Lulinha', numero: '13' } },
  presentes: [{ id: 'p2', nome: 'Rosa', giftId: '2', urnaId: 'u2', votos: 1 }],
  narracao: { falas: { presente: ['{apelido} ganhou um voto!'] } },
}).config;

test('o voto decidido sai falando o apelido de quem recebeu', () => {
  /*
   * O pedido do Leonardo, ponta a ponta: "quando alguém mandar presente e já
   * tiver o voto decidido, fala tipo se votar 13 'Lulinha ganhou um voto'".
   *
   * O apelido não está no evento — a TikTok não sabe que a urna 13 tem
   * apelido —, então ele só pode vir da configuração, e é o hub que faz essa
   * ligação. Sem esta linha, a frase do voto decidido diria "Lula ganhou um
   * voto": certa, e não o que ele pediu.
   */
  const { hub, fonte } = montar({ config: CONFIG_COM_APELIDO });
  const tela = hub.conectar(cliente('broadcast'));
  fonte.emitir({
    plataforma: 'simulador', userId: 'ana', usuario: 'Ana', giftId: '2', combo: 1, em: 5,
  });
  return respirar().then(() => {
    assert.equal(tela.de('vote.counted').length, 1, 'o presente deixou de contar');
    const fala = tela.de('narrate')[0];
    assert.ok(fala, 'o voto decidido ficou mudo');
    assert.equal(fala.payload.texto, 'Lulinha ganhou um voto!');
  });
});

/*
 * O presente com desenho, e a frase que só fala dele.
 *
 * O desenho sai do MAPEAMENTO e não do evento: a TikTok manda o nome do
 * presente ("Rosa"), e não o nome de um arquivo de `public/img/`. É por isso
 * que este dado só pode nascer na configuração.
 */
const CONFIG_COM_DESENHO = normalizar({
  urnas: { u2: { id: 'u2', nome: 'Lula', numero: '13' } },
  presentes: [{ id: 'p2', nome: 'Rosa', giftId: '2', urnaId: 'u2', votos: 1, desenho: 'rose' }],
  narracao: { falas: { presente: ['{nome} mandou {vezes}{presente}!'] } },
}).config;

test('a faixa do presente leva o desenho do presente que chegou', () => {
  /*
   * Pedido do Leonardo em 2026-10-15, olhando a faixa de presente na live:
   * "muito simples e pouco chamativo". A frase dourada resolve metade; a
   * figura do presente que chegou resolve a outra: quem olha a transmissão
   * reconhece a rosa antes de ler qualquer palavra.
   *
   * O que este teste prende é o CAMINHO do dado: ele nasce no mapeamento do
   * presente, e não no evento — sem esta ligação o campo existiria no
   * clientes, no CSS e na sonda, e nunca chegaria à tela.
   */
  const { hub, fonte } = montar({ config: CONFIG_COM_DESENHO });
  const tela = hub.conectar(cliente('broadcast'));
  fonte.emitir({
    plataforma: 'simulador', userId: 'ana', usuario: 'Ana', giftId: '2', combo: 1, em: 5,
  });
  return respirar().then(() => {
    const fala = tela.de('narrate')[0];
    assert.ok(fala, 'o presente contado ficou mudo');
    assert.equal(fala.payload.desenho, 'rose');
  });
});

test('o aviso social não leva desenho nenhum', () => {
  /*
   * Um seguidor não manda rosa. O campo só existe no aviso de presente, e a
   * ausência dele é o que faz a faixa dos outros tipos sair sem figura — e sem
   * o buraco de 96px que a figura deixaria se o cliente a mantivesse.
   */
  const { hub, fonte } = montar();
  const tela = hub.conectar(cliente('broadcast'));
  fonte.emitir(seguir('Ana'));
  return respirar().then(() => {
    const fala = tela.de('narrate')[0];
    assert.ok(fala, 'o seguidor não foi anunciado');
    assert.equal(fala.payload.desenho, undefined);
  });
});

test('o presente sem urna fica quieto até o número chegar', () => {
  /*
   * O outro lado da decisão acima: só fala o presente que VIROU VOTO.
   *
   * O presente órfão não tem urna, então não tem destino para onde o voto
   * foi — e a frase que sairia agora anunciaria um voto que não aconteceu.
   * Quem fala por ele é a cobrança dos quinze segundos, que diz o que ele
   * precisa ouvir: o que fazer para o presente valer.
   *
   * Sem esta guarda o silêncio vira mentira: o padrão TEM frases de presente
   * desde que a lista nova entrou, e um presente órfão acharia uma.
   */
  const { hub, fonte } = montar();
  const tela = hub.conectar(cliente('broadcast'));
  fonte.emitir({ plataforma: 'simulador', userId: 'ana', usuario: 'Ana', giftId: '777', em: 5 });
  return respirar().then(() => {
    assert.equal(tela.de('vote.counted').length, 0, 'o presente órfão contou voto');
    assert.equal(tela.de('narrate').length, 0, 'o presente órfão falou antes de virar voto');
  });
});

test('sem voz nenhuma, a faixa da tela aparece do mesmo jeito', () => {
  // É o caso do primeiro boot antes do aquecedor, e de qualquer dia em que o
  // PowerShell não subir. O nome de quem seguiu é o que não pode faltar.
  const { hub, fonte } = montar({ voz: null });
  const tela = hub.conectar(cliente('broadcast'));
  fonte.emitir(seguir('Ana'));
  return respirar().then(() => {
    const f = tela.de('narrate');
    assert.equal(f.length, 1);
    assert.equal(f[0].payload.wav, null);
    assert.match(f[0].payload.texto, /Ana/);
  });
});

test('a voz pronta vira o caminho que a página pede', () => {
  /*
   * A página nunca vê o disco do servidor — ela recebe uma URL e a busca. O
   * caminho completo do arquivo vazando para o HTML seria, no melhor caso,
   * feio; no pior, quebrado, porque o navegador monta a URL a partir da
   * origem e uma barra invertida do Windows não é um caminho válido em URL.
   */
  const voz = vozDeMentira({ arquivo: 'C:\\xampp\\htdocs\\tiktok-live-urna\\dados\\voz\\a1b2c3d4e5f60718.wav' });
  const { hub, fonte } = montar({ voz });
  const tela = hub.conectar(cliente('broadcast'));
  fonte.emitir(seguir('Ana'));
  return respirar().then(() => {
    assert.equal(tela.de('narrate')[0].payload.wav, '/voz/a1b2c3d4e5f60718.wav');
    assert.equal(voz.pedidos.length, 1, 'a voz não foi chamada');
    assert.match(voz.pedidos[0], /Ana/);
  });
});

test('a voz que quebra não cala a faixa', () => {
  /*
   * O sintetizador é um processo externo: ele cai, ele trava, ele demora. A
   * seção 7 é explícita em que a live não para por causa de um erro — e aqui
   * isso quer dizer que o seguidor da Ana aparece na tela mesmo com o
   * PowerShell morto.
   */
  const { hub, fonte } = montar({ voz: vozDeMentira({ erro: 'o sintetizador caiu' }) });
  const tela = hub.conectar(cliente('broadcast'));
  fonte.emitir(seguir('Ana'));
  return respirar().then(() => {
    const f = tela.de('narrate');
    assert.equal(f.length, 1, 'o erro da voz engoliu o anúncio');
    assert.equal(f[0].payload.wav, null);
    assert.match(f[0].payload.texto, /Ana/);
  });
});

test('a narração desligada não manda nada', () => {
  const desligada = normalizar({ narracao: { ativa: false } }).config;
  const { hub, fonte } = montar({ config: desligada, voz: vozDeMentira({ arquivo: 'x.wav' }) });
  const tela = hub.conectar(cliente('broadcast'));
  fonte.emitir(seguir('Ana'));
  return respirar().then(() => {
    assert.equal(tela.de('narrate').length, 0, 'falou com o narrador desligado');
  });
});

test('a frase editada no painel vale para a próxima fala, sem reiniciar', () => {
  /*
   * Este é o defeito que o narrador teria se guardasse as frases no dia em
   * que nasceu: o Leonardo edita no painel com a live no ar, ouve a frase
   * antiga, e não tem como saber por quê. O hub troca a configuração inteira
   * a cada salvamento, então o narrador precisa ler a de AGORA.
   */
  const antes = normalizar({ narracao: { falas: { seguidor: ['Antes: {nome}'] } } }).config;
  const { hub, fonte } = montar({ config: antes });
  const tela = hub.conectar(cliente('broadcast'));
  fonte.emitir(seguir('Ana'));
  return respirar()
    .then(() => {
      assert.equal(tela.de('narrate')[0].payload.texto, 'Antes: Ana');
      const painel = hub.conectar(cliente('admin'));
      falar(painel, { tipo: 'hello', papel: 'admin' });
      falar(painel, {
        tipo: 'config.update',
        config: { narracao: { falas: { seguidor: ['Depois: {nome}'] } } },
      });
      fonte.emitir(seguir('Bia', 'bia'));
      return respirar();
    })
    .then(() => {
      assert.equal(tela.de('narrate')[1].payload.texto, 'Depois: Bia', 'a frase nova não valeu');
    });
});

test('duas falas seguidas chegam na ordem em que aconteceram', () => {
  /*
   * O `sintetizar` é assíncrono, e a primeira frase de um apelido novo é a
   * mais lenta — é ela que paga o arranque do PowerShell. Sem uma fila, a
   * segunda fala, que é rápida, chegaria antes: a live ouviria "bem-vindo,
   * Bia" e depois "bem-vindo, Ana", com a Ana tendo chegado primeiro.
   */
  const voz = vozDeMentira({ arquivo: 'x.wav', atrasos: [80, 0] });
  const { hub, fonte } = montar({ voz });
  const tela = hub.conectar(cliente('broadcast'));
  fonte.emitir(seguir('Ana'));
  fonte.emitir(seguir('Bia', 'bia'));
  return respirar(200).then(() => {
    const textos = tela.de('narrate').map((m) => m.payload.texto);
    assert.equal(textos.length, 2, `saíram ${textos.length} falas`);
    assert.match(textos[0], /Ana/);
    assert.match(textos[1], /Bia/);
  });
});

test('a fila da fala tem teto: cheia, ela recusa o anúncio seguinte', () => {
  /*
   * A fila existe para as falas chegarem na ordem, e sem teto ela vira uma
   * dívida. Numa live movimentada chegam mais eventos por segundo do que a
   * voz consegue falar — cada fala custa o tempo de pronúncia mais o do
   * arquivo —, e a fila cresce para sempre. O sintoma no ar é o pior
   * possível: a voz vai ficando para trás e anuncia quem chegou há dois
   * minutos, falando do passado enquanto a live já é outra.
   *
   * Recusar é a escolha certa justamente porque a fala é a parte que envelhece:
   * um voto perdido é um voto que não subiu, mas uma boas-vindas perdida não
   * custa nada — a próxima pessoa que entrar é anunciada do mesmo jeito. O que
   * não pode acontecer é a recusa ENVENENAR a fila: passado o aperto, a fala
   * seguinte tem que sair normalmente.
   */
  const voz = vozDeMentira({ arquivo: 'x.wav', atrasos: new Array(20).fill(40) });
  const { hub, fonte } = montar({ voz });
  const tela = hub.conectar(cliente('broadcast'));
  for (let i = 1; i <= 8; i += 1) fonte.emitir(seguir(`Pessoa ${i}`, `p${i}`));

  return respirar(500)
    .then(() => {
      // Seis é o teto, e as oito entraram no MESMO tick: as duas últimas não
      // têm como ter entrado. As seis primeiras saíram na ordem em que
      // chegaram, que é o que a fila existe para garantir.
      const falados = tela.de('narrate').map((m) => m.payload.usuario);
      assert.deepEqual(
        falados,
        ['Pessoa 1', 'Pessoa 2', 'Pessoa 3', 'Pessoa 4', 'Pessoa 5', 'Pessoa 6'],
        'a fila não cortou em seis, ou cortou fora de ordem',
      );

      // Passado o aperto, a fila drena — e volta a aceitar.
      tela.recebidas.length = 0;
      fonte.emitir(seguir('Depois', 'depois'));
      return respirar(200);
    })
    .then(() => {
      assert.equal(tela.de('narrate').length, 1, 'a fila ficou entupida depois do aperto');
      assert.match(tela.de('narrate')[0].payload.texto, /Depois/);
    });
});

/*
 * O botão de teste do painel.
 *
 * Sem esta porta, a única maneira de saber se a voz e a faixa funcionam seria
 * esperar alguém seguir de verdade — e descobrir na frente da audiência que o
 * caminho não estava pronto. A voz sintetizada é a parte mais frágil do
 * sistema inteiro (um processo externo, um arquivo em disco, um elemento de
 * áudio), e é a única que não dá para conferir olhando a tela do painel.
 *
 * O evento entra pela MESMA porta que a TikTok vai usar, e não por um atalho
 * que chamasse o narrador direto: o que o Leonardo vê no teste é o que vai
 * acontecer na live — inclusive o tempo da voz e o caminho do arquivo.
 */
test('o painel tem como testar a narração antes da live', () => {
  const voz = vozDeMentira({ arquivo: 'C:\\dados\\voz\\a1b2c3d4e5f60718.wav' });
  const { hub } = montar({ voz });
  const tela = hub.conectar(cliente('broadcast'));
  const painel = hub.conectar(cliente('admin'));
  falar(painel, { tipo: 'sim.social', social: 'seguidor', userId: 'ana', userName: 'Ana' });

  return respirar().then(() => {
    const f = tela.de('narrate');
    assert.equal(f.length, 1, 'o botão de teste não falou nada');
    assert.equal(f[0].payload.tipo, 'seguidor');
    assert.match(f[0].payload.texto, /Ana/);
    assert.equal(f[0].payload.wav, '/voz/a1b2c3d4e5f60718.wav', 'o teste não passou pela voz');
    assert.equal(tela.de('vote.counted').length, 0, 'um teste virou voto no placar');
  });
});

test('a porta da narração não conta voto, e não fala do que não existe', () => {
  /*
   * A mesma porta serve para testar a fala, e só para isso. Três pedidos
   * atravessam-na aqui, e nenhum deles pode virar voto: um `presente`, que
   * contaria um voto que ninguém pagou; um tipo inventado, que é uma versão
   * futura do painel falando com um servidor antigo; e um pedido sem tipo
   * nenhum.
   *
   * A última asserção é o que impede este teste de passar por acidente. Sem
   * ela, tudo o que ele confere é que nada acontece — e nada acontece
   * também quando a porta não existe. Foi assim que ele nasceu verde, antes
   * de o `sim.social` ser escrito: as três recusas valiam, e não provavam
   * coisa nenhuma.
   */
  const { hub, tally } = montar();
  const tela = hub.conectar(cliente('broadcast'));
  const painel = hub.conectar(cliente('admin'));
  falar(painel, { tipo: 'sim.social', social: 'presente', giftId: '1', userId: 'ana' });
  falar(painel, { tipo: 'sim.social', social: 'dancou', userId: 'ana', userName: 'Ana' });
  falar(painel, { tipo: 'sim.social', userId: 'ana', userName: 'Ana' });

  return respirar()
    .then(() => {
      assert.equal(tela.de('vote.counted').length, 0, 'a porta da narração contou um voto');
      assert.equal(tally.estado().total, 0);
      assert.equal(tela.de('narrate').length, 0, 'falou de um evento que não existe');
      // E o que é social de verdade continua falando — senão este teste
      // estaria só medindo o silêncio de uma porta fechada.
      falar(painel, { tipo: 'sim.social', social: 'seguidor', userId: 'bia', userName: 'Bia' });
      return respirar();
    })
    .then(() => {
      const f = tela.de('narrate');
      assert.equal(f.length, 1, 'a porta não deixou passar o que era para passar');
      assert.match(f[0].payload.texto, /Bia/);
      assert.equal(tela.de('vote.counted').length, 0, 'o seguidor da Bia virou voto');
    });
});

test('a tela não inventa um seguidor', () => {
  /*
   * O papel do cliente não é uma credencial, mas isto não é sobre ataque: é
   * sobre a janela errada. A página da transmissão é a que fica aberta no
   * OBS, e uma tecla apertada nela não pode pôr um nome inventado na boca do
   * narrador, no ar.
   */
  const { hub } = montar();
  const tela = hub.conectar(cliente('broadcast'));
  falar(tela, { tipo: 'sim.social', social: 'seguidor', userName: 'Trapaça' });
  return respirar().then(() => {
    assert.equal(tela.de('narrate').length, 0, 'a tela falou pela live');
  });
});

test('todo botão de teste do painel faz o narrador falar', () => {
  /*
   * O teste que prende o botão à fala, tipo por tipo.
   *
   * Ele existe por causa da curtida, e a curtida é o caso que quase passou: o
   * narrador só fala de curtida quando ela vira GESTO — cinco toques dentro
   * de três segundos —, e um botão que mandasse um toque só sairia mudo. O
   * Leonardo apertaria, não ouviria nada, e concluiria que a voz está
   * quebrada. O botão é a única forma de conferir a voz antes da live; ele
   * não pode ser a coisa que mente.
   *
   * A varredura é contra a lista do PAINEL, e não contra uma copiada aqui: é
   * o que garante que o botão que existe é o botão que fala.
   */
  const { hub } = montar();
  const tela = hub.conectar(cliente('broadcast'));
  const painel = hub.conectar(cliente('admin'));
  for (const acao of ACOES_SOCIAIS) {
    falar(painel, {
      tipo: 'sim.social',
      social: acao.tipo,
      quantidade: acao.quantidade,
      userId: `teste-${acao.tipo}`,
      userName: 'Ana',
    });
  }
  return respirar(150).then(() => {
    const faladas = tela.de('narrate').map((m) => m.payload.tipo);
    const mudos = ACOES_SOCIAIS.map((a) => a.tipo).filter((t) => !faladas.includes(t));
    assert.deepEqual(mudos, [], `botões que não falam nada: ${mudos.join(', ')}`);

    // E o número que o botão manda não pode ficar abaixo do que o servidor
    // exige para falar — senão o dia em que o limiar subir, o botão emudece
    // sem que nada acuse.
    const curtida = ACOES_SOCIAIS.find((a) => a.tipo === 'curtida');
    assert.ok(curtida.quantidade >= LIMIAR_DA_CURTIDA,
      `o botão de curtida manda ${curtida.quantidade}, e o narrador só fala a partir de ${LIMIAR_DA_CURTIDA}`);
  });
});

/* ------------------------------------ a espera do número escrito no chat */

/*
 * O pedido do Leonardo, literal: "quando alguém enviar outro presente que não
 * seja rosa ou joinha, esperar ele escrever o número no chat; se demorar mais
 * de 15s, avisar por voz".
 *
 * Estes testes são do CAMINHO INTEIRO, e não da regra. A regra — quem pode
 * resgatar, o que conta como número, quando a janela vence — já está presa em
 * espera.test.js. O que se prende aqui é a LIGAÇÃO, que é onde um sistema
 * deste tamanho costuma perder um pedaço: o presente que entra pela fonte de
 * verdade, o comentário que chega pela mesma porta que a TikTok vai usar, e o
 * que sai no socket por causa disso.
 *
 * O `em` vai explícito em cada evento, e não é preciosismo: a espera mede
 * TEMPO, e o relógio do hub aqui é o do teste. Um evento carimbado com o
 * relógio de verdade nasceria já vencido neste mundo de mentira — ou nunca
 * venceria, que foi o que aconteceu na primeira versão destes testes.
 */

/** O presente que o painel não mapeia — o caso que abre a espera. */
const orfao = (extra = {}) => ({ giftId: '777', userId: 'ana', userName: 'Ana', combo: 1, ...extra });

test('o presente sem urna não conta na hora, e não some', () => {
  /*
   * Antes disto o presente órfão simplesmente não existia: sem voto, sem
   * fala, sem nada. Quem mandou ficava sem entender por que o presente caro
   * não fez nada — e do lado dele o presente não funcionou.
   *
   * Agora ele fica guardado, esperando o número, e o painel mostra a espera:
   * é o que permite ao operador entender, no meio da live, de quem é o
   * presente que não virou voto.
   */
  const { fonte, hub, tally, relogio } = montar();
  const painel = hub.conectar(cliente('admin'));

  fonte.enviar(orfao({ em: relogio.t }));

  assert.equal(tally.estado().total, 0, 'o presente órfão contou sozinho');
  const aviso = painel.de('espera.updated').at(-1);
  assert.ok(aviso, 'o painel não viu a espera abrir');
  assert.equal(aviso.payload.pendentes, 1);
  assert.equal(aviso.payload.esperas[0].usuario, 'Ana', 'a espera não diz de quem é o presente');
  assert.equal(aviso.payload.esperas[0].presente, 'Presente', 'a etiqueta ficou sem nome');
});

test('o número escrito no chat transforma o presente em voto', () => {
  // O caminho feliz do pedido, inteiro: o presente entra, a pessoa escreve
  // "22", e o voto sai com a MESMA cara de um presente mapeado — contado,
  // animado e com o placar subindo.
  const { fonte, hub, relogio } = montar();
  const tela = hub.conectar(cliente('broadcast'));

  fonte.enviar(orfao({ em: relogio.t }));
  tela.recebidas.length = 0;
  fonte.comentario({ userId: 'ana', userName: 'Ana', texto: '22', em: relogio.t });

  const contado = tela.de('vote.counted')[0];
  assert.ok(contado, 'o número no chat não virou voto');
  assert.equal(contado.payload.urnaId, 'u1');
  const animado = tela.de('vote.animate')[0];
  assert.ok(animado, 'o voto não pediu animação');
  assert.equal(animado.payload.numero, '22', 'a mão não sabe que número digitar');
  assert.equal(animado.payload.presente, 'Presente', 'a etiqueta da fila ficou sem nome');
  assert.equal(tela.de('tally.update').length, 1, 'o placar não subiu');
});

test('o presente resgatado leva o nome que a live deu a ele', () => {
  // O painel não conhece este presente, então o único nome que existe para a
  // etiqueta da fila é o que veio da TikTok.
  const { fonte, hub, relogio } = montar();
  const tela = hub.conectar(cliente('broadcast'));
  fonte.enviar(orfao({ giftNome: 'Diamante', em: relogio.t }));
  tela.recebidas.length = 0;
  fonte.comentario({ userId: 'ana', userName: 'Ana', texto: '13', em: relogio.t });
  assert.equal(tela.de('vote.animate')[0]?.payload.presente, 'Diamante');
});

test('o presente resgatado no chat fala como qualquer outro voto', () => {
  /*
   * O resgate existe para o presente órfão não sumir, e um presente que virou
   * voto é um presente que merece fala — igual ao que estava mapeado. Se a
   * fala saísse só pelo caminho mapeado, o voto resgatado seria um voto de
   * segunda classe: a tela animava e a voz ficava quieta.
   *
   * O COMBO vem junto, e é o detalhe que se perde fácil: o evento do resgate
   * é um COMENTÁRIO, e o comentário não tem combo nenhum. Quem mandou "5x
   * Diamante" e escreveu o número ouviria "mandou Diamante" — a mesma frase
   * de quem mandou um só.
   */
  const { fonte, hub, relogio } = montar({ config: CONFIG_COM_URNA_NA_FRASE });
  const tela = hub.conectar(cliente('broadcast'));
  fonte.enviar(orfao({ giftNome: 'Diamante', combo: 5, em: relogio.t }));
  tela.recebidas.length = 0;
  fonte.comentario({ userId: 'ana', userName: 'Ana', texto: '22', em: relogio.t });
  return respirar().then(() => {
    const fala = tela.de('narrate')[0];
    assert.ok(fala, 'o voto resgatado no chat ficou mudo');
    assert.match(fala.payload.texto, /5x Diamante/, 'a fala perdeu o combo do presente');
    assert.match(fala.payload.texto, /Urna 1/, 'a fala não diz para qual urna foi');
  });
});

test('o comentário de outra pessoa não resgata o presente', () => {
  /*
   * O chat é público. Se qualquer um resgatasse, um espectador levaria o
   * presente caro de outro para a urna que quisesse — e o defeito seria
   * invisível, porque o voto contaria normalmente e o placar subiria.
   */
  const { fonte, hub, relogio } = montar();
  const tela = hub.conectar(cliente('broadcast'));
  fonte.enviar(orfao({ em: relogio.t }));
  tela.recebidas.length = 0;
  fonte.comentario({ userId: 'zeca', userName: 'Zeca', texto: '22', em: relogio.t });
  assert.equal(tela.de('vote.counted').length, 0, 'o presente da Ana foi para a urna do Zeca');
});

test('o comentário comum do chat não vira fala nem voto', () => {
  // A live tem dezenas de comentários por minuto. Se cada um falasse, o
  // narrador viraria um leitor de chat — e ninguém mais ouviria os votos.
  const { fonte, hub, relogio } = montar();
  const tela = hub.conectar(cliente('broadcast'));
  fonte.comentario({ userId: 'zeca', userName: 'Zeca', texto: 'boa noite galera!', em: relogio.t });
  return respirar().then(() => {
    assert.equal(tela.recebidas.length, 0, 'o comentário virou evento na tela');
  });
});

test('quinze segundos sem número: a voz cobra o número', () => {
  /*
   * É o "se demorar mais de 15s, avisar por voz" do pedido. O que sai é uma
   * fala com o nome de quem mandou: sem o nome, a cobrança não serve para
   * nada, porque ninguém sabe que é com ele.
   */
  const { fonte, hub, relogio } = montar();
  const tela = hub.conectar(cliente('broadcast'));
  fonte.enviar(orfao({ em: relogio.t }));

  relogio.t += 14_000;
  hub.tick();
  return respirar().then(() => {
    assert.equal(tela.de('narrate').length, 0, 'a voz cobrou antes dos quinze segundos');

    relogio.t += 1_000;
    hub.tick();
    return respirar();
  }).then(() => {
    const fala = tela.de('narrate')[0];
    assert.ok(fala, 'os quinze segundos passaram em silêncio');
    assert.match(fala.payload.texto, /Ana/, 'a cobrança não diz de quem é o presente');
    assert.equal(fala.payload.tipo, 'espera');
  });
});

test('a cobrança do número não é recusada nem com a fila cheia', () => {
  /*
   * A fila cheia recusa fala — mas não esta.
   *
   * A cobrança é a única fala do sistema que responde a um SILÊNCIO, e a única
   * que existe para desfazer um prejuízo: alguém mandou um presente que não
   * virou voto, e está olhando para uma tela que não explicou nada. Se a fila
   * cheia a engolisse, o resultado seria o pior caso possível do projeto — a
   * pessoa pagou, nada aconteceu, e ninguém disse o que fazer.
   *
   * E ela é jogada fora de verdade quando é recusada: o `vencidas()` do
   * `cobrarEsperas` já a consumiu antes de a fala existir. Recusar aqui não é
   * adiar, é perder.
   *
   * A boas-vindas, essa pode ser recusada sem dor: quem chegou depois é
   * anunciado igual, e é essa assimetria que justifica as duas regras.
   */
  const voz = vozDeMentira({ arquivo: 'x.wav', atrasos: new Array(20).fill(40) });
  const { fonte, hub, relogio } = montar({ voz });
  const tela = hub.conectar(cliente('broadcast'));

  // A fila inteira ocupada por boas-vindas, no mesmo tick.
  for (let i = 1; i <= 8; i += 1) fonte.emitir(seguir(`Pessoa ${i}`, `p${i}`));
  fonte.enviar(orfao({ em: relogio.t }));
  relogio.t += 20_000;
  hub.tick();

  return respirar(900).then(() => {
    const fala = tela.de('narrate').find((m) => m.payload.tipo === 'espera');
    assert.ok(fala, 'a fila cheia engoliu a cobrança do número');
    assert.match(fala.payload.texto, /Ana/);
  });
});

test('a cobrança sai uma vez só, e não a cada segundo', () => {
  // O relógio do servidor bate de segundo em segundo. Sem a marca da
  // cobrança, a voz repetiria a mesma frase até alguém reiniciar o servidor —
  // e a live ficaria inaudível por causa de um presente.
  const { fonte, hub, relogio } = montar();
  const tela = hub.conectar(cliente('broadcast'));
  fonte.enviar(orfao({ em: relogio.t }));
  relogio.t += 20_000;
  hub.tick();
  hub.tick();
  hub.tick();
  return respirar().then(() => {
    assert.equal(tela.de('narrate').length, 1, 'a cobrança repetiu');
  });
});

test('quem escreve o número depois da cobrança ainda vota', () => {
  /*
   * A espera vence e COBRA, mas o presente não é jogado fora: ela continua de
   * pé, e o número que chega atrasado ainda decide a urna. Descartar o voto
   * seria punir a lentidão de quem já tinha pagado — e logo depois de a voz
   * ter pedido exatamente o número que a pessoa escreveu.
   */
  const { fonte, hub, relogio } = montar();
  const tela = hub.conectar(cliente('broadcast'));
  fonte.enviar(orfao({ em: relogio.t }));
  relogio.t += 20_000;
  hub.tick();
  return respirar().then(() => {
    assert.equal(tela.de('narrate').length, 1, 'a cobrança não saiu');
    tela.recebidas.length = 0;
    fonte.comentario({ userId: 'ana', userName: 'Ana', texto: '13', em: relogio.t });
    assert.equal(tela.de('vote.counted').length, 1, 'o voto tardio foi perdido');
  });
});

test('a rodada fechada esquece as esperas abertas', () => {
  /*
   * Um número que chegue depois do fim não conta — o placar já foi mostrado
   * como final. Manter a espera de pé só renderia uma cobrança falada por um
   * voto que não pode mais acontecer: a voz pedindo um número para uma urna
   * que já encerrou.
   */
  const { fonte, hub, relogio } = montar();
  const tela = hub.conectar(cliente('broadcast'));
  const painel = hub.conectar(cliente('admin'));
  fonte.enviar(orfao({ em: relogio.t }));
  falar(painel, { tipo: 'round.stop' });

  tela.recebidas.length = 0;
  relogio.t += 60_000;
  hub.tick();
  return respirar().then(() => {
    assert.equal(tela.de('narrate').length, 0, 'a voz cobrou um número para uma rodada encerrada');
    fonte.comentario({ userId: 'ana', userName: 'Ana', texto: '22', em: relogio.t });
    assert.equal(tela.de('vote.counted').length, 0, 'um voto entrou depois do fim da rodada');
  });
});

test('o painel tem como disparar o presente órfão e o número do chat', () => {
  /*
   * Sem esta porta, a espera do número só se testaria com alguém mandando um
   * presente de verdade e escrevendo no chat de uma live — que é exatamente o
   * que a aba de teste existe para evitar.
   *
   * O caminho é o mesmo da live, e não um atalho que chamasse o voto direto:
   * o presente passa pela normalização e pela contagem como qualquer outro.
   */
  const { hub, tally } = montar();
  const tela = hub.conectar(cliente('broadcast'));
  const painel = hub.conectar(cliente('admin'));
  falar(painel, { tipo: 'sim.gift', giftId: '777', userId: 'ana', userName: 'Ana' });
  assert.equal(tally.estado().total, 0, 'o presente de teste contou antes do número');
  falar(painel, { tipo: 'sim.comment', userId: 'ana', userName: 'Ana', texto: '22' });
  assert.equal(tela.de('vote.counted').length, 1, 'o caminho do painel não conta voto');
  // 22 é a urna de multiplicador 2, então um voto vale dois pontos.
  assert.equal(tally.estado().total, 2);
});

/* ------------------------------------------------------------------ o log */

/*
 * O log da live — a resposta escrita para "por que não falou nada?".
 *
 * O Leonardo mandou uma Rosa pelo botão do painel com a rodada fechada, não
 * ouviu voz nenhuma, não viu voto nenhum, e não teve onde ler o motivo. O
 * servidor sabia de tudo e não contava para ninguém. Estes testes prendem o
 * que o log precisa dizer para a próxima vez não virar mistério.
 *
 * A regra geral: todo evento que chega tem uma linha, e toda decisão que
 * envolve ficar quieto tem o MOTIVO escrito. Um log que só diz o que
 * funcionou não serve para procurar defeito — o defeito é justamente o que
 * não aconteceu.
 */

const PRESENTE_ROSA = {
  plataforma: 'simulador', userId: 'painel', usuario: 'Painel',
  giftId: '2', giftNome: 'Rosa', em: 9000,
};

test('cada evento que chega da live deixa uma linha no log', () => {
  const { hub, fonte, log } = montar();
  hub.conectar(cliente('broadcast'));
  fonte.emitir(seguir('Ana'));
  fonte.emitir({ plataforma: 'simulador', tipo: 'entrada', usuario: 'Bia', userId: 'bia' });
  fonte.emitir({ plataforma: 'simulador', tipo: 'curtida', usuario: 'Caio', userId: 'caio', quantidade: 30 });
  fonte.emitir({ plataforma: 'simulador', tipo: 'compartilhou', usuario: 'Duda', userId: 'duda' });
  fonte.emitir({ plataforma: 'simulador', tipo: 'assinatura', usuario: 'Eva', userId: 'eva' });
  fonte.emitir({ ...PRESENTE_ROSA, combo: 3 });
  return respirar().then(() => {
    const t = log.texto();
    assert.ok(log.tem(/Ana começou a seguir/), t);
    assert.ok(log.tem(/Bia entrou/), t);
    assert.ok(log.tem(/Caio.*30 curtidas/), t);
    assert.ok(log.tem(/Duda compartilhou/), t);
    assert.ok(log.tem(/Eva virou assinante/), t);
    // O combo aparece como "3x Rosa", que é como se diz — e não "Rosa x3".
    assert.ok(log.tem(/Painel mandou 3x Rosa/), t);
  });
});

test('o voto conta no log quem mandou o quê, para quem', () => {
  const { hub, fonte, log } = montar();
  hub.conectar(cliente('broadcast'));
  fonte.emitir({ ...PRESENTE_ROSA });
  return respirar().then(() => {
    const t = log.texto();
    assert.ok(log.tem(/Rosa/), t);
    assert.ok(log.tem(/Urna 2/), t, 'o log não diz para qual urna foi o voto');
    assert.ok(log.tem(/Painel/), t);
  });
});

test('o presente com a rodada fechada aparece no log E no painel', () => {
  /*
   * O defeito que abriu esta entrega, preso por um teste.
   *
   * Antes: o presente chegava, o motor recusava por rodada fechada, e NADA
   * acontecia — nem voto, nem fala, nem aviso. Um presente que não conta
   * pode não contar; o que não pode é sumir sem deixar rastro.
   */
  const { hub, fonte, log, tally } = montar();
  const painel = hub.conectar(cliente('admin'));
  tally.fecharRodada({ em: 2000, motivo: 'manual' });
  fonte.emitir({ ...PRESENTE_ROSA });
  return respirar().then(() => {
    const t = log.texto();
    assert.ok(log.tem(/Rodada fechada|rodada fechada/), `o log não explicou a recusa:\n${t}`);
    assert.ok(log.tem(/Rosa/), t);

    falar(painel, { tipo: 'state.request' });
    const avisos = painel.ultima().payload.tally.avisos;
    assert.ok(
      avisos.some((a) => /Rosa/.test(a.texto)),
      `o painel não avisou nada sobre o presente: ${JSON.stringify(avisos)}`,
    );
  });
});

test('a fala sai no log antes de virar som', () => {
  // A linha `[voz]` é a do `tiktok-live-horse`, palavra por palavra: é o que a
  // voz está dizendo AGORA, e é o que se lê para saber se a frase saiu certa.
  const voz = vozDeMentira({ arquivo: 'x.wav' });
  const { hub, fonte, log } = montar({ voz });
  hub.conectar(cliente('broadcast'));
  fonte.emitir(seguir('Ana'));
  return respirar().then(() => {
    const fala = log.linhas.find((l) => l.assunto === 'voz' && /Ana/.test(l.texto));
    assert.ok(fala, `nenhuma linha de voz no log:\n${log.texto()}`);
  });
});

test('o silêncio do narrador chega ao log com o motivo', () => {
  /*
   * A metade que faltava. O narrador cala por cooldown, por limiar de curtida,
   * por lista vazia no painel — e antes disso tudo era o mesmo silêncio mudo
   * na tela. "Não falou nada" não é diagnóstico; "já foi anunciado, faltam
   * 50s" é.
   */
  const { hub, fonte, log } = montar();
  hub.conectar(cliente('broadcast'));
  fonte.emitir(seguir('Ana', 'ana'));
  fonte.emitir(seguir('Ana', 'ana'));
  return respirar().then(() => {
    const t = log.texto();
    assert.ok(log.tem(/silêncio/), t);
    assert.ok(log.tem(/Ana/), t);
    assert.ok(log.tem(/cooldown|faltam/, t), t);
  });
});

test('sem tela nenhuma conectada, o log avisa que a fala não vai ser ouvida', () => {
  // Servidor falando para uma live sem página aberta é indistinguível de um
  // servidor mudo, para quem está na frente do computador ouvindo.
  const { fonte, log } = montar();
  fonte.emitir(seguir('Ana'));
  return respirar().then(() => {
    assert.ok(log.tem(/nenhuma tela/i), `o log não avisou:\n${log.texto()}`);
  });
});

test('a voz que falha aparece no log, com o motivo', () => {
  const voz = vozDeMentira({ erro: 'não achei a voz Francisca' });
  const { hub, fonte, log } = montar({ voz });
  const tela = hub.conectar(cliente('broadcast'));
  fonte.emitir(seguir('Ana'));
  return respirar().then(() => {
    assert.ok(log.tem(/não achei a voz Francisca/), `o erro não foi para o log:\n${log.texto()}`);
    assert.equal(tela.de('narrate').length, 1, 'a faixa deixou de sair');
  });
});

test('a fila cheia diz no log quem ficou sem voz', () => {
  const voz = vozDeMentira({ arquivo: 'x.wav', atrasos: new Array(20).fill(40) });
  const { hub, fonte, log } = montar({ voz });
  hub.conectar(cliente('broadcast'));
  for (let i = 1; i <= 8; i += 1) fonte.emitir(seguir(`Pessoa ${i}`, `p${i}`));
  return respirar(500).then(() => {
    const t = log.texto();
    assert.ok(log.tem(/fila cheia/i), t);
    assert.ok(log.tem(/Pessoa 7|Pessoa 8/), `o log não diz quem perdeu a fala:\n${t}`);
  });
});

test('a rodada que abre e fecha fica registrada', () => {
  // Sem estas duas linhas, uma fala que não saiu às 21h não tem como ser
  // amarrada ao momento em que a rodada virou.
  const { hub, log } = montar();
  const painel = hub.conectar(cliente('admin'));
  falar(painel, { tipo: 'round.stop' });
  falar(painel, { tipo: 'round.start' });
  const t = log.texto();
  assert.ok(log.tem(/rodada encerrada/i), t);
  assert.ok(log.tem(/rodada aberta|rodada começou/i), t);
});

test('toda fala que sai vira uma linha, na ordem em que sai', () => {
  /*
   * O Leonardo pediu com todas as letras: "log de todas as falas também, toda
   * fala que falar".
   *
   * O que este teste prende é a IGUALDADE entre o que a live falou e o que o
   * log escreveu — mesma quantidade, mesma ordem, mesmo texto. Um log que
   * perde uma fala no meio é pior que nenhum: ele faz procurar defeito onde
   * não tem, e esconder o que tem.
   */
  const voz = vozDeMentira({ arquivo: 'x.wav' });
  const { hub, fonte, log } = montar({ voz });
  const tela = hub.conectar(cliente('broadcast'));
  fonte.emitir(seguir('Ana', 'ana'));
  fonte.emitir(seguir('Bia', 'bia'));
  fonte.emitir(seguir('Caio', 'caio'));
  return respirar(200).then(() => {
    const faladas = tela.de('narrate').map((m) => m.payload.texto);
    const escritas = log.linhas
      .filter((l) => l.assunto === 'voz' && l.texto.startsWith('🗣'))
      .map((l) => l.texto.replace(/^🗣 "/, '').replace(/"$/, ''));
    assert.deepEqual(escritas, faladas, `o log não bate com o que a live falou:\n${log.texto()}`);
    assert.equal(escritas.length, 3, 'faltou fala no log');
  });
});
