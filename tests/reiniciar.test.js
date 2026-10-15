import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { reiniciar } from '../server/reiniciar.js';

/*
 * O reinício em um comando.
 *
 * O Leonardo perguntou isso com todas as letras: "e como inicio? se ja tem um
 * processo dele antigo rodando". A resposta antiga era um `taskkill` que ele
 * tinha de copiar e colar — e a resposta dele a isso já estava registrada:
 * "nao quero ter q dar taskkill e tal para reiniciar".
 *
 * O que estes testes protegem é a ORDEM das coisas, porque é aí que mora o
 * defeito caro: subir antes de a porta liberar produz o mesmo `EADDRINUSE` de
 * antes, com a diferença de que agora parece que o comando não funcionou.
 * Matar antes de saber QUEM mata é pior ainda — é matar o processo errado.
 */

/** Um `reiniciar` com o mundo inteiro de mentira, e a ordem registrada. */
function bancada({ pid = 23144, livreDepoisDe = 2, matarFalha = null, ocupadaSempre = false } = {}) {
  const eventos = [];
  let consultas = 0;

  const mundo = {
    eventos,
    async descobrir() {
      consultas++;
      eventos.push(`descobrir:${consultas}`);
      // A porta só aparece livre depois de `livreDepoisDe` olhadas — como o
      // Windows de verdade, que leva um instante para soltar o socket.
      if (ocupadaSempre) return pid;
      return consultas >= livreDepoisDe ? null : pid;
    },
    async matar(p) {
      eventos.push(`matar:${p}`);
      if (matarFalha) throw new Error(matarFalha);
    },
    async esperar(ms) { eventos.push(`esperar:${ms}`); },
    iniciar() { eventos.push('iniciar'); return { encerrar() {} }; },
    avisar(texto) { eventos.push(`avisar:${texto}`); },
  };
  return { mundo, eventos };
}

test('sem ninguém na porta, não mata nada e sobe assim mesmo', async () => {
  // É o caminho de quem só quer subir o servidor e usou o comando errado. O
  // comando não pode RECUSAR: ele tem que fazer o que a pessoa queria.
  const { mundo, eventos } = bancada({ livreDepoisDe: 1 });
  const r = await reiniciar({ porta: 3000, ...mundo });

  assert.deepEqual(eventos.filter((e) => e.startsWith('matar')), [], 'matou alguém sem precisar');
  assert.ok(eventos.includes('iniciar'), 'não subiu o servidor');
  assert.equal(r.derrubou, false);
  assert.equal(r.pid, null);
  assert.equal(r.subiu, true);
});

test('mata o processo certo e só sobe depois de a porta liberar', async () => {
  /*
   * A ordem é o teste. Matar e subir de uma vez produziria o mesmo erro de
   * porta ocupada de antes — e com a agravante de parecer que o reinício
   * funcionou.
   */
  const { mundo, eventos } = bancada({ livreDepoisDe: 3 });
  const r = await reiniciar({ porta: 3000, ...mundo });

  assert.ok(eventos.includes('matar:23144'), 'não matou quem estava na porta');
  const posicaoDaMorte = eventos.indexOf('matar:23144');
  const posicaoDaSubida = eventos.indexOf('iniciar');
  assert.ok(posicaoDaMorte < posicaoDaSubida, 'subiu antes de matar');
  // E esperou de verdade: sem a espera, a segunda olhada viria colada na
  // primeira e a porta ainda estaria ocupada.
  assert.ok(eventos.some((e) => e.startsWith('esperar:')), 'não esperou a porta liberar');
  assert.ok(
    eventos.findIndex((e) => e.startsWith('esperar:')) < posicaoDaSubida,
    'subiu antes de a porta liberar',
  );
  assert.equal(r.derrubou, true);
  assert.equal(r.subiu, true);
});

test('porta que não libera: avisa, não sobe, e diz o comando exato', async () => {
  /*
   * O processo que não morre existe: outro usuário, um serviço, ou o
   * `taskkill` que voltou antes de o socket soltar. Subir assim mesmo daria
   * `EADDRINUSE` — e a pessoa não saberia se o problema é o reinício ou o
   * servidor.
   */
  const { mundo, eventos } = bancada({ ocupadaSempre: true });
  const r = await reiniciar({ porta: 3000, tentativas: 3, ...mundo });

  assert.ok(!eventos.includes('iniciar'), 'subiu com a porta ainda ocupada');
  const recado = eventos.filter((e) => e.startsWith('avisar:')).join('\n');
  assert.match(recado, /taskkill \/PID 23144 \/F/, 'não disse o comando pronto para colar');
  assert.match(recado, /3000/, 'não disse qual porta');
  assert.equal(r.subiu, false);
});

test('se o taskkill falhar, não sobe e conta o motivo', async () => {
  // "Acesso negado" é a falha provável, e é justamente a que não se resolve
  // sozinha. Engolir o erro e tentar subir deixaria a pessoa com a mensagem
  // de porta ocupada de sempre, sem saber que a causa era a permissão.
  const { mundo, eventos } = bancada({ matarFalha: 'Acesso negado.' });
  const r = await reiniciar({ porta: 3000, ...mundo });

  assert.ok(!eventos.includes('iniciar'), 'subiu depois de falhar em derrubar');
  const recado = eventos.filter((e) => e.startsWith('avisar:')).join('\n');
  assert.match(recado, /Acesso negado/, 'não contou por que não conseguiu');
  assert.equal(r.subiu, false);
  assert.equal(r.pid, 23144);
});

/* ------------------------------------------------ o taskkill de verdade */

test('derruba o processo de verdade e devolve a porta', async () => {
  /*
   * Os testes acima usam um `matar` de mentira, e um `matar` de mentira nunca
   * falha no Windows. Este é o que prova que a ordem `taskkill /PID n /F`
   * funciona nesta máquina — que é a única coisa que o Leonardo precisa que
   * seja verdade.
   *
   * A porta é efêmera e o processo é nosso, criado aqui: nada mais na máquina
   * dele corre risco de ser derrubado por este teste.
   */
  const portador = createServer(() => {});
  await new Promise((ok) => portador.listen(0, ok));
  const porta = portador.address().port;
  await new Promise((ok) => portador.close(ok));

  // Um processo de verdade escutando, e que NÃO é filho deste aqui: solto,
  // como o servidor que ficou de pé da tentativa anterior.
  const filho = spawn(process.execPath, [
    '-e',
    `require('http').createServer(()=>{}).listen(${porta},()=>console.log('no ar'))`,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((ok, falha) => {
    const prazo = setTimeout(() => falha(new Error('o portador não subiu')), 10_000);
    filho.stdout.on('data', () => { clearTimeout(prazo); ok(); });
    filho.on('exit', () => { clearTimeout(prazo); falha(new Error('o portador morreu antes de escutar')); });
  });

  try {
    const r = await reiniciar({ porta, iniciar: () => ({ encerrar() {} }) });
    assert.equal(r.subiu, true, 'não subiu');
    assert.equal(r.pid, filho.pid, `derrubou o processo errado: ${r.pid} em vez de ${filho.pid}`);
    // A prova final: a porta está livre para quem quiser.
    const depois = createServer(() => {});
    await new Promise((ok, falha) => {
      depois.once('error', falha);
      depois.listen(porta, ok);
    });
    await new Promise((ok) => depois.close(ok));
  } finally {
    if (filho.exitCode === null) filho.kill();
  }
});

/* -------------------------------------------------------- a linha de comando */

test('o comando de reiniciar existe e é o que o README manda usar', async () => {
  /*
   * Um módulo perfeito que ninguém consegue chamar não resolve a pergunta do
   * Leonardo — ele quer digitar uma coisa e ver a urna de volta. Este teste
   * prende o nome do script no package.json, porque renomear `reiniciar` sem
   * mexer no README deixaria a instrução mentindo.
   */
  const { readFile } = await import('node:fs/promises');
  const pacote = JSON.parse(
    await readFile(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
  );
  assert.ok(pacote.scripts.reiniciar, 'não existe o script `npm run reiniciar`');
  assert.match(pacote.scripts.reiniciar, /server[\\/]reiniciar\.js/);
});
