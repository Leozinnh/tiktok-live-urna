import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularEspera, urlDoSocket, criarRede } from '../public/js/net.js';

/*
 * O canal da página com o servidor.
 *
 * A reconexão não é enfeite: a fonte de navegador do OBS fica aberta a noite
 * inteira, e o servidor vai ser reiniciado no meio dela pelo menos uma vez —
 * quando o Leonardo mexer em alguma coisa. Sem reconexão automática, a tela
 * fica preta até alguém recarregar na mão, e ele só descobre quando um
 * espectador avisa no chat.
 *
 * O WebSocket é injetado, e não dublado por cima do global: o que se testa
 * aqui é a POLÍTICA de reconexão — quando tentar, quanto esperar, o que
 * mandar ao voltar. O transporte em si é do navegador, e quem o confere é a
 * sonda, contra o servidor de verdade.
 */

/** Um WebSocket de mentira, do tamanho exato do que a rede usa. */
function criarFabricaDeSockets() {
  const abertos = [];
  const fabrica = (url) => {
    const s = {
      url,
      enviados: [],
      fechado: false,
      // O navegador só deixa `send` passar no estado ABERTO (1). Sem isto a
      // fábrica seria mais permissiva do que o WebSocket de verdade, e o
      // teste passaria por um caminho que não existe.
      readyState: 0,
      send: (t) => s.enviados.push(JSON.parse(t)),
      close: () => { s.fechado = true; s.readyState = 3; },
      // Os gatilhos, para o teste conduzir a conversa:
      conectar: () => { s.readyState = 1; s.onopen?.({}); },
      derrubar: () => { if (!s.fechado) { s.readyState = 3; s.onclose?.({}); } },
      receber: (obj) => s.onmessage?.({ data: JSON.stringify(obj) }),
      receberCru: (texto) => s.onmessage?.({ data: texto }),
    };
    abertos.push(s);
    return s;
  };
  fabrica.abertos = abertos;
  fabrica.ultimo = () => abertos[abertos.length - 1];
  return fabrica;
}

const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

function montar(extra = {}) {
  const criarSocket = criarFabricaDeSockets();
  const mensagens = [];
  const status = [];
  const rede = criarRede({
    url: 'ws://localhost:3000/ws?papel=broadcast',
    criarSocket,
    aoMensagem: (m) => mensagens.push(m),
    aoStatus: (s) => status.push(s),
    base: 5,
    teto: 20,
    ...extra,
  });
  return { rede, criarSocket, mensagens, status };
}

/* --------------------------------------------------------------- a conta */

test('a espera dobra a cada tentativa e para no teto', () => {
  /*
   * 500ms, 1s, 2s, 4s, 8s — e daí em diante 8s para sempre. Sem o teto, a
   * décima tentativa esperaria oito minutos e meia, e o Leonardo acharia que
   * a página travou sem ter como saber que ela ainda estava tentando.
   */
  const t = (n) => calcularEspera(n);
  assert.deepEqual([t(0), t(1), t(2), t(3), t(4)], [500, 1000, 2000, 4000, 8000]);
  assert.equal(t(5), 8000, 'a décima tentativa devia continuar no teto');
  assert.equal(t(50), 8000);
  assert.equal(calcularEspera(0, { base: 100, teto: 250 }), 100);
  assert.equal(calcularEspera(9, { base: 100, teto: 250 }), 250);
});

test('o endereço do socket acompanha a página', () => {
  /*
   * Uma página servida por https não pode abrir um `ws://` — o navegador
   * bloqueia o conteúdo misto e a conexão morre calada. Hoje o servidor é
   * http na máquina do Leonardo, mas a regra é a mesma do resto do projeto:
   * não escrever a coisa que só funciona no caso de hoje.
   */
  assert.equal(urlDoSocket('http://localhost:3000', 'broadcast'), 'ws://localhost:3000/ws?papel=broadcast');
  assert.equal(urlDoSocket('https://arena.exemplo', 'admin'), 'wss://arena.exemplo/ws?papel=admin');
  assert.equal(urlDoSocket('http://127.0.0.1:8080/', 'broadcast'), 'ws://127.0.0.1:8080/ws?papel=broadcast');
});

/* ----------------------------------------------------------- a conversa */

test('a primeira conexão é imediata', () => {
  // Abrir a página e esperar meio segundo para a tela saber de si mesma
  // seria meio segundo de placar vazio no ar.
  const { rede, criarSocket } = montar();
  rede.abrir();
  assert.equal(criarSocket.abertos.length, 1);
  assert.equal(criarSocket.ultimo().url, 'ws://localhost:3000/ws?papel=broadcast');
  rede.fechar();
});

test('ao conectar, ele se apresenta e pede o retrato', () => {
  /*
   * É a mensagem mais importante da reconexão: a página que volta no meio da
   * rodada não recebe o histórico por push — ela pergunta. Sem isto, o
   * placar voltaria do zero e a live mostraria a contagem errada até o
   * próximo voto.
   */
  const { rede, criarSocket } = montar();
  rede.abrir();
  criarSocket.ultimo().conectar();
  assert.deepEqual(criarSocket.ultimo().enviados, [{ tipo: 'hello', papel: 'broadcast' }]);
  rede.fechar();
});

test('a mensagem que chega vira objeto para quem ouve', () => {
  const { rede, criarSocket, mensagens } = montar();
  rede.abrir();
  criarSocket.ultimo().conectar();
  criarSocket.ultimo().receber({ tipo: 'tally.update', payload: { total: 7 } });
  assert.deepEqual(mensagens, [{ tipo: 'tally.update', payload: { total: 7 } }]);
  rede.fechar();
});

test('mensagem ilegível não derruba a conexão', () => {
  // Seção 7: a live não para por causa de um erro. Um quadro cortado no meio
  // do caminho vira exceção no `JSON.parse`, e a página não pode morrer por
  // causa disso.
  const { rede, criarSocket, mensagens } = montar();
  rede.abrir();
  criarSocket.ultimo().conectar();
  criarSocket.ultimo().receberCru('{isto não é json');
  criarSocket.ultimo().receberCru('null');
  criarSocket.ultimo().receber({ tipo: 'state.full', payload: {} });
  assert.equal(mensagens.length, 1);
  assert.equal(mensagens[0].tipo, 'state.full');
  rede.fechar();
});

/* --------------------------------------------------------- a reconexão */

test('quando a conexão cai, ele tenta de novo sozinho', async () => {
  const { rede, criarSocket } = montar();
  rede.abrir();
  criarSocket.ultimo().conectar();
  criarSocket.ultimo().derrubar();
  await espera(30);
  assert.equal(criarSocket.abertos.length, 2, 'a página ficou sem tentar de novo');
  rede.fechar();
});

test('e a espera cresce enquanto o servidor não volta', async () => {
  /*
   * O servidor que está fora do ar há um minuto não vai voltar no próximo
   * milissegundo. Martelar a porta a cada 5ms enquanto o Leonardo reinicia o
   * servidor encheria o console de erro e não adiantaria a reconexão em
   * nada.
   *
   * A prova é o contador, e não um cronômetro: comparar "esperou 10ms" com
   * "esperou 5ms" por relógio de parede dá um teste que passa dos dois
   * jeitos — foi assim que a primeira versão deste arquivo deixou a mutação
   * do zeramento passar batido. `calcularEspera` já está provada pura lá em
   * cima; aqui basta provar que o contador que a alimenta sobe e desce.
   */
  const { rede, criarSocket } = montar();
  rede.abrir();
  assert.equal(rede.estado().tentativas, 0);
  criarSocket.ultimo().derrubar();
  assert.equal(rede.estado().tentativas, 1, 'a queda não contou uma tentativa');
  await espera(10);
  assert.equal(criarSocket.abertos.length, 2);
  criarSocket.ultimo().derrubar();
  assert.equal(rede.estado().tentativas, 2, 'a segunda queda não dobrou a espera');
  await espera(25);
  assert.equal(criarSocket.abertos.length, 3, 'não tentou depois de 10ms');
  rede.fechar();
});

test('uma conexão que dá certo zera a espera', async () => {
  /*
   * Sem o zeramento, uma oscilação de rede às 21h deixaria a página
   * reconectando a cada 8 segundos pela live inteira, mesmo com o servidor
   * de pé e saudável.
   */
  const { rede, criarSocket } = montar();
  rede.abrir();
  criarSocket.ultimo().derrubar();
  await espera(10);
  assert.equal(rede.estado().tentativas, 1);
  criarSocket.ultimo().conectar();
  assert.equal(rede.estado().tentativas, 0, 'a conexão boa não zerou a espera');
  rede.fechar();
});

test('ele conta para a página quando cai e quando volta', async () => {
  // O painel mostra o estado da conexão. Uma queda silenciosa deixaria o
  // Leonardo sem saber que a tela parou de receber voto.
  const { rede, criarSocket, status } = montar();
  rede.abrir();
  criarSocket.ultimo().conectar();
  criarSocket.ultimo().derrubar();
  await espera(15);
  assert.deepEqual(status.map((s) => s.conectado), [true, false]);
  rede.fechar();
});

test('fechar de propósito não reabre', async () => {
  /*
   * A página descarregando fecha o socket, e sem esta guarda ela abriria
   * outro — e outro, e outro — enquanto o navegador ainda estivesse
   * descarregando. O `fechar` é do dono da rede, e não uma queda.
   */
  const { rede, criarSocket } = montar();
  rede.abrir();
  criarSocket.ultimo().conectar();
  rede.fechar();
  criarSocket.ultimo().derrubar();
  await espera(40);
  assert.equal(criarSocket.abertos.length, 1, 'reabriu depois de fechar');
});

test('abrir duas vezes não abre dois canais', () => {
  // O mesmo motivo do `montarCenario`: um duplo `abrir` daria dois sockets
  // recebendo os mesmos votos, e cada voto apareceria duas vezes na tela.
  const { rede, criarSocket } = montar();
  rede.abrir();
  rede.abrir();
  assert.equal(criarSocket.abertos.length, 1);
  rede.fechar();
});
