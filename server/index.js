import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirBanco } from './db.js';
import { criarTally } from './tally.js';
import { criarHub } from './hub.js';
import { criarSimulador } from './sources/simulator.js';
import { criarTrocaDeFontes } from './sources/troca.js';
import { criarVoz } from './voz.js';
import { carregar, salvar, caminhoDaConfig } from './config.js';
import { descobrirPidDaPorta, mensagemDePortaOcupada } from './porta.js';
import { chaveDeAceite, codificarFrame, decodificarFrames } from './ws.js';

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  // O retrato que sai do celular ou do TikTok costuma ser webp, e o
  // `jpeg` escrito por extenso também aparece. Sem entrada aqui, o arquivo
  // sai como binário genérico e o `<img>` dispara `error` — a urna desenha
  // o retrato no lugar e ninguém entende por que a foto não subiu.
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  // A fala do narrador. Sem esta linha o arquivo sai como binário genérico e
  // o elemento de áudio da página fica mudo — sem erro, sem aviso, e sem
  // ninguém entendendo por quê.
  '.wav': 'audio/wav',
};

/**
 * Publica a configuração do usuário — config/local.json — que mora FORA de
 * public/, porque é dele e não do site.
 *
 * A rota é um `if` de igualdade, e não um `startsWith`: servir a pasta
 * `config/` inteira daria acesso a qualquer arquivo largado ali dentro. Com a
 * igualdade, a única coisa alcançável é este nome.
 *
 * Nunca responde erro de status. Ausente é o caso NORMAL — é assim que o
 * projeto começa — e vale `{}`. Quebrado vira `{ erro }` com 200, para o
 * navegador conseguir CONTAR o problema em vez de tratá-lo como rota fora do
 * ar: um JSON malformado é o tropeço mais provável de todos, porque o
 * arquivo é editado à mão e uma vírgula sobrando basta.
 */
async function servirConfig(res, caminho) {
  const responder = (corpo) => {
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      // Sem cache: ele edita o arquivo, dá F5 e espera ver a mudança.
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify(corpo));
  };

  let texto;
  try {
    texto = await readFile(caminho, 'utf8');
  } catch {
    responder({});
    return;
  }

  // Arquivo de zero byte é quem criou o arquivo antes de saber o que pôr
  // dentro. Isso não é JSON inválido, é ausência de configuração.
  if (!texto.trim()) { responder({}); return; }

  let dados;
  try {
    dados = JSON.parse(texto);
  } catch (e) {
    responder({ erro: `config/local.json não é um JSON válido: ${e.message}` });
    return;
  }

  if (typeof dados !== 'object' || dados === null || Array.isArray(dados)) {
    responder({
      erro: 'config/local.json precisa conter um objeto JSON, começando por { e terminando em }.',
    });
    return;
  }

  responder(dados);
}

/**
 * Um arquivo de uma pasta que não é o site — `fotos/` ou `dados/voz/`.
 *
 * O nome chega já decodificado da URL, e é a única parte que o visitante
 * escolhe: por isso a conferência é sobre ELE, e não sobre o caminho montado
 * depois. Duas travas, de propósito — o nome tem que passar pelo crivo de
 * quem chamou, e o caminho montado tem que continuar dentro da pasta —,
 * porque a primeira sozinha depende de eu ter lembrado de todos os
 * separadores que o Windows aceita, e ele aceita mais de um.
 *
 * Nome ausente e nome inexistente dão o mesmo 404: não há o que distinguir,
 * e a urna já sabe desenhar o retrato quando a foto não vem (ver
 * ligarQuedaDoRetrato em urna.js). Este 404 é para o CONSOLE, não para a
 * tela — o desenho aparece de qualquer jeito.
 */

/**
 * Um nome de arquivo, e não um caminho: `fotos/` não tem subpastas, e aceitar
 * barra aqui seria abrir a pasta inteira do projeto.
 */
const NOME_SIMPLES = (nome) => Boolean(nome) && !nome.includes('/') && !nome.includes('\\');

/**
 * O nome de um áudio de narração: dezesseis caracteres hexadecimais e `.wav`.
 *
 * Estreito de propósito. É o único formato que o servidor gera
 * (`chaveDoTexto`), então tudo o que não casa é pedido que ele não fez — e
 * `dados/` é justamente onde mora o banco da votação.
 */
const NOME_DE_VOZ = (nome) => /^[0-9a-f]{16}\.wav$/.test(String(nome ?? ''));
async function servirArquivo(res, pasta, nome, conferirNome) {
  const naoAchou = () => {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Não encontrado');
  };

  if (!conferirNome(nome)) { naoAchou(); return; }

  const destino = normalize(join(pasta, nome));
  if (!destino.startsWith(normalize(pasta + sep))) { naoAchou(); return; }

  try {
    const info = await stat(destino);
    if (!info.isFile()) { naoAchou(); return; }

    const corpo = await readFile(destino);
    res.writeHead(200, {
      'content-type': TIPOS[extname(destino)] ?? 'application/octet-stream',
      // A foto é trocada quando ele quiser outro retrato; um cache longo
      // deixaria a imagem antiga na tela do OBS até alguém limpar o cache.
      'cache-control': 'no-store',
    });
    res.end(corpo);
  } catch {
    naoAchou();
  }
}

/**
 * Monta o motor inteiro e devolve as peças.
 *
 * O motor sobe LIGADO: uma fonte parada é o defeito mais silencioso que este
 * projeto pode ter — o painel abre, tudo responde, e nenhum presente vira
 * voto. Quem precisar de uma fonte parada chama `fonte.parar()`.
 *
 * `caminhoDoBanco` é parâmetro porque a suíte não pode escrever no banco da
 * live: um teste que apaga a rodada do Leonardo é pior do que nenhum teste.
 */
export function montarMotor({
  config, caminhoDoBanco = ':memory:', aoSalvar = null, voz = null, fonte = null,
}) {
  const db = abrirBanco(caminhoDoBanco);
  const tally = criarTally({ db, config });
  /*
   * Qual fonte roda é decisão da CONFIGURAÇÃO, e não de quem sobe o servidor.
   *
   * O padrão é o simulador porque é ele que não tem como falhar: quem abrir o
   * projeto pela primeira vez precisa de uma tela que responde, e não de um
   * Python pedindo o nome de uma live que a pessoa ainda não tem. A live real
   * se escolhe no painel, e é uma escolha que grava.
   *
   * O parâmetro `fonte` existe pelo mesmo motivo que o `voz`: a suíte precisa
   * de uma fonte com um processo de mentira para poder testar a costura sem
   * entrar numa live de verdade.
   */
  /*
   * A fonte do motor é a fonte que TROCA de fonte.
   *
   * É o que permite ao painel passar do simulador para a live — e voltar —
   * sem reiniciar o servidor. Uma fonte injetada não passa por aqui: quem
   * injeta uma já decidiu qual quer, e a suíte injeta justamente para não ter
   * um processo de verdade no meio.
   */
  const ativa = fonte ?? criarTrocaDeFontes({ config });
  const hub = criarHub({ tally, fonte: ativa, config, aoSalvar, voz });
  ativa.iniciar();
  /*
   * A rodada já nasce aberta. Sem ela o motor não tem onde contar — a seção
   * 4.5 grava o voto numa rodada, e um voto sem rodada não existe no banco.
   */
  tally.abrirRodada();
  return { db, tally, fonte: ativa, hub };
}

/** O cabeçalho do upgrade, montado à mão porque são quatro linhas. */
function aceitarUpgrade(chave) {
  return [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${chaveDeAceite(chave)}`,
    '', '',
  ].join('\r\n');
}

export function criarServidor({ raiz, config, fotos, voz, motor = null }) {
  // Por parâmetro para o teste não depender do config/local.json de verdade
  // de quem roda a suíte — e para a rota poder ser exercitada sem mexer no
  // arquivo do Leonardo.
  const caminhoDaConfig = config ?? join(raiz, '..', 'config', 'local.json');
  // A pasta de retratos, pelo mesmo motivo e no mesmo lugar que o config:
  // é material do Leonardo, não do site. Mora ao lado de public/, e não
  // dentro, para não ser varrida junto com o código.
  const pastaDasFotos = fotos ?? join(raiz, '..', 'fotos');
  // O cache da voz, pelo mesmo motivo das fotos: é material da live, e não
  // do site. Dentro de `public/` ele viajaria no `git add .` — são centenas
  // de KB por frase, e cada nome de seguidor vira um arquivo.
  const pastaDaVoz = voz ?? join(raiz, '..', 'dados', 'voz');

  const servidor = createServer((req, res) => {
    // Envolvido à mão em vez de async/await: uma promessa rejeitada aqui
    // derrubaria o processo inteiro no meio de uma live.
    (async () => {
      try {
        const url = new URL(req.url, 'http://localhost');
        let caminho = decodeURIComponent(url.pathname);
        /*
         * Os dois endereços da especificação, e os dois são IGUALDADE.
         *
         * `/admin` é digitado à mão no meio de uma live, e cair em 404
         * deixaria o operador procurando o painel enquanto a votação corre.
         * Um `startsWith` no lugar da igualdade transformaria a rota do
         * painel numa varredura da pasta.
         */
        if (caminho === '/') caminho = '/broadcast.html';
        else if (caminho === '/admin') caminho = '/admin.html';

        if (caminho === '/config/local.json') {
          await servirConfig(res, caminhoDaConfig);
          return;
        }

        if (caminho.startsWith('/fotos/')) {
          await servirArquivo(res, pastaDasFotos, caminho.slice('/fotos/'.length), NOME_SIMPLES);
          return;
        }

        if (caminho.startsWith('/voz/')) {
          await servirArquivo(res, pastaDaVoz, caminho.slice('/voz/'.length), NOME_DE_VOZ);
          return;
        }

        // normalize() resolve os '..' antes de juntarmos; a conferência
        // seguinte garante que o resultado continua dentro da raiz.
        const raizNormalizada = normalize(raiz + sep);
        const destino = normalize(join(raiz, caminho));
        if (!destino.startsWith(raizNormalizada)) {
          res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
          res.end('Proibido');
          return;
        }

        const info = await stat(destino);
        if (!info.isFile()) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
          res.end('Não encontrado');
          return;
        }

        const corpo = await readFile(destino);
        res.writeHead(200, {
          'content-type': TIPOS[extname(destino)] ?? 'application/octet-stream',
          'cache-control': 'no-store',
        });
        res.end(corpo);
      } catch {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Não encontrado');
      }
    })();
  });

  if (motor) ligarWebSocket(servidor, motor);
  return servidor;
}

/**
 * O canal ao vivo — seção 5 da especificação.
 *
 * O `upgrade` é do HTTP, e é aqui que ele encontra o hub: o handshake escolhe
 * o caminho, o papel vem da URL, e daí para dentro é tudo quadro. É a única
 * junção entre as duas metades do servidor, e por isso ela mora sozinha.
 */
function ligarWebSocket(servidor, { hub }) {
  servidor.on('upgrade', (req, socket) => {
    const chave = req.headers['sec-websocket-key'];
    // Sem a chave não há handshake possível: um cliente que não é um
    // WebSocket, ou um proxy que perdeu o cabeçalho no caminho.
    if (!chave) { socket.destroy(); return; }

    let papel = 'broadcast';
    try {
      papel = new URL(req.url, 'http://localhost').searchParams.get('papel') === 'admin'
        ? 'admin'
        : 'broadcast';
    } catch { /* URL estranha é tela, não painel: o padrão é o mais restrito */ }

    socket.write(aceitarUpgrade(chave));

    const cliente = hub.conectar(
      {
        enviar: (texto) => {
          if (!socket.destroyed) socket.write(codificarFrame(texto));
        },
      },
      { papel },
    );

    let resto = Buffer.alloc(0);
    socket.on('data', (pedaco) => {
      const { mensagens, resto: sobra } = decodificarFrames(Buffer.concat([resto, pedaco]));
      resto = sobra;
      for (const texto of mensagens) cliente.receber(texto);
    });
    // 'close', 'end' e 'error' chegam os três quando um socket morre, e não
    // se sabe qual primeiro. `fechar` é idempotente, então os três chamam.
    socket.on('close', () => cliente.fechar());
    socket.on('end', () => cliente.fechar());
    socket.on('error', () => cliente.fechar());
  });

  /*
   * O relógio da rodada, de segundo em segundo.
   *
   * `unref` porque este temporizador não é motivo para o processo continuar
   * vivo: quem segura o processo é o servidor escutando. Sem ele, um teste
   * que fecha o servidor ficaria pendurado até alguém matar na mão.
   */
  const relogio = setInterval(() => hub.tick(), 1000);
  relogio.unref?.();
  servidor.on('close', () => clearInterval(relogio));
}

/**
 * Compara caminhos de verdade em vez de montar `file://${argv[1]}` na mão:
 * no Windows isso produz `file://C:/...` contra o `file:///C:/...` do
 * import.meta.url, e a comparação falha — o servidor nunca subiria.
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
  const raiz = fileURLToPath(new URL('../public/', import.meta.url));
  const projeto = fileURLToPath(new URL('../', import.meta.url));
  const porta = Number(process.env.PORT ?? 3000);
  const caminhoLocal = caminhoDaConfig(projeto);

  const { config, avisos, erro } = await carregar(caminhoLocal);
  for (const a of avisos) console.warn(`  aviso: ${a}`);
  if (erro) console.warn(`  aviso: ${erro} — seguindo com a configuração padrão`);

  /*
   * A voz do narrador.
   *
   * A pasta é o cache: a mesma frase nunca é sintetizada duas vezes, e o
   * cache sobrevive ao processo — o primeiro seguidor da noite seguinte sai
   * na hora. A voz e a velocidade são FUNÇÕES, e não valores, porque o painel
   * as troca com a live no ar: o sintetizador é reiniciado na frase seguinte
   * com o ajuste novo.
   */
  const pastaDaVoz = join(projeto, 'dados', 'voz');
  let cfgAtual = config;
  const voz = criarVoz({
    pasta: pastaDaVoz,
    nome: () => cfgAtual.narracao?.voz,
    velocidade: () => cfgAtual.narracao?.velocidade,
    aoAvisar: (texto) => console.warn(`  voz: ${texto}`),
  });

  const motor = montarMotor({
    config,
    voz,
    caminhoDoBanco: join(projeto, 'dados', 'votos.sqlite'),
    // Gravar é assíncrono e o hub não espera: o painel recebe o
    // `config.changed` com a configuração que JÁ está valendo, e o arquivo
    // alcança o disco um instante depois. Um disco lento não pode segurar o
    // aviso que o painel mostra.
    aoSalvar: (nova) => {
      cfgAtual = nova;
      salvar(caminhoLocal, nova).catch((e) => console.error(`[config] não gravou: ${e.message}`));
    },
  });

  /*
   * O aquecedor. O primeiro `Add-Type` do PowerShell custa quase dois
   * segundos, e pagá-lo no primeiro seguidor da live seria anunciar o nome
   * dele dois segundos depois do follow. Aqui ninguém está esperando.
   *
   * Sem `await`: um PowerShell que não responda deixaria o servidor sem
   * subir, e a live não pode depender da voz para existir.
   */
  voz.aquecer().then((ok) => {
    if (ok) console.log(`  Voz:    ${voz.voz || 'a primeira do Windows'}`);
  });

  const servidor = criarServidor({ raiz, voz: pastaDaVoz, motor });

  /*
   * O encerramento.
   *
   * `parar` fecha o stdin do sintetizador, que é o sinal combinado para ele
   * terminar sozinho — e é por isso que ele é encerrado ANTES de o processo
   * sair, e não junto com ele: um filho do Node não morre com o pai, e o
   * PowerShell ficaria pendurado na máquina. A folga de um segundo é para o
   * caso de ele estar no meio de uma frase longa: dentro dela, o `parar`
   * dispara a morte na força que o próprio módulo já tem. Não é `unref`
   * justamente porque precisa acontecer.
   *
   * O Ctrl+C chega mais de uma vez, e a segunda não pode reencontrar tudo
   * pela metade.
   */
  let encerrando = false;
  const encerrar = () => {
    if (encerrando) return;
    encerrando = true;
    voz.parar();
    setTimeout(() => process.exit(0), 1200);
  };
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);

  /*
   * A porta ocupada, explicada — em vez da pilha de chamadas do Node.
   *
   * Sem isto, o tropeço mais comum de todos (o servidor da tentativa anterior
   * continuou de pé) vira uma parede de `at Object.<anonymous>` que não diz
   * quem está na porta nem o que fazer. O Leonardo pediu isso com todas as
   * letras: "nao quero ter q dar taskkill e tal para reiniciar".
   *
   * A busca do PID é assíncrona e é a última coisa que este processo faz —
   * depois dela não há mais nada para salvar.
   */
  servidor.on('error', async (erro) => {
    if (erro.code !== 'EADDRINUSE') {
      console.error(`\n  Não consegui subir o servidor: ${erro.message}\n`);
      process.exit(1);
    }
    const pid = await descobrirPidDaPorta(porta);
    console.error(mensagemDePortaOcupada(porta, pid));
    process.exit(1);
  });

  servidor.listen(porta, () => {
    console.log('');
    console.log('  Live Vote Arena');
    console.log(`  Live:   http://localhost:${porta}`);
    console.log(`  Painel: http://localhost:${porta}/admin`);
    console.log('');
  });
}
