import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

export function criarServidor({ raiz }) {
  return createServer((req, res) => {
    // Envolvido à mão em vez de async/await: uma promessa rejeitada aqui
    // derrubaria o processo inteiro no meio de uma live.
    (async () => {
      try {
        const url = new URL(req.url, 'http://localhost');
        let caminho = decodeURIComponent(url.pathname);
        if (caminho === '/') caminho = '/broadcast.html';

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
  const porta = Number(process.env.PORT ?? 3000);
  criarServidor({ raiz }).listen(porta, () => {
    console.log('');
    console.log('  Live Vote Arena');
    console.log(`  Live:  http://localhost:${porta}`);
    console.log('');
  });
}
