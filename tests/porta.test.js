import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pidDoNetstat, mensagemDePortaOcupada } from '../server/porta.js';

/*
 * A porta ocupada — o tropeço mais banal e mais irritante de todos.
 *
 * O Leonardo reclamou disto em uma linha: "nao quero ter q dar taskkill e tal
 * para reiniciar". O `EADDRINUSE` do Node cospe uma pilha de chamadas e não diz
 * QUEM está segurando a porta nem o que fazer a respeito — então a saída dele
 * era caçar o PID na mão, no meio do que ele estava fazendo.
 *
 * O perigo desta função não é ela não achar nada: é ela achar o processo
 * ERRADO. O `netstat` mostra a porta 3000 em DUAS linhas diferentes quando há
 * um navegador aberto — a do servidor, que escuta, e a da conexão, que só
 * menciona a porta do outro lado. Pegar a segunda e mandar matar aquele PID
 * fecharia o navegador do Leonardo, que é justamente onde a urna está rodando.
 * Por isso o teste da linha de conexão existe, e por isso ele é o primeiro.
 */

/* Um `netstat -ano` de verdade, no formato do Windows 11 em português —
 * inclusive a linha de conexão e a porta vizinha, que são as armadilhas. */
const NETSTAT = `
Conexões ativas

  Proto  Endereço local         Endereço externo        Estado           PID
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1024
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       23144
  TCP    127.0.0.1:52344        127.0.0.1:3000         ESTABLISHED     8820
  TCP    127.0.0.1:52345        127.0.0.1:3000         ESTABLISHED     8820
  TCP    [::]:3000              [::]:0                 LISTENING       23144
  TCP    0.0.0.0:3001           0.0.0.0:0              LISTENING       777
  UDP    0.0.0.0:3000           *:*                                    23144
  TCP    0.0.0.0:30000          0.0.0.0:0              LISTENING       555
`;

test('acha o PID de quem escuta a porta', () => {
  assert.equal(pidDoNetstat(NETSTAT, 3000), 23144);
});

test('não confunde a conexão que só menciona a porta com quem a escuta', () => {
  /*
   * As duas linhas ESTABLISHED têm `127.0.0.1:3000` — mas no campo do
   * ENDEREÇO EXTERNO, que é o navegador falando com o servidor. O PID delas
   * (8820) é o do navegador. Quem escuta está no endereço LOCAL.
   *
   * Se este teste cair, a mensagem vai mandar o Leonardo matar o navegador
   * dele — e a urna que ele está capturando no OBS morre junto.
   */
  assert.notEqual(pidDoNetstat(NETSTAT, 3000), 8820);
});

test('não confunde a porta com a vizinha nem com o prefixo dela', () => {
  // `3001` e `30000` contêm "300" e "3000" como texto. Comparar pedaço de
  // string em vez da porta inteira mandaria matar o servidor errado — e na
  // máquina do Leonardo há sempre alguma outra coisa rodando.
  assert.equal(pidDoNetstat(NETSTAT, 3001), 777);
  assert.equal(pidDoNetstat(NETSTAT, 30000), 555);
});

test('sem ninguém na porta, devolve null', () => {
  // É o caminho normal: a porta está livre e não há nada a dizer. Devolver o
  // primeiro PID que aparecer seria pior do que não devolver nada.
  assert.equal(pidDoNetstat(NETSTAT, 4321), null);
  assert.equal(pidDoNetstat('', 3000), null);
});

test('aguenta a saída vazia e a linha truncada do netstat', () => {
  // O `findstr` do Windows devolve linha vazia quando não acha nada, e o
  // netstat já foi visto devolvendo linha pela metade sob carga.
  assert.equal(pidDoNetstat('\n\n   \n', 3000), null);
  assert.equal(pidDoNetstat('  TCP    0.0.0.0:3000', 3000), null);
});

/* ------------------------------------------------------------ a mensagem */

test('a mensagem com PID traz o comando exato e o motivo', () => {
  const m = mensagemDePortaOcupada(3000, 23144);
  assert.match(m, /3000/, 'não disse qual porta');
  // O comando tem que estar pronto para colar: se ele tiver que montar a
  // linha, a mensagem não serviu para nada.
  assert.match(m, /taskkill \/PID 23144 \/F/, 'não trouxe o comando de matar');
  assert.match(m, /já está rodando|outra instância/i, 'não disse o motivo mais comum');
});

test('a mensagem de porta ocupada oferece o reiniciar de uma linha', () => {
  /*
   * O Leonardo foi literal: "nao quero ter q dar taskkill e tal para
   * reiniciar". O `npm run reiniciar` foi escrito para isso — derruba quem
   * está na porta e sobe de novo, na mesma janela, sem ele caçar PID nenhum.
   *
   * Só que ele não aparecia AQUI, que é onde o Leonardo esbarra de verdade:
   * no terminal, com a live esperando. Um comando que existe e não é
   * oferecido na única mensagem que ele lê não resolve nada — ele continua
   * copiando o `taskkill`, que é exatamente o que ele pediu para não fazer.
   *
   * Vale nas duas mensagens, inclusive na que não achou o PID: o reiniciar
   * descobre sozinho quem está segurando, então é justamente aí que ele é a
   * resposta mais útil.
   */
  for (const m of [mensagemDePortaOcupada(3000, 23144), mensagemDePortaOcupada(3000, null)]) {
    assert.match(m, /npm run reiniciar/, 'não ofereceu o reiniciar de uma linha');
  }

  // E vem ANTES do taskkill: é a resposta que ele pediu, e a única que não
  // exige copiar PID nenhum. Enterrada embaixo do comando bruto, ela não é
  // lida — e o Leonardo volta a fazer o que ele já disse que não quer.
  const comPid = mensagemDePortaOcupada(3000, 23144);
  assert.ok(comPid.indexOf('npm run reiniciar') < comPid.indexOf('taskkill'),
    'o taskkill apareceu antes do reiniciar: a resposta boa ficou escondida');
});

test('a mensagem sem PID não manda matar ninguém', () => {
  /*
   * Sem PID não há o que matar, e "taskkill /PID null /F" seria pior do que
   * silêncio: o Windows reclamaria de um PID inválido e o Leonardo ficaria
   * achando que o problema é outro.
   */
  const m = mensagemDePortaOcupada(3000, null);
  assert.match(m, /3000/);
  assert.doesNotMatch(m, /taskkill/i, 'mandou matar um PID que não existe');
  assert.doesNotMatch(m, /null/i, 'vazou um null para a tela do Leonardo');
});

test('as duas mensagens dizem como rodar em outra porta sem matar nada', () => {
  // Matar processo é a saída bruta. Quem só quer subir uma segunda instância
  // para comparar precisa saber que dá para trocar de porta e pronto.
  for (const m of [mensagemDePortaOcupada(3000, 23144), mensagemDePortaOcupada(3000, null)]) {
    assert.match(m, /PORT=3001/, 'não disse como trocar de porta');
  }
});

/* ------------------------------------------------- e o servidor de verdade */

test('o servidor explica a porta ocupada em vez de cuspir a pilha do Node', async () => {
  /*
   * As funções acima estão certas; este teste é sobre elas estarem LIGADAS.
   * Um `mensagemDePortaOcupada` perfeito que ninguém chama deixaria o
   * Leonardo exatamente onde ele estava — e é o tipo de fiação que se
   * desfaz sozinha num refactor, sem nenhum outro teste notar.
   *
   * Sobe o `server/index.js` de verdade, como processo separado, com a porta
   * já tomada por um servidor de verdade. É a única forma de exercitar o
   * bloco que só roda quando o arquivo é executado direto.
   */
  const PORTADOR = createServer(() => {});
  // Sem host, igual ao servidor: `listen(porta)` sem endereço sobe em `::`,
  // e um portador preso ao `127.0.0.1` NÃO impede essa ligação — o teste
  // passaria 20 segundos esperando um servidor que subiu sem erro nenhum.
  await new Promise((ok) => PORTADOR.listen(0, ok));
  const porta = PORTADOR.address().port;

  try {
    const saida = await new Promise((ok, falha) => {
      const p = spawn(process.execPath, [fileURLToPath(new URL('../server/index.js', import.meta.url))], {
        env: { ...process.env, PORT: String(porta) },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let texto = '';
      p.stdout.on('data', (d) => { texto += d; });
      p.stderr.on('data', (d) => { texto += d; });
      const prazo = setTimeout(() => { p.kill(); falha(new Error('o servidor não saiu sozinho')); }, 20_000);
      p.on('exit', (codigo) => { clearTimeout(prazo); ok({ texto, codigo }); });
    });

    assert.match(saida.texto, new RegExp(`A porta ${porta} já está ocupada`));
    assert.match(saida.texto, /taskkill \/PID \d+ \/F/, 'não disse o que fazer');
    // A pilha de chamadas do Node é justamente o que se está substituindo.
    assert.doesNotMatch(saida.texto, /at Object\.<anonymous>/, 'caiu na pilha do Node');
    assert.doesNotMatch(saida.texto, /Unhandled 'error' event/, 'morreu sem tratar o erro');
    assert.equal(saida.codigo, 1, 'saiu com código diferente de 1');
  } finally {
    PORTADOR.close();
  }
});
