import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alturaDoRodape, markupPainel } from '../public/js/painel.js';

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

const votos = (...linhas) => linhas.map(([usuario, numero, cor]) => ({ usuario, numero, cor }));

/* Quantos aparelhos o markup liga: um por `<div class="painel painel--x">`. */
const aparelhos = (html) => [...html.matchAll(/class="painel painel--/g)].length;

test('sem fila, os últimos votos ganham um monitor ao lado do ranking', () => {
  // "no monitor 'quem mais presentou' divida ele com um novo monitor
  // 'ultimos votos' falando nome e em quem votou" — o pedido do Leonardo.
  // Dois assuntos que só são verdadeiros juntos, então dois aparelhos.
  const html = markupPainel({
    fila: [],
    ranking: ranking(['Ana', 12], ['Bia', 7]),
    ultimos: votos(['Caio', '13', '#e02020']),
  });
  assert.match(html, /QUEM MAIS PRESENTEOU/);
  assert.match(html, /ÚLTIMOS VOTOS/);
  assert.equal(aparelhos(html), 2, 'os dois assuntos não dividem o mesmo aparelho');
});

test('com fila, os dois monitores saem de cena', () => {
  // Enquanto há fila, o que o espectador precisa saber é a vez dele. Os dois
  // monitores de gente (quem mais presenteou, últimos votos) ficam para
  // quando a fila acabar — senão o painel vira três aparelhos numa faixa só.
  const html = markupPainel({
    fila: fila('Ana', 'Bia'),
    ranking: ranking(['Ana', 12]),
    ultimos: votos(['Caio', '13', '#e02020']),
  });
  assert.equal(aparelhos(html), 1);
  assert.match(html, /NA FILA/);
  assert.doesNotMatch(html, /QUEM MAIS PRESENTEOU/);
  assert.doesNotMatch(html, /ÚLTIMOS VOTOS/);
});

test('cada monitor carrega a própria marca e o próprio pé', () => {
  // Eles eram pseudo-elementos da ÁREA enquanto havia um aparelho só. Com
  // dois, um `::before` da área esticaria a palavra ARENA por cima dos dois
  // e a travessa do pé sairia de um aparelho para o outro: um aparelho
  // emprestando o queixo para o vizinho. Um de cada, por aparelho.
  const html = markupPainel({
    fila: [],
    ranking: ranking(['Ana', 12]),
    ultimos: votos(['Caio', '13', '#e02020'], ['Dora', '22', '#1a5fd0']),
  });
  assert.equal(aparelhos(html), 2);
  assert.equal([...html.matchAll(/painel__marca/g)].length, 2, 'falta a marca em um dos aparelhos');
  assert.equal([...html.matchAll(/painel__pe"/g)].length, 2, 'falta o pé em um dos aparelhos');
});

test('a linha do voto diz quem votou e em quem, na cor da urna', () => {
  // "falando nome e em quem votou" — o nome de quem mandou o presente, e o
  // número da urna que recebeu o voto. A cor é o que liga a linha ao
  // aparelho na tela sem ninguém precisar ler o número.
  const html = markupPainel({ fila: [], ranking: [], ultimos: votos(['Caio', '13', '#e02020']) });
  assert.match(html, /--cor-urna:#e02020/);
  assert.match(html, /painel__nome">Caio</);
  assert.match(html, /painel__seta/);
  assert.match(html, /painel__numero">13</);
});

test('os últimos votos vêm do mais novo para o mais velho', () => {
  // A ordem é a de chegada, e quem manda é quem guarda a lista: o mais novo
  // no alto, porque quem acabou de presentear olha para a tela agora e
  // procura o próprio nome ali em cima.
  const html = markupPainel({
    fila: [],
    ranking: [],
    ultimos: votos(['Novo', '22', '#1a5fd0'], ['Meio', '13', '#e02020'], ['Velho', '22', '#1a5fd0']),
  });
  const nomes = [...html.matchAll(/painel__nome">([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(nomes, ['Novo', 'Meio', 'Velho']);
});

test('os últimos votos mostram quatro, e o resto sai por baixo sem "+N"', () => {
  // A lista é uma janela que anda: o voto mais velho sai sozinho. "E mais
  // 47" numa lista de votos não quer dizer nada — o que passou, passou.
  const html = markupPainel({
    fila: [],
    ranking: [],
    ultimos: votos(['A', '22', '#1a5fd0'], ['B', '22', '#1a5fd0'], ['C', '22', '#1a5fd0'],
      ['D', '22', '#1a5fd0'], ['E', '22', '#1a5fd0']),
  });
  assert.equal([...html.matchAll(/painel__item--voto/g)].length, 4);
  assert.doesNotMatch(html, /painel__resto/);
});

test('últimos votos sem ranking ligam um monitor só', () => {
  // Acontece no começo da rodada: já votaram, e o servidor ainda não mandou
  // a lista de quem mais presenteou. Um monitor ligado sem nada para dizer é
  // pior do que monitor nenhum.
  const html = markupPainel({ fila: [], ranking: [], ultimos: votos(['Caio', '13', '#e02020']) });
  assert.equal(aparelhos(html), 1);
  assert.match(html, /ÚLTIMOS VOTOS/);
  assert.doesNotMatch(html, /QUEM MAIS PRESENTEOU/);
});

test('o nome de quem votou também sai escapado', () => {
  const html = markupPainel({
    fila: [],
    ranking: [],
    ultimos: votos(['<script>alert(1)</script>', '13', '#e02020']),
  });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
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

/*
 * A altura do rodapé em pixel de PALCO.
 *
 * O `getBoundingClientRect` devolve pixel de TELA, e o palco é escalado para
 * caber na janela (0,56 numa janela deitada, 0,38 conferindo). O CSS lê a
 * variável em pixel de palco. Sem a divisão, a medida valia 251px na
 * transmissão em tela cheia e 95px na janela pequena do Leonardo — e a faixa
 * da narração descia para dentro do painel, que é z 60 contra o z 50 dela:
 * o placar inferior passava por cima da camada de efeitos, no ar.
 */
test('a altura do rodapé divide a medida de tela pela escala do palco', () => {
  assert.equal(alturaDoRodape({ fundo: 1920, topo: 1669, escala: 1, vazio: false }), 251);
  assert.equal(alturaDoRodape({ fundo: 960, topo: 865, escala: 0.38, vazio: false }), 250);
  assert.equal(alturaDoRodape({ fundo: 960, topo: 865, escala: 1, vazio: false }), 95,
    'sem a divisão, a janela pequena media 95px em vez de 250');
});

test('o rodapé vazio tem altura zero, e a conta nunca é negativa', () => {
  assert.equal(alturaDoRodape({ fundo: 1920, topo: 1669, escala: 1, vazio: true }), 0);
  assert.equal(alturaDoRodape({ fundo: 100, topo: 200, escala: 1, vazio: false }), 0);
  assert.equal(alturaDoRodape({ fundo: 1920, topo: 1669, escala: 0, vazio: false }), 251,
    'escala zero não pode dividir por zero');
});
