import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { criarServidor, montarMotor } from '../server/index.js';
import { codificarFrame, decodificarFrames, chaveDeAceite } from '../server/ws.js';
import { normalizar } from '../server/config.js';

/*
 * A ponte — o servidor de verdade, um socket de verdade, o handshake de
 * verdade.
 *
 * O hub já está provado com clientes de mentira, e o transporte já está
 * provado com bytes de mentira. O que só se prova aqui é a JUNÇÃO: o
 * `upgrade` do HTTP escolhendo o caminho, o quadro do navegador chegando
 * inteiro no outro lado, e a página recebendo o retrato por um socket real.
 *
 * É o último teste antes da sonda no navegador, e existe porque as duas
 * metades passarem não quer dizer nada sobre o pedaço onde elas se
 * encontram — que é sempre onde o defeito mora.
 */

const CONFIG = normalizar({
  urnas: {
    u1: { id: 'u1', nome: 'Urna 1', numero: '22', multiplicador: 2 },
    u2: { id: 'u2', nome: 'Urna 2', numero: '13', multiplicador: 1 },
  },
  presentes: [{ id: 'p2', nome: 'Rosa', giftId: '2', urnaId: 'u2', votos: 1 }],
  rodada: { duracaoSegundos: 300 },
}).config;

let servidor;
let porta;
let motor;

before(async () => {
  motor = montarMotor({ config: CONFIG });
  servidor = criarServidor({
    raiz: fileURLToPath(new URL('../public/', import.meta.url)),
    motor,
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  porta = servidor.address().port;
});

after(() => servidor.close());

/**
 * Um navegador de mentira, do lado do fio.
 *
 * Fala o protocolo como o navegador fala — chave aleatória, quadros
 * MASCARADOS — porque é justamente a máscara uma das coisas que o servidor
 * precisa aceitar e que nenhum teste interno exercita.
 */
async function abrir(papel = 'broadcast') {
  const socket = connect(porta, '127.0.0.1');
  const chave = randomBytes(16).toString('base64');
  const recebidas = [];
  const esperas = [];
  let bruto = Buffer.alloc(0);
  let quadros = Buffer.alloc(0);
  let resposta = null;
  let aoAbrir;
  const abriu = new Promise((ok) => { aoAbrir = ok; });

  socket.on('data', (pedaco) => {
    bruto = Buffer.concat([bruto, pedaco]);
    if (!resposta) {
      const fim = bruto.indexOf('\r\n\r\n');
      if (fim < 0) return;
      resposta = bruto.subarray(0, fim).toString('utf8');
      quadros = bruto.subarray(fim + 4);
      bruto = Buffer.alloc(0);
      aoAbrir();
    } else {
      quadros = Buffer.concat([quadros, pedaco]);
    }
    const { mensagens, resto } = decodificarFrames(quadros, { exigirMascara: false });
    quadros = resto;
    for (const texto of mensagens) {
      const msg = JSON.parse(texto);
      recebidas.push(msg);
      const i = esperas.findIndex((e) => e.tipo === msg.tipo);
      if (i >= 0) esperas.splice(i, 1)[0].resolver(msg);
    }
  });

  socket.write([
    `GET /ws?papel=${papel} HTTP/1.1`,
    `Host: 127.0.0.1:${porta}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${chave}`,
    'Sec-WebSocket-Version: 13',
    '', '',
  ].join('\r\n'));

  return {
    socket,
    chave,
    recebidas,
    resposta: async () => { await abriu; return resposta; },
    enviar(msg) {
      socket.write(mascara(Buffer.from(JSON.stringify(msg), 'utf8')));
    },
    /** Escreve o quadro em dois pedaços, como a rede faz sem avisar. */
    enviarPicado(msg) {
      const quadro = mascara(Buffer.from(JSON.stringify(msg), 'utf8'));
      const meio = Math.floor(quadro.length / 2);
      socket.write(quadro.subarray(0, meio));
      setTimeout(() => socket.write(quadro.subarray(meio)), 20);
    },
    esperarPor(tipo, ms = 3000) {
      const ja = recebidas.find((m) => m.tipo === tipo);
      if (ja) return Promise.resolve(ja);
      return new Promise((ok, falha) => {
        const t = setTimeout(
          () => falha(new Error(`não chegou "${tipo}"; chegaram: ${recebidas.map((m) => m.tipo).join(', ') || 'nada'}`)),
          ms,
        );
        esperas.push({ tipo, resolver: (m) => { clearTimeout(t); ok(m); } });
      });
    },
    fechar: () => socket.destroy(),
  };
}

/** Mascara um payload como o navegador faz — RFC 6455, seção 5.3. */
function mascara(payload) {
  const chave = randomBytes(4);
  const corpo = Buffer.from(payload);
  for (let i = 0; i < corpo.length; i++) corpo[i] ^= chave[i % 4];
  const cabecalho = Buffer.alloc(6);
  cabecalho[0] = 0x81;
  cabecalho[1] = 0x80 | corpo.length;
  chave.copy(cabecalho, 2);
  return Buffer.concat([cabecalho, corpo]);
}

/* ---------------------------------------------------------- o handshake */

test('o upgrade responde 101 com a chave que o navegador mandou', async () => {
  /*
   * Sem o aceite certo, o navegador recusa a conexão CALADO e a tela fica
   * preta sem nenhum erro no console do servidor — o defeito mais caro de
   * achar de todos, porque não há nada para ler em lugar nenhum. A conta é
   * refeita aqui por fora, com a chave que este cliente mandou.
   */
  const p = await abrir();
  const resposta = await p.resposta();
  assert.match(resposta, /^HTTP\/1\.1 101 Switching Protocols/);
  assert.match(resposta, /Upgrade: websocket/i);
  const aceite = resposta.match(/Sec-WebSocket-Accept: (\S+)/)[1];
  assert.equal(aceite, chaveDeAceite(p.chave));
  assert.equal(aceite.length, 28, 'o SHA-1 em base64 tem 28 caracteres');
  p.fechar();
});

/* ------------------------------------------------------------ o retrato */

test('a página que se apresenta recebe o retrato inteiro pelo socket', async () => {
  const p = await abrir();
  await p.resposta();
  p.enviar({ tipo: 'hello', papel: 'broadcast' });
  const m = await p.esperarPor('state.full');
  assert.equal(m.payload.config.urnas.u2.numero, '13');
  assert.equal(m.payload.tally.total, 0);
  assert.equal(m.payload.rodada.aberta, true);
  p.fechar();
});

test('a tela não recebe os avisos, mas o painel recebe', async () => {
  /*
   * O papel vem da URL da conexão — é o `?papel=admin` que a página do
   * painel põe, e é assim que as duas se distinguem sem ninguém precisar se
   * anunciar numa mensagem. Este teste existe porque a distinção atravessa
   * três arquivos: a URL, o `upgrade` e o hub.
   */
  const tela = await abrir('broadcast');
  const painel = await abrir('admin');
  await tela.resposta();
  await painel.resposta();
  tela.enviar({ tipo: 'hello', papel: 'broadcast' });
  painel.enviar({ tipo: 'hello', papel: 'admin' });
  assert.deepEqual((await tela.esperarPor('state.full')).payload.tally.avisos, []);
  const doPainel = await painel.esperarPor('state.full');
  assert.ok(Array.isArray(doPainel.payload.tally.avisos));
  assert.equal(doPainel.payload.fonte.modo, 'simulador');
  tela.fechar();
  painel.fechar();
});

/* --------------------------------------------------------------- o voto */

test('o presente que o painel dispara anima na tela', async () => {
  /*
   * O caminho inteiro, de ponta a ponta, por sockets de verdade: o painel
   * manda `sim.gift`, a fonte normaliza, o motor conta, o hub conta para as
   * páginas, e a tela recebe o pedido de animação com o número e o
   * candidato que a mão vai digitar.
   */
  const painel = await abrir('admin');
  const tela = await abrir('broadcast');
  await painel.resposta();
  await tela.resposta();
  painel.enviar({ tipo: 'sim.gift', giftId: '2', userId: 'ana', userName: 'Ana' });

  const animacao = await tela.esperarPor('vote.animate');
  assert.equal(animacao.payload.numero, '13');
  assert.equal(animacao.payload.usuario, 'Ana');
  assert.deepEqual(animacao.payload.candidato, CONFIG.urnas.u2.candidato);

  const contagem = await tela.esperarPor('vote.counted');
  assert.equal(contagem.payload.presente, 'Rosa');
  const placar = await tela.esperarPor('tally.update');
  assert.equal(placar.payload.total, 1);
  assert.equal(placar.payload.diferenca, 1, 'uma urna com 1 e outra com 0 distam 1');

  painel.fechar();
  tela.fechar();
});

test('um quadro escrito em dois pedaços chega inteiro, e uma vez só', async () => {
  /*
   * O caso que o `resto` do decodificador existe para atender, agora com a
   * rede de verdade no meio. Ler o pedaço faria o motor receber um JSON
   * truncado e recusar um voto que existiu.
   */
  const p = await abrir('admin');
  await p.resposta();
  p.enviarPicado({ tipo: 'sim.gift', giftId: '2', userId: 'bia', userName: 'Bia' });
  const m = await p.esperarPor('vote.counted');
  assert.equal(m.payload.usuario, 'Bia');
  assert.equal(p.recebidas.filter((x) => x.tipo === 'vote.counted').length, 1);
  p.fechar();
});

test('a página de transmissão não consegue disparar presente pelo socket', async () => {
  // A trava de papel, provada no fio: não adianta o hub recusar se a URL
  // deixasse a tela se declarar painel — e é isso que este teste confere.
  const tela = await abrir('broadcast');
  await tela.resposta();
  tela.enviar({ tipo: 'hello', papel: 'broadcast' });
  await tela.esperarPor('state.full');
  tela.enviar({ tipo: 'sim.gift', giftId: '2', userId: 'trapaca' });
  await assert.rejects(
    () => tela.esperarPor('vote.counted', 300),
    /não chegou/,
    'a tela conseguiu injetar um voto',
  );
  tela.fechar();
});
