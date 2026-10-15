import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco } from '../server/db.js';
import { criarTally } from '../server/tally.js';
import { criarHub } from '../server/hub.js';
import { criarSimulador } from '../server/sources/simulator.js';
import { normalizar } from '../server/config.js';

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
    { id: 'p1', nome: 'Joinha', giftId: '1', urnaId: 'u1', votos: 1 },
    { id: 'p2', nome: 'Rosa', giftId: '2', urnaId: 'u2', votos: 1 },
  ],
  rodada: { duracaoSegundos: 300 },
}).config;

function montar({ agora, voz = null, config = CONFIG } = {}) {
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
    agora: () => relogio.t,
    aoSalvar: (nova) => hubs.push(nova),
  });
  fonte.iniciar();
  return {
    db, tally, fonte, hub, relogio,
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

test('o presente NÃO vira narração', () => {
  /*
   * O presente já tem o espetáculo dele: a mão digita, a urna apita, a cédula
   * cai e o placar sobe. Falar por cima disso seria anunciar de novo o que a
   * tela inteira acabou de mostrar — e numa live de presentes em sequência a
   * voz cobriria a própria animação.
   */
  const { hub, fonte } = montar();
  const tela = hub.conectar(cliente('broadcast'));
  fonte.emitir({ plataforma: 'simulador', userId: 'ana', giftId: '1', em: 5 });
  return respirar().then(() => {
    assert.equal(tela.de('vote.counted').length, 1);
    assert.equal(tela.de('narrate').length, 0, 'o presente virou narração');
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
