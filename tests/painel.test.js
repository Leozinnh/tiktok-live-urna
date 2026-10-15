import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markupPainel } from '../public/js/painel.js';

const fila = (...nomes) => nomes.map((nome, i) => ({
  id: `f${i}`, urnaId: i % 2 === 0 ? 'u1' : 'u2', numero: i % 2 === 0 ? '22' : '13',
  cor: i % 2 === 0 ? '#1a5fd0' : '#e02020', usuario: nome, presentes: 1,
}));

const ranking = (...pares) => pares.map(([nome, presentes]) => ({ nome, presentes }));

test('com fila, o painel mostra os nomes na ordem em que vão ser atendidos', () => {
  const html = markupPainel({ fila: fila('Ana', 'Bia', 'Caio'), ranking: [] });
  assert.match(html, /NA FILA/);
  const nomes = [...html.matchAll(/painel__nome">([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(nomes, ['Ana', 'Bia', 'Caio']);
});

test('cada nome na fila carrega a urna para a qual ele votou', () => {
  // O espectador que presenteou procura o NOME dele. O número ao lado diz
  // para onde o voto dele vai, e é o que liga a linha à urna na tela.
  const html = markupPainel({ fila: fila('Ana', 'Bia'), ranking: [] });
  assert.match(html, /--cor-urna:#1a5fd0/);
  assert.match(html, /--cor-urna:#e02020/);
  assert.match(html, /painel__numero">22</);
  assert.match(html, /painel__numero">13</);
});

test('a fila mostra quatro nomes e resume o resto', () => {
  // Numa live movimentada a fila passa de vinte. Vinte linhas não caibam na
  // tela, e as últimas seriam ilegíveis de qualquer jeito.
  const html = markupPainel({ fila: fila('A', 'B', 'C', 'D', 'E', 'F', 'G'), ranking: [] });
  assert.equal([...html.matchAll(/painel__nome">/g)].length, 4);
  assert.match(html, /\+3/);
});

test('fila de quatro não inventa um "+0"', () => {
  const html = markupPainel({ fila: fila('A', 'B', 'C', 'D'), ranking: [] });
  assert.doesNotMatch(html, /\+0/);
  assert.doesNotMatch(html, /painel__resto/);
});

test('sem fila, o painel passa a mostrar quem mais presenteou', () => {
  // Um painel só, dois assuntos: com fila o que importa é a vez de cada um;
  // parado, o que importa é quem está mandando. Os dois juntos competiriam
  // pelo mesmo canto da tela e nenhum dos dois seria lido.
  const html = markupPainel({ fila: [], ranking: ranking(['Ana', 12], ['Bia', 7]) });
  assert.match(html, /QUEM MAIS PRESENTEOU/);
  assert.doesNotMatch(html, /NA FILA/);
  assert.match(html, /painel__nome">Ana</);
  assert.match(html, /painel__contagem">12</);
});

test('o ranking é ordenado do maior para o menor, sem confiar em quem chamou', () => {
  const html = markupPainel({ fila: [], ranking: ranking(['Bia', 7], ['Ana', 12], ['Caio', 9]) });
  const nomes = [...html.matchAll(/painel__nome">([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(nomes, ['Ana', 'Caio', 'Bia']);
});

test('o ranking mostra três e resume o resto', () => {
  const html = markupPainel({
    fila: [],
    ranking: ranking(['A', 9], ['B', 8], ['C', 7], ['D', 6], ['E', 5]),
  });
  assert.equal([...html.matchAll(/painel__posicao">/g)].length, 3);
  assert.match(html, /\+2/);
});

test('sem fila e sem ranking o painel não existe', () => {
  // Uma caixa vazia no rodapé da live é pior do que rodapé nenhum: ocupa a
  // tela e não diz nada. Devolver string vazia é o que apaga o painel.
  assert.equal(markupPainel({ fila: [], ranking: [] }), '');
  assert.equal(markupPainel({}), '');
  assert.equal(markupPainel(), '');
});

test('nome de espectador com HTML dentro sai escapado', () => {
  // O nome vem do TikTok, ou seja, de um estranho. É a única entrada deste
  // projeto que um desconhecido escolhe.
  const html = markupPainel({
    fila: [{ id: 'x', urnaId: 'u1', numero: '22', cor: '#1a5fd0', usuario: '<img src=x onerror=alert(1)>' }],
    ranking: [],
  });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});

test('o ranking também escapa o nome', () => {
  const html = markupPainel({ fila: [], ranking: [{ nome: '<b>Rui</b>', presentes: 3 }] });
  assert.doesNotMatch(html, /<b>/);
  assert.match(html, /&lt;b&gt;/);
});

test('o título do painel é configurável', () => {
  const html = markupPainel({
    fila: fila('Ana'),
    ranking: [],
    tituloFila: 'PRÓXIMOS A VOTAR',
  });
  assert.match(html, /PRÓXIMOS A VOTAR/);
  assert.doesNotMatch(html, /NA FILA/);
});
