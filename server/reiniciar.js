/**
 * Reiniciar o servidor em um comando.
 *
 * O Leonardo perguntou: "e como inicio? se ja tem um processo dele antigo
 * rodando". A resposta que existia era boa e insuficiente — o servidor dizia
 * quem estava segurando a porta e o comando `taskkill` pronto para colar. Só
 * que colar comando é justamente o que ele já tinha dito que não queria:
 * "nao quero ter q dar taskkill e tal para reiniciar".
 *
 * Aqui a resposta é uma linha: `npm run reiniciar`. Ele derruba quem estiver
 * na porta e sobe o servidor de novo, na mesma janela, com o mesmo Ctrl+C.
 *
 * Por que NÃO fazer isso sozinho, dentro do `npm start`: derrubar processo é
 * irreversível, e a porta 3000 não é deste projeto por decreto. No dia em que
 * outra coisa estiver escutando ali, um `npm start` que mata por conta própria
 * derrubaria o programa de outra pessoa sem perguntar. Com um comando
 * separado, quem escolhe é quem digita — e quem digitou já autorizou.
 *
 * A ordem das três etapas é o que este arquivo tem de mais delicado:
 *
 *   1. descobrir quem está na porta (e NUNCA adivinhar);
 *   2. derrubar, e ESPERAR a porta liberar de verdade;
 *   3. só então subir.
 *
 * Subir antes de a porta liberar devolve exatamente o `EADDRINUSE` de antes,
 * agora disfarçado de "o reiniciar não funcionou". Por isso cada etapa é
 * parâmetro: é assim que o teste consegue observar a ordem sem esperar
 * segundos de verdade nem matar processo nenhum.
 */
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { descobrirPidDaPorta, mensagemDePortaOcupada } from './porta.js';

/** Quantas vezes olhar a porta antes de desistir, e de quanto em quanto. */
const TENTATIVAS = 20;
const INTERVALO_MS = 250;

/**
 * Mata um processo pelo PID.
 *
 * No Windows é `taskkill`, que é o único que derruba de verdade um processo
 * que não é filho deste aqui — o `process.kill` do Node é um pedido, e para
 * outro usuário ou para um serviço ele simplesmente não acontece. Fora do
 * Windows o sinal basta, e é o que mantém este arquivo rodável em outra
 * máquina sem um `if` no meio do fluxo.
 */
async function matarDeVerdade(pid) {
  if (process.platform !== 'win32') {
    process.kill(pid, 'SIGKILL');
    return;
  }
  const { execFile } = await import('node:child_process');
  await new Promise((ok, falha) => {
    execFile('taskkill', ['/PID', String(pid), '/F'], { windowsHide: true },
      (erro, stdout, stderr) => (erro ? falha(new Error(String(stderr || erro.message).trim())) : ok(stdout)));
  });
}

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

/**
 * Sobe o servidor de verdade, no lugar do processo que saiu.
 *
 * Em processo separado, e não com um `import`, por dois motivos: o
 * `server/index.js` só sobe quando é executado direto (é ele que decide isso
 * pelo `process.argv[1]`), e um servidor dentro deste processo deixaria este
 * arquivo vivo junto — dois Ctrl+C para sair, e um deles sem fazer nada.
 *
 * `stdio: 'inherit'` porque este é o terminal do Leonardo: a mensagem com os
 * dois endereços tem que aparecer nela, e o Ctrl+C tem que chegar ao servidor.
 */
function subirDeVerdade() {
  const servidor = spawn(
    process.execPath,
    [fileURLToPath(new URL('./index.js', import.meta.url))],
    { stdio: 'inherit' },
  );
  // `terminou` é o que segura o pai vivo: um filho de `spawn` mantém o laço
  // de eventos do pai de pé até sair, então este processo dura exatamente o
  // que durar o servidor — nem um instante menos, o que deixaria o servidor
  // órfão e sem Ctrl+C que o alcance.
  const terminou = new Promise((ok) => servidor.on('exit', (codigo) => ok(codigo ?? 0)));
  return { encerrar: () => servidor.kill(), terminou };
}

/**
 * Derruba quem está na porta e sobe o servidor de novo.
 *
 * Devolve o que aconteceu em vez de sair do processo: quem decide o código de
 * saída é quem chama, e um módulo que chama `process.exit` é impossível de
 * testar sem matar a suíte junto.
 */
export async function reiniciar({
  porta = 3000,
  descobrir = (p) => descobrirPidDaPorta(p),
  matar = matarDeVerdade,
  esperar = dormir,
  iniciar = subirDeVerdade,
  avisar = (texto) => console.error(texto),
  tentativas = TENTATIVAS,
  intervalo = INTERVALO_MS,
} = {}) {
  const pid = await descobrir(porta);

  if (pid === null) {
    /*
     * Ninguém na porta. Não é erro: quem digitou `reiniciar` quer o servidor
     * de pé, e ele já vai ficar. Recusar aqui seria obedecer à letra do
     * comando contra a intenção de quem o digitou.
     */
    avisar(`  Ninguém na porta ${porta}. Subindo o servidor.`);
    iniciar();
    return { derrubou: false, pid: null, subiu: true };
  }

  avisar(`  A porta ${porta} estava com o processo ${pid}. Derrubando...`);

  try {
    await matar(pid);
  } catch (e) {
    avisar(`\n  Não consegui derrubar o processo ${pid}: ${e.message}\n`);
    // A mensagem de sempre, que já traz o comando pronto e a alternativa de
    // subir em outra porta. Repetir a redação aqui só criaria duas versões da
    // mesma instrução para manter em dia.
    avisar(mensagemDePortaOcupada(porta, pid));
    return { derrubou: false, pid, subiu: false };
  }

  /*
   * A espera. O `taskkill` volta assim que o processo morre, e o socket pode
   * levar um instante a mais para soltar — no Windows, o suficiente para a
   * ligação seguinte falhar. Esperar aqui é o que faz a diferença entre um
   * comando que funciona sempre e um que funciona quase sempre.
   */
  for (let i = 0; i < tentativas; i++) {
    await esperar(intervalo);
    if (await descobrir(porta) === null) {
      iniciar();
      return { derrubou: true, pid, subiu: true };
    }
  }

  // Sobreviveu a tudo: é outro processo, ou é de outro usuário, e nenhuma
  // tentativa a mais vai mudar isso.
  avisar(`\n  O processo ${pid} não soltou a porta ${porta}.`);
  avisar(mensagemDePortaOcupada(porta, pid));
  return { derrubou: false, pid, subiu: false };
}

/**
 * Compara caminhos de verdade, como no `server/index.js` — e pelo mesmo
 * motivo: no Windows, `file://${argv[1]}` sai `file://C:/...` contra o
 * `file:///C:/...` do `import.meta.url`, e a comparação nunca casa.
 */
function executadoDireto() {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (executadoDireto()) {
  const porta = Number(process.env.PORT ?? 3000);

  let servidor = null;
  const r = await reiniciar({ porta, iniciar: () => (servidor = subirDeVerdade()) });

  if (!r.subiu) {
    process.exitCode = 1;
  } else {
    /*
     * O código de saída é o do SERVIDOR, e não o deste comando.
     *
     * Sem esta linha, um servidor que morre por erro sairia daqui como 0 —
     * "deu tudo certo" — e o `npm` não teria como contar o que aconteceu.
     */
    process.exitCode = await servidor.terminou;
  }
}
