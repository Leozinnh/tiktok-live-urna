/*
 * O sintetizador neural — o lado Node do `ponte/voz.py`.
 *
 * O narrador deste projeto nasceu com a voz do Windows, e ela funciona. O que
 * ela não é, é BONITA: o SAPI é concatenação de pedaços de fala gravados, e a
 * Francisca do Windows lê "Bia acabou de seguir" com a música de um GPS. Numa
 * live que passa a noite anunciando gente, isso é a diferença entre um
 * narrador e um aviso de supermercado.
 *
 * A voz do `tiktok-live-horse` é a `edge-tts`, as vozes neurais da própria
 * Microsoft — as mesmas que leem o Teams e o Edge. Continuam sendo do Windows,
 * continuam não custando dependência de Node, e a diferença de qualidade no ar
 * é grande.
 *
 * O que estes testes NÃO fazem é chamar a Microsoft. Um teste que precisa de
 * internet fica vermelho no avião e verde na véspera da live, o que é a pior
 * combinação possível. No lugar disso, um `edge_tts` de mentira entra na frente
 * do verdadeiro pelo `PYTHONPATH` e ANOTA o que o worker pediu — assim o
 * protocolo, a conta da velocidade e o caminho do arquivo são exercitados de
 * verdade, e a única coisa que fica de fora é o áudio em si.
 *
 * O áudio em si é conferido `a olho`, uma vez, com a biblioteca de verdade:
 *   python -u ponte/voz.py   (com URNA_VOZ_PASTA apontando para uma pasta)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const WORKER = join(RAIZ, 'ponte', 'voz.py');

/*
 * O `edge_tts` de mentira.
 *
 * Ele copia a assinatura de verdade — `Communicate(texto, voz, rate=, pitch=)`
 * com `save()` assíncrono —, anota cada chamada em `URNA_VOZ_ESPIAO` e escreve
 * um arquivo no destino. Um stub que aceitasse qualquer argumento não provaria
 * nada sobre os argumentos, que são justamente o que se quer prender.
 *
 * `URNA_VOZ_QUEBRA` derruba uma VOZ, que é como se testa o degrau de reserva
 * sem derrubar a rede de ninguém. `URNA_VOZ_QUEBRA_TEXTO` derruba uma FRASE, e
 * faz isso na hora de salvar — depois do construtor —, que é como falha uma
 * síntese de verdade: a conexão cai no meio do download, e não antes de
 * começar.
 */
const STUB = `
import asyncio, os

class Communicate:
    def __init__(self, texto, voz="en-US-EmmaMultilingualNeural", *, rate="+0%",
                 volume="+0%", pitch="+0Hz", ** resto):
        self.texto, self.voz, self.rate, self.pitch = texto, voz, rate, pitch
        espiao = os.environ.get("URNA_VOZ_ESPIAO")
        if espiao:
            # newline="\\n" porque este arquivo é lido pelo Node, e o modo texto
            # do Windows trocaria cada quebra por \\r\\n — o teste compararia o
            # texto com um \\r invisível no fim e falharia por um motivo que não
            # tem nada a ver com a voz.
            with open(espiao, "a", encoding="utf-8", newline="\\n") as f:
                f.write("|".join([texto, voz, rate, pitch]) + "\\n")
        if voz == os.environ.get("URNA_VOZ_QUEBRA"):
            raise RuntimeError("voz indisponivel: " + voz)

    async def save(self, destino):
        if self.texto == os.environ.get("URNA_VOZ_QUEBRA_TEXTO"):
            with open(destino, "wb") as f:
                f.write(b"ID3")   # escreve um pedaco e desiste: MP3 truncado
            raise RuntimeError("a conexao caiu no meio da frase")
        with open(destino, "wb") as f:
            f.write(b"ID3" + b"\\x00" * 200)
`;

/** Um diretório só para este teste, apagado no fim. */
async function bancada() {
  const base = await mkdtemp(join(tmpdir(), 'urna-vozpy-'));
  const stub = join(base, 'stub');
  const pasta = join(base, 'voz');
  const espiao = join(base, 'espiao.txt');
  await mkdir(stub, { recursive: true });
  await mkdir(pasta, { recursive: true });
  await writeFile(join(stub, 'edge_tts.py'), STUB, 'utf8');
  return { base, stub, pasta, espiao, limpar: () => rm(base, { recursive: true, force: true }) };
}

/**
 * Roda o worker com estas linhas no stdin e devolve o que ele respondeu.
 *
 * O `PYTHONPATH` recebe o stub PRIMEIRO: o `edge_tts` de mentira é encontrado
 * antes do de verdade, e o worker não sabe da diferença.
 */
async function falar(linhas, env = {}) {
  const b = await bancada();
  const p = spawn('python', ['-u', WORKER], {
    cwd: RAIZ,
    env: {
      ...process.env,
      PYTHONPATH: [b.stub, process.env.PYTHONPATH ?? ''].filter(Boolean).join(delimiter),
      URNA_VOZ_PASTA: b.pasta,
      URNA_VOZ_ESPIAO: b.espiao,
      ...env,
    },
    windowsHide: true,
  });

  let saida = '';
  let erro = '';
  p.stdout.setEncoding('utf8');
  p.stderr.setEncoding('utf8');
  p.stdout.on('data', (d) => { saida += d; });
  p.stderr.on('data', (d) => { erro += d; });

  p.stdin.write(linhas.map((l) => `${l}\n`).join(''), 'utf8');
  p.stdin.end();
  const codigo = await new Promise((ok) => p.on('close', ok));

  const ler = async (nome) => {
    try { return await readFile(join(b.pasta, nome), 'utf8'); } catch { return null; }
  };
  const anotado = async () => {
    try { return (await readFile(b.espiao, 'utf8')).trim().split('\n').filter(Boolean); } catch { return []; }
  };
  return { ...b, codigo, saida, erro, linhas: saida.split(/\r?\n/).filter(Boolean), ler, anotado };
}

/*
 * Sem Python não há worker — e uma suíte verde numa máquina onde ele não roda
 * não prova nada sobre ele. O mesmo critério de `tests/voz.test.js`, que se
 * pula fora do Windows: a pergunta é feita uma vez, na carga do módulo, e
 * respondida por quem sabe.
 */
const semPython = spawnSync('python', ['-c', 'pass'], { stdio: 'ignore' }).status !== 0;

test('o worker diz de que voz ele é antes de aceitar a primeira frase', { skip: semPython }, async () => {
  /*
   * O `pronto` é o único sinal de que o worker subiu — e é ele que o painel
   * usa para MOSTRAR qual voz está no ar. Sem essa linha, o servidor mandaria
   * uma frase para um processo que ainda não está lendo o stdin, e a fala
   * sumiria sem erro nenhum.
   */
  const r = await falar([]);
  try {
    assert.equal(r.codigo, 0, `o worker saiu com ${r.codigo}: ${r.erro}`);
    assert.equal(r.linhas[0], 'pronto\tpt-BR-FranciscaNeural');
  } finally { await r.limpar(); }
});

test('uma frase vira um mp3, e a resposta diz qual arquivo é', { skip: semPython }, async () => {
  /*
   * O `mp3` na resposta é a parte que o servidor NÃO pode adivinhar.
   *
   * A voz antiga escrevia `<id>.wav` e o Node lia esse nome fixo. Com dois
   * motores, o nome do arquivo depende de quem o escreveu — e um servidor que
   * chutasse a extensão leria um arquivo que não existe e mandaria silêncio
   * para a tela, com o sintetizador tendo funcionado perfeitamente.
   */
  const r = await falar(['abc123\tFala, Ana! Chegou na hora certa.']);
  try {
    assert.equal(r.codigo, 0, `o worker saiu com ${r.codigo}: ${r.erro}`);
    assert.deepEqual(r.linhas, [
      'pronto\tpt-BR-FranciscaNeural',
      'ok\tabc123\tmp3\tFala, Ana! Chegou na hora certa.',
    ]);
    const bytes = await r.ler('abc123.mp3');
    assert.ok(bytes?.startsWith('ID3'), 'o arquivo não foi escrito na pasta');
  } finally { await r.limpar(); }
});

test('a voz fala no ritmo do horse, e a velocidade do painel mexe nele', { skip: semPython }, async () => {
  /*
   * A escala do painel é -10 a 10, e o 0 tem que continuar querendo dizer "o
   * ritmo de sempre" — é o que o campo promete a quem o arrasta. No edge-tts
   * "o ritmo de sempre" é `+8%`, que é o padrão do `tiktok-live-horse`, e não
   * `+0%`: a +0% a Francisca neural fala devagar de um jeito que soa solene
   * demais para anunciar quem chegou na live.
   *
   * O `+3Hz` de tom é do horse também, e não é enfeite: é ele que faz a voz
   * soar animada em vez de neutra.
   */
  const zero = await falar(['a\tBom dia.'], { URNA_VOZ_VELOCIDADE: '0' });
  try { assert.equal((await zero.anotado())[0], 'Bom dia.|pt-BR-FranciscaNeural|+8%|+3Hz'); }
  finally { await zero.limpar(); }

  // Dois por ponto, como o `+8%` de base: no máximo o painel chega a +28%.
  const rapido = await falar(['a\tBom dia.'], { URNA_VOZ_VELOCIDADE: '5' });
  try { assert.equal((await rapido.anotado())[0], 'Bom dia.|pt-BR-FranciscaNeural|+18%|+3Hz'); }
  finally { await rapido.limpar(); }

  const devagar = await falar(['a\tBom dia.'], { URNA_VOZ_VELOCIDADE: '-10' });
  try { assert.equal((await devagar.anotado())[0], 'Bom dia.|pt-BR-FranciscaNeural|-12%|+3Hz'); }
  finally { await devagar.limpar(); }
});

test('a voz escolhida no painel é a que fala', { skip: semPython }, async () => {
  const r = await falar(['a\tBom dia.'], { URNA_VOZ_NOME: 'pt-BR-AntonioNeural' });
  try {
    assert.equal(r.linhas[0], 'pronto\tpt-BR-AntonioNeural');
    assert.equal((await r.anotado())[0], 'Bom dia.|pt-BR-AntonioNeural|+8%|+3Hz');
  } finally { await r.limpar(); }
});

test('voz que o serviço não tem cai na padrão, e não em silêncio', { skip: semPython }, async () => {
  /*
   * A lista de vozes do edge-tts muda sem avisar — voz nova entra, voz antiga
   * sai —, e a que o Leonardo escolheu pode simplesmente não existir mais numa
   * terça-feira. O horse trata isso tentando de novo com a padrão, e é o
   * comportamento certo: melhor falar com a voz de sempre do que ficar mudo
   * por causa de um nome que envelheceu.
   *
   * O eco continua sendo o texto, e não a voz: é o TEXTO que o servidor
   * confere com o que mandou.
   */
  const r = await falar(['a\tBom dia.'], {
    URNA_VOZ_NOME: 'pt-BR-VozQueNaoExisteNeural',
    URNA_VOZ_QUEBRA: 'pt-BR-VozQueNaoExisteNeural',
  });
  try {
    assert.deepEqual(r.linhas, [
      'pronto\tpt-BR-VozQueNaoExisteNeural',
      'ok\ta\tmp3\tBom dia.',
    ]);
    assert.deepEqual(await r.anotado(), [
      'Bom dia.|pt-BR-VozQueNaoExisteNeural|+8%|+3Hz',
      'Bom dia.|pt-BR-FranciscaNeural|+8%|+3Hz',
    ]);
  } finally { await r.limpar(); }
});

test('frase que não sai de jeito nenhum vira erro, e não derruba o worker', { skip: semPython }, async () => {
  /*
   * Uma frase pode falhar por motivo que não é a voz: sem internet, o serviço
   * fora do ar, um texto que o serviço recusa. O worker NÃO pode morrer por
   * isso — ele vive a live inteira, e uma exceção não tratada no laço deixaria
   * o narrador mudo até alguém reiniciar o servidor, que é exatamente o
   * problema que o processo de vida longa existe para evitar.
   *
   * A frase seguinte tem que ser atendida normalmente.
   */
  const r = await falar(['a\tBom dia.', 'b\tBoa noite.'], {
    URNA_VOZ_QUEBRA_TEXTO: 'Bom dia.',
  });
  try {
    assert.equal(r.codigo, 0, 'o worker morreu em vez de reportar o erro');
    assert.equal(r.linhas[0], 'pronto\tpt-BR-FranciscaNeural');
    assert.match(r.linhas[1], /^erro\ta\t/);
    // A frase seguinte foi atendida normalmente.
    assert.equal(r.linhas[2], 'ok\tb\tmp3\tBoa noite.');
    /*
     * E o pedaço da frase que falhou NÃO fica no disco.
     *
     * O sintetizador escreve um MP3 truncado antes de a conexão cair. Do lado
     * do servidor, um arquivo que existe é um arquivo bom: ele acharia esse
     * resto em cache e o tocaria para sempre, várias vezes por noite, com um
     * estalo no fim — e nenhum erro em lugar nenhum para explicar por quê.
     */
    assert.equal(await r.ler('a.mp3'), null, 'sobrou um MP3 truncado no cache');
  } finally { await r.limpar(); }
});

test('o worker não escreve nada fora da pasta de voz', { skip: semPython }, async () => {
  // O `id` vem do servidor e é o nome do arquivo. Aqui ele é fixo e seguro;
  // o teste existe para prender que o worker usa a PASTA que lhe deram, e não
  // o diretório de onde foi chamado — um `open("a.mp3")` relativo largaria
  // arquivos na raiz do projeto, que é o que o `.gitignore` não cobre.
  const r = await falar(['a\tBom dia.']);
  try {
    await assert.rejects(() => stat(join(RAIZ, 'a.mp3')));
    assert.ok(await r.ler('a.mp3'));
  } finally { await r.limpar(); }
});

/* -------------------------------------------------- o lado Node do motor */

test('o cache acha a frase que o outro motor sintetizou', async () => {
  /*
   * O arquivo em disco é o cache, e o nome dele é `<chave>.<extensão>`.
   *
   * A tentação era pôr o motor dentro da chave, e ela custa caro: quando o
   * edge falha e o SAPI sintetiza a frase, o arquivo que sai é um `.wav`. Com
   * o motor na chave, o edge não acharia esse arquivo na frase seguinte,
   * tentaria de novo, falharia de novo e cairia no SAPI de novo — a cada
   * repetição, para sempre, pagando duas sínteses onde uma bastava.
   *
   * O que separa os motores é a EXTENSÃO, que já está no nome do arquivo. Por
   * isso a chave do texto não sabe de motor nenhum, e por isso a lista de
   * extensões de cada motor é que é a parte interessante: o edge aceita o
   * `.wav` que o reserva deixou, o SAPI não aceita um `.mp3` que ele não sabe
   * escrever.
   */
  const { chaveDoTexto, MOTORES } = await import('../server/voz.js');
  assert.equal(chaveDoTexto('Bom dia'), chaveDoTexto('Bom dia', {}));

  assert.deepEqual(MOTORES.sapi.extensoes, ['wav']);
  assert.equal(MOTORES.edge.extensoes[0], 'mp3', 'o edge não prefere o próprio formato');
  assert.ok(MOTORES.edge.extensoes.includes('wav'),
    'o edge não reaproveita o que o reserva sintetizou — vai sintetizar duas vezes');
});

test('o NOME_DE_VOZ que o servidor aceita cobre os dois formatos', async () => {
  /*
   * É a única porta entre o sintetizador e o navegador: o nome do arquivo vem
   * de fora e vira caminho em disco. A lista fechada de formatos é o que
   * impede um `../../` de virar leitura de arquivo arbitrário.
   *
   * Ela nasceu com `wav` só, e o edge escreve `mp3` — sem esta correção, o
   * servidor RECUSARIA o próprio arquivo que acabou de sintetizar, e a voz
   * sairia muda com tudo funcionando.
   */
  const fonte = await readFile(join(RAIZ, 'server', 'index.js'), 'utf8');
  const linha = fonte.match(/const NOME_DE_VOZ = .*$/m)?.[0] ?? '';
  assert.match(linha, /wav/, 'o nome do arquivo deixou de aceitar wav');
  assert.match(linha, /mp3/, 'o nome do arquivo não aceita mp3 — a voz neural fica muda');
});

test('o narrador do navegador aceita os dois formatos', async () => {
  // A outra ponta do mesmo contrato: o `narrador.js` confere o endereço antes
  // de tocar, e uma lista fechada em `.wav` recusaria o áudio do edge.
  const fonte = await readFile(join(RAIZ, 'public', 'js', 'narrador.js'), 'utf8');
  const linha = fonte.match(/const ENDERECO_DE_VOZ = .*$/m)?.[0] ?? '';
  assert.match(linha, /wav/);
  assert.match(linha, /mp3/, 'o navegador não aceita mp3 — a voz neural não toca');
});
