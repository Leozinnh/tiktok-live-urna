import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { criarServidor } from '../server/index.js';

let servidor;
let base;
let porta;

before(async () => {
  servidor = criarServidor({ raiz: fileURLToPath(new URL('../public/', import.meta.url)) });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  porta = servidor.address().port;
  base = `http://127.0.0.1:${porta}`;
});

after(() => servidor.close());

/**
 * Requisição crua, sem passar pelo parser de URL do fetch.
 * O fetch normaliza `/../x` para `/x` antes de enviar, então ele não
 * consegue exercitar a proteção contra travessia — este helper consegue.
 */
function cru(caminho) {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port: porta, path: caminho, method: 'GET' },
      (res) => {
        let corpo = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { corpo += c; });
        res.on('end', () => resolve({ status: res.statusCode, corpo }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

test('serve broadcast.html na raiz', async () => {
  const r = await fetch(`${base}/`);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /id="cena"/);
});

test('serve CSS com o content-type correto', async () => {
  const r = await fetch(`${base}/css/tokens.css`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/css/);
});

test('serve JS com o content-type correto', async () => {
  const r = await fetch(`${base}/js/demo.js`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/javascript/);
});

/**
 * O parser de URL já neutraliza `/../x` e `/%2e%2e/x` — os dois viram `/x`
 * antes de chegar ao servidor. O que sobrevive ao parser é a barra
 * codificada, e é isso que o guard de `join` + `startsWith` precisa pegar.
 */
test('recusa travessia com barra codificada', async () => {
  const r = await cru('/%2e%2e%2fpackage.json');
  assert.equal(r.status, 403);
  assert.ok(!r.corpo.includes('tiktok-live-urna'), 'não pode vazar o conteúdo de fora da raiz');
});

test('recusa travessia com barra invertida codificada', async () => {
  const r = await cru('/%2e%2e%5cpackage.json');
  assert.equal(r.status, 403);
  assert.ok(!r.corpo.includes('tiktok-live-urna'));
});

test('nunca serve arquivo de fora da raiz, por nenhuma forma de travessia', async () => {
  const tentativas = [
    '/../package.json',
    '/%2e%2e/package.json',
    '/..%2fpackage.json',
    '/%2e%2e%2f%2e%2e%2fpackage.json',
  ];
  for (const caminho of tentativas) {
    const r = await cru(caminho);
    assert.notEqual(r.status, 200, `${caminho} não pode ser servido`);
    assert.ok(!r.corpo.includes('tiktok-live-urna'), `${caminho} vazou conteúdo`);
  }
});

test('responde 404 para arquivo inexistente', async () => {
  const r = await fetch(`${base}/nao-existe.js`);
  assert.equal(r.status, 404);
});

/*
 * A pasta de fotos mora FORA de public/, ao lado de config/local.json.
 *
 * É a mesma razão do config: a foto do candidato é do Leonardo, não do site.
 * Dentro de public/ ela seria varrida junto com o código e sumiria na
 * primeira vez que alguém limpasse a pasta para recomeçar. Ao lado, ela
 * sobrevive — e é onde ele naturalmente jogou os arquivos.
 *
 * O que a rota prende é o que aconteceu de verdade: os retratos estavam em
 * `fotos/` na raiz, o servidor só publicava `public/`, e cada voto pedia a
 * foto de novo e levava 404 no console no meio da live.
 *
 * A pasta é montada aqui em vez de apontar para a de verdade: um teste que
 * lê `fotos/lula.png` fica vermelho no dia em que ele trocar o retrato, e
 * não por causa do servidor. Montada, ele prende as duas coisas ao mesmo
 * tempo — a rota E o padrão, que é `../fotos` a partir da raiz.
 */
test('serve a foto da pasta ao lado de public/, e é lá que ela é procurada por padrão', async () => {
  const projeto = await mkdtemp(join(tmpdir(), 'urna-fotos-'));
  const publico = join(projeto, 'public');
  const retratos = join(projeto, 'fotos');
  await mkdir(publico);
  await mkdir(retratos);
  // Um PNG de verdade, mínimo, para o content-type ser exercitado de fato.
  await writeFile(join(retratos, 'retrato.png'),
    Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex'));

  // Sem `fotos` explícito: é o padrão do projeto que está sendo testado.
  const s = criarServidor({ raiz: publico });
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok));
  const p = s.address().port;

  try {
    const r = await fetch(`http://127.0.0.1:${p}/fotos/retrato.png`);
    assert.equal(r.status, 200, 'a foto precisa ser servida de ../fotos, e não de public/');
    assert.match(r.headers.get('content-type'), /image\/png/);

    const faltando = await fetch(`http://127.0.0.1:${p}/fotos/nao-existe.png`);
    assert.equal(faltando.status, 404);
  } finally {
    s.close();
    await rm(projeto, { recursive: true, force: true });
  }
});

/*
 * O tipo da imagem precisa sair certo, e não como `octet-stream`.
 *
 * Um `.webp` servido como binário genérico é a diferença entre o retrato
 * aparecer e o `error` do `<img>` disparar — e o que aparece no lugar é o
 * desenho, silenciosamente, sem ninguém entender por quê. O formato que
 * expôs isso foi o webp, que é o que o TikTok e o celular cospem por padrão.
 */
test('serve os formatos de imagem que um retrato costuma ter', async () => {
  const projeto = await mkdtemp(join(tmpdir(), 'urna-tipos-'));
  const publico = join(projeto, 'public');
  const retratos = join(projeto, 'fotos');
  await mkdir(publico);
  await mkdir(retratos);
  for (const nome of ['a.webp', 'b.png', 'c.jpg', 'd.jpeg', 'e.gif']) {
    await writeFile(join(retratos, nome), Buffer.from([0]));
  }

  const s = criarServidor({ raiz: publico });
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok));
  const p = s.address().port;

  try {
    const esperado = {
      'a.webp': /image\/webp/,
      'b.png': /image\/png/,
      'c.jpg': /image\/jpeg/,
      'd.jpeg': /image\/jpeg/,
      'e.gif': /image\/gif/,
    };
    for (const [nome, tipo] of Object.entries(esperado)) {
      const r = await fetch(`http://127.0.0.1:${p}/fotos/${nome}`);
      assert.match(r.headers.get('content-type'), tipo, `${nome} saiu com o tipo errado`);
    }
  } finally {
    s.close();
    await rm(projeto, { recursive: true, force: true });
  }
});

test('e a rota de fotos não abre o que está fora da pasta', async () => {
  const tentativas = [
    '/fotos/%2e%2e%2f%2e%2e%2fpackage.json',
    '/fotos/..%2f..%2fpackage.json',
    '/fotos/sub%2fpasta.png',
  ];
  for (const caminho of tentativas) {
    const r = await cru(caminho);
    assert.notEqual(r.status, 200, `${caminho} não pode ser servido`);
    assert.ok(!r.corpo.includes('tiktok-live-urna'), `${caminho} vazou conteúdo`);
  }
});
