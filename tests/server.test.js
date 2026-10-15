import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
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
