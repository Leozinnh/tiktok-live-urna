/*
 * A rota que publica a configuração do usuário.
 *
 * O arquivo é do Leonardo, não do site: ele mora fora de public/, e o
 * servidor o publica por uma rota PRÓPRIA em vez de servir a pasta. A
 * diferença importa — uma rota que servisse `config/` inteira daria acesso a
 * qualquer arquivo que ele largasse ali dentro, e a um `../` de distância do
 * resto do projeto.
 *
 * Um arquivo AUSENTE não é erro: é como o projeto começa. Um arquivo
 * QUEBRADO é outra coisa, e precisa chegar ao navegador como problema
 * visível — a alternativa é a live no ar com o candidato errado e ninguém
 * sabendo por quê.
 *
 * O caminho entra por parâmetro em vez de ser fixo para o teste não depender
 * do config/local.json de verdade de quem está rodando a suíte.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarServidor } from '../server/index.js';

let servidor;
let base;
let pasta;
let config;

before(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'urna-config-'));
  config = join(pasta, 'local.json');
  servidor = criarServidor({
    raiz: fileURLToPath(new URL('../public/', import.meta.url)),
    config,
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  servidor.close();
  await rm(pasta, { recursive: true, force: true });
});

/** Escreve o arquivo de configuração do momento. */
const escrever = (texto) => writeFile(config, texto, 'utf8');

test('sem arquivo de configuração, responde objeto vazio — e não 404', async () => {
  /*
   * 404 aqui seria uma mentira com consequência: o navegador trata a rota
   * como quebrada, e quem está começando o projeto — sem config nenhuma —
   * veria erro no console na primeira vez que abrisse a página.
   */
  await rm(config, { force: true });
  const r = await fetch(`${base}/config/local.json`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), {});
  assert.match(r.headers.get('content-type'), /application\/json/);
});

test('devolve o que o usuário escreveu', async () => {
  await escrever(JSON.stringify({ urnas: { u1: { candidato: { nome: 'Ana Prado' } } } }));
  const r = await fetch(`${base}/config/local.json`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { urnas: { u1: { candidato: { nome: 'Ana Prado' } } } });
});

test('arquivo em branco conta como não configurado', async () => {
  // Quem cria o arquivo antes de saber o que pôr dentro tem um arquivo de
  // zero byte. Isso não é JSON inválido, é ausência de configuração.
  await escrever('');
  const r = await fetch(`${base}/config/local.json`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), {});
});

test('JSON quebrado vem com erro, e não como 500', async () => {
  /*
   * JSON malformado é o erro mais provável de todos, porque o arquivo é
   * editado à mão e uma vírgula sobrando basta. O servidor precisa contar o
   * que houve — e não derrubar a página nem fingir que não há configuração.
   */
  await escrever('{ "urnas": { "u1": , } }');
  const r = await fetch(`${base}/config/local.json`);
  assert.equal(r.status, 200);
  const corpo = await r.json();
  assert.equal(typeof corpo.erro, 'string', 'o erro precisa vir nomeado');
  assert.match(corpo.erro, /JSON/i, 'o erro precisa dizer que o problema é o JSON');
  assert.ok(!('urnas' in corpo), 'não pode vir configuração junto com o erro');
});

test('JSON válido que não é objeto também é recusado', async () => {
  for (const conteudo of ['[1, 2, 3]', '"texto solto"', '42', 'null']) {
    await escrever(conteudo);
    const corpo = await (await fetch(`${base}/config/local.json`)).json();
    assert.equal(typeof corpo.erro, 'string', `${conteudo} devia virar erro`);
  }
});

test('a rota serve UM arquivo, e não a pasta config inteira', async () => {
  /*
   * A guarda contra a rota virar um leitor de arquivos. Se alguém trocar o
   * `if` por um `startsWith('/config/')`, isto aqui é o que avisa.
   */
  await writeFile(join(pasta, 'segredo.json'), '{"token":"nao-pode-vazar"}', 'utf8');
  const r = await fetch(`${base}/config/segredo.json`);
  assert.notEqual(r.status, 200, '/config/segredo.json foi servido');

  const direto = await fetch(`${base}/config/../config/segredo.json`);
  assert.ok(!(await direto.text()).includes('nao-pode-vazar'), 'a travessia alcançou o arquivo');
});

test('o arquivo de configuração nunca é cacheado', async () => {
  // O Leonardo edita o arquivo, dá F5 e espera ver a mudança. Com cache, ele
  // conclui que a configuração não funciona.
  await escrever('{"urnas":{}}');
  const r = await fetch(`${base}/config/local.json`);
  assert.match(r.headers.get('cache-control'), /no-store/);
});
