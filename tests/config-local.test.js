/*
 * A configuração do usuário: config/local.json.
 *
 * O arquivo existe para o Leonardo não precisar abrir JavaScript para trocar
 * a foto de um candidato. Ele edita um JSON no Notepad, salva, e a urna
 * recarrega com o candidato dele.
 *
 * Duas decisões que estes testes prendem, e que não são óbvias:
 *
 * 1. A configuração é um REMENDO sobre os padrões, e não um substituto. Quem
 *    só quer trocar a foto escreve só a foto; o resto — número, cargo,
 *    partido, cor — continua vindo do padrão. Um arquivo que substituísse
 *    tudo obrigaria a reescrever a urna inteira para trocar uma imagem, e o
 *    dia em que um campo novo nascesse no padrão ele sumiria para quem já
 *    tinha configurado.
 *
 * 2. `foto` aceita link e arquivo, e a diferença é só o começo do texto.
 *    Quem escreve `ana.jpg` está apontando para public/fotos/ana.jpg; quem
 *    escreve `https://...` está apontando para fora. Sem essa regra, o
 *    caminho relativo viraria uma URL relativa à PÁGINA, e a foto sumiria
 *    dependendo de qual endereço estivesse aberto.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { urlDaFoto, aplicarConfig } from '../public/js/config.js';

test('a foto aceita link da internet, caminho do servidor e nome de arquivo', () => {
  // Os dois jeitos que o Leonardo escolheu, mais o nome solto — que é o mais
  // provável de todos, porque é o que ele escreveria lendo a pasta fotos/.
  assert.equal(urlDaFoto('https://i.imgur.com/abc.jpg'), 'https://i.imgur.com/abc.jpg');
  assert.equal(urlDaFoto('http://exemplo.com/a.png'), 'http://exemplo.com/a.png');
  assert.equal(urlDaFoto('/fotos/ana.jpg'), '/fotos/ana.jpg');
  assert.equal(urlDaFoto('ana.jpg'), '/fotos/ana.jpg');
  assert.equal(urlDaFoto('ana prado.png'), '/fotos/ana prado.png');
});

test('sem foto, ou com foto vazia, o resultado é nenhuma foto', () => {
  // Não é o mesmo que string vazia: o desenho entra quando o valor é nulo, e
  // `<img src="">` faz o navegador pedir a PRÓPRIA PÁGINA como imagem.
  for (const vazio of [undefined, null, '', '   ']) {
    assert.equal(urlDaFoto(vazio), null, `${JSON.stringify(vazio)} devia dar nenhuma foto`);
  }
});

test('o que o usuário escreveu vence o padrão, campo a campo', () => {
  const padroes = [{
    id: 'u1', nome: 'URNA 1', numero: '22', corPrimaria: '#1a5fd0',
    cargo: 'DEPUTADO FEDERAL',
    candidato: { nome: 'Ana Prado', partido: 'PARTIDO A' },
  }];
  const [u1] = aplicarConfig(padroes, {
    urnas: { u1: { candidato: { nome: 'Zé da Silva' } } },
  });

  assert.equal(u1.candidato.nome, 'Zé da Silva', 'o nome não foi trocado');
  // O que ele NÃO escreveu continua lá. É isto que faz o arquivo ser um
  // remendo: trocar o candidato não apaga o partido nem o cargo.
  assert.equal(u1.candidato.partido, 'PARTIDO A', 'o partido sumiu junto');
  assert.equal(u1.cargo, 'DEPUTADO FEDERAL', 'o cargo sumiu junto');
  assert.equal(u1.numero, '22', 'o número sumiu junto');
  assert.equal(u1.corPrimaria, '#1a5fd0', 'a cor sumiu junto');
});

test('quem só quer trocar a foto escreve só a foto', () => {
  // O caso de uso número um. Se este teste quebrar, o Leonardo vai ter que
  // reescrever o candidato inteiro para trocar uma imagem.
  const padroes = [{
    id: 'u1', nome: 'URNA 1', numero: '22',
    candidato: { nome: 'Ana Prado', partido: 'PARTIDO A' },
  }];
  const [u1] = aplicarConfig(padroes, { urnas: { u1: { candidato: { foto: 'ana.jpg' } } } });

  assert.equal(u1.candidato.foto, '/fotos/ana.jpg');
  assert.equal(u1.candidato.nome, 'Ana Prado');
  assert.equal(u1.candidato.partido, 'PARTIDO A');
});

test('sem arquivo de configuração, os padrões passam intactos', () => {
  const padroes = [{ id: 'u1', nome: 'URNA 1', numero: '22', candidato: { nome: 'A' } }];
  for (const vazio of [undefined, null, {}, { urnas: {} }, { urnas: null }]) {
    const r = aplicarConfig(padroes, vazio);
    assert.equal(r[0].candidato.nome, 'A');
    assert.equal(r[0].numero, '22');
  }
});

test('a configuração não acrescenta nem remove urna', () => {
  /*
   * São duas urnas, e a cena é construída em cima disso. Uma chave a mais no
   * arquivo — um `u3` que o Leonardo deixou para depois, ou um erro de
   * digitação — não pode fazer nascer uma terceira urna no palco.
   */
  const padroes = [{ id: 'u1' }, { id: 'u2' }];
  const r = aplicarConfig(padroes, {
    urnas: { u3: { numero: '99' }, u1: { numero: '44' } },
  });
  assert.equal(r.length, 2, 'a configuração mexeu no número de urnas');
  assert.deepEqual(r.map((u) => u.id), ['u1', 'u2']);
  assert.equal(r[0].numero, '44');
  assert.equal(r[1].numero, undefined, 'o u2 não foi tocado');
});

test('lixo no lugar dos campos não entra na urna', () => {
  /*
   * O arquivo é editado à mão, então um `numero: 22` sem aspas, um `candidato:
   * "Ana"` como texto solto e um `urnas: []` são todos esperados. Nenhum
   * deles pode virar HTML na tela nem apagar o padrão: o que não serve é
   * ignorado, e o padrão fica.
   */
  const padroes = [{ id: 'u1', numero: '22', candidato: { nome: 'Ana' } }];

  const comNumeroSolto = aplicarConfig(padroes, { urnas: { u1: { numero: 22 } } });
  assert.equal(comNumeroSolto[0].numero, '22', 'número sem aspas apagou o padrão');

  const comCandidatoTexto = aplicarConfig(padroes, { urnas: { u1: { candidato: 'Ana' } } });
  assert.equal(comCandidatoTexto[0].candidato.nome, 'Ana', 'candidato em texto solto apagou o padrão');

  const comLista = aplicarConfig(padroes, { urnas: [] });
  assert.equal(comLista[0].numero, '22', 'urnas como lista apagou o padrão');
});

test('a configuração não escreve por cima do objeto de padrões', () => {
  // `aplicarConfig` devolve configuração nova. Se ela mexesse no padrão, o
  // segundo carregamento — depois de um F5 — partiria de um padrão já
  // sujo, e a foto antiga voltaria colada.
  const padroes = [{ id: 'u1', candidato: { nome: 'Ana' } }];
  aplicarConfig(padroes, { urnas: { u1: { candidato: { nome: 'Zé' } } } });
  assert.equal(padroes[0].candidato.nome, 'Ana', 'o padrão foi mexido no lugar');
});

test('cor e número inválidos não derrubam a urna', () => {
  // A cor entra num `style` e o número vai para a tela. Nenhum dos dois pode
  // aceitar qualquer coisa só porque veio do arquivo.
  const padroes = [{ id: 'u1', numero: '22', corPrimaria: '#1a5fd0' }];

  const corTorta = aplicarConfig(padroes, { urnas: { u1: { corPrimaria: 'vermelho' } } });
  assert.equal(corTorta[0].corPrimaria, '#1a5fd0', 'cor inválida entrou na urna');

  const numeroLongo = aplicarConfig(padroes, { urnas: { u1: { numero: '123456789' } } });
  assert.equal(numeroLongo[0].numero, '22', 'número fora do formato entrou na urna');
});
