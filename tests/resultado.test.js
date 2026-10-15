/*
 * A tela de fim de rodada.
 *
 * O que se prende aqui é a única coisa que essa tela não pode errar: dizer
 * quem ganhou quando houve um vencedor, e NÃO dizer quando não houve. Uma
 * tela de resultado que elege alguém num empate, ou que anuncia "venceu" com
 * zero voto, é pior do que não ter tela nenhuma — é a urna mentindo para a
 * audiência, que é exatamente o que este projeto inteiro existe para não
 * fazer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularPlacar, PLACAR_PADRAO } from '../public/js/placar.js';
import { resultadoDaRodada, markupResultado, SEM_VOTOS } from '../public/js/resultado.js';

const URNAS = [
  { id: 'u1', nome: 'Ana Prado', numero: '22', cor: '#1a5fd0' },
  { id: 'u2', nome: 'Bruno Tavares', numero: '13', cor: '#e02020' },
];

/** O placar como a tela de resultado o recebe — o mesmo objeto do placar. */
const placarDe = (v1, v2) => calcularPlacar([
  { ...URNAS[0], votos: v1 },
  { ...URNAS[1], votos: v2 },
]);

test('com um líder, o resultado tem campeão e a contagem final', () => {
  const r = resultadoDaRodada(placarDe(47, 29));
  assert.equal(r.tipo, 'vitoria');
  assert.equal(r.titulo, 'Ana Prado VENCEU!');
  assert.equal(r.cor, '#1a5fd0');
  assert.deepEqual(r.campeoes.map((c) => c.id), ['u1']);
  assert.equal(r.total, 76);
});

test('a manchete sai do modelo configurado, com o nome e o número', () => {
  // O Leonardo pode querer outra frase; o que ele não pode é ficar sem
  // manchete nenhuma no dia em que escrever a dele.
  const modelos = { ...PLACAR_PADRAO, mensagemVitoria: 'URNA {numero} — {urna} GANHOU!' };
  const r = resultadoDaRodada(placarDe(47, 29), { modelos });
  assert.equal(r.titulo, 'URNA 22 — Ana Prado GANHOU!');
});

test('num empate não há campeão, e a manchete é a do empate', () => {
  /*
   * `campeoes` é a lista de QUEM VENCEU, e num empate ninguém venceu. A
   * tentação é devolver os dois, já que os dois são "1º lugar" — mas aí a
   * lista passa a significar duas coisas, e a tela destacaria os dois lados,
   * que é o mesmo que não destacar nenhum, com o agravante de pintar a
   * manchete com uma cor de campeão que não existe.
   *
   * Os dois lados não somem: eles estão em `cartoes`, que é a contagem final.
   */
  const r = resultadoDaRodada(placarDe(30, 30));
  assert.equal(r.tipo, 'empate');
  assert.equal(r.titulo, 'EMPATE NA DISPUTA!');
  assert.equal(r.cor, null);
  assert.deepEqual(r.campeoes, []);
  assert.deepEqual(r.cartoes.map((c) => [c.id, c.votos]), [['u1', 30], ['u2', 30]]);
});

test('rodada que fecha sem voto nenhum não elege ninguém', () => {
  /*
   * Acontece: a rodada abre, ninguém manda presente, o relógio zera. Mostrar
   * "Ana Prado VENCEU!" com zero voto seria a tela inventando uma disputa
   * que não houve.
   */
  const r = resultadoDaRodada(placarDe(0, 0));
  assert.equal(r.tipo, 'sem-votos');
  assert.equal(r.titulo, SEM_VOTOS);
  assert.deepEqual(r.campeoes, []);
  assert.equal(r.cor, null);
  assert.equal(r.total, 0);
});

test('sem placar nenhum, o resultado é o de rodada vazia, e não um erro', () => {
  // A tela pode ser chamada antes do primeiro desenho do placar.
  for (const entrada of [null, undefined, {}]) {
    const r = resultadoDaRodada(entrada);
    assert.equal(r.tipo, 'sem-votos');
    assert.deepEqual(r.cartoes, []);
  }
});

test('a contagem final traz os dois lados, não só o vencedor', () => {
  // Um resultado que só mostra quem ganhou esconde a informação que a
  // audiência quer conferir: por quanto.
  const r = resultadoDaRodada(placarDe(47, 29));
  assert.deepEqual(r.cartoes.map((c) => [c.id, c.votos]), [['u1', 47], ['u2', 29]]);
  assert.deepEqual(r.cartoes.map((c) => c.percentual), ['61,8%', '38,2%']);
});

test('a tela traz a manchete e as duas contagens', () => {
  const html = markupResultado(resultadoDaRodada(placarDe(47, 29)));
  assert.match(html, /Ana Prado VENCEU!/);
  assert.match(html, />47</);
  assert.match(html, />29</);
  assert.match(html, /RODADA ENCERRADA/);
});

test('a contagem final é uma comparação, e não duas colunas soltas', () => {
  // "47 × 29" é como todo resultado de eleição se lê. Dois números grandes
  // lado a lado, sem nada entre eles, obrigam a audiência a montar a
  // comparação de cabeça.
  assert.match(markupResultado(resultadoDaRodada(placarDe(47, 29))), /×/);
  assert.match(markupResultado(resultadoDaRodada(placarDe(30, 30))), /×/);
});

test('a tela veste a cor de quem ganhou', () => {
  const html = markupResultado(resultadoDaRodada(placarDe(47, 29)));
  assert.match(html, /--cor-campeao:\s*#1a5fd0/);
  assert.match(html, /resultado__lado--campeao/);
});

test('e só um lado é o campeão', () => {
  const html = markupResultado(resultadoDaRodada(placarDe(47, 29)));
  assert.equal((html.match(/resultado__lado--campeao/g) ?? []).length, 1);
});

test('num empate a tela não elege campeão nenhum', () => {
  const html = markupResultado(resultadoDaRodada(placarDe(30, 30)));
  assert.doesNotMatch(html, /VENCEU/);
  assert.doesNotMatch(html, /--cor-campeao/);
  assert.doesNotMatch(html, /resultado__lado--campeao/);
  assert.match(html, /EMPATE NA DISPUTA!/);
});

test('rodada vazia não anuncia vitória nem campeão', () => {
  const html = markupResultado(resultadoDaRodada(placarDe(0, 0)));
  assert.doesNotMatch(html, /VENCEU/);
  assert.doesNotMatch(html, /--cor-campeao/);
  assert.match(html, /SEM VOTOS/);
});

test('o total da tela é a soma, e a palavra concorda com ele', () => {
  // "TOTAL 1 VOTOS" é o tipo de coisa que ninguém escreve de propósito e que
  // aparece em toda tela de resultado feita às pressas.
  assert.match(markupResultado(resultadoDaRodada(placarDe(1, 0))), /1<\/b>\s*VOTO\b/);
  const muitos = markupResultado(resultadoDaRodada(placarDe(47, 29)));
  assert.match(muitos, /76<\/b>\s*VOTOS/);
  const zero = markupResultado(resultadoDaRodada(placarDe(0, 0)));
  assert.match(zero, /0<\/b>\s*VOTOS/);
});

test('cada lado da contagem leva o número e a cor da sua urna', () => {
  // Sem isso, num empate as duas colunas ficariam idênticas e a audiência não
  // saberia qual é qual.
  const html = markupResultado(resultadoDaRodada(placarDe(30, 30)));
  assert.match(html, /--cor-urna:\s*#1a5fd0/);
  assert.match(html, /--cor-urna:\s*#e02020/);
  assert.equal((html.match(/>30</g) ?? []).length, 2);
});

test('nome com marcação no arquivo de configuração sai escapado', () => {
  /*
   * O nome do candidato vem de `config/local.json`, que é editado à mão. Um
   * `<` solto ali dentro, sem escape, come a tela de resultado inteira — o
   * navegador lê o resto como marcação e o que sobra não é uma tela.
   */
  const placar = calcularPlacar([
    { id: 'u1', nome: 'Ana <script>alert(1)</script>', numero: '22', cor: '#1a5fd0', votos: 9 },
    { id: 'u2', nome: 'Bruno & Cia', numero: '13', cor: '#e02020', votos: 1 },
  ]);
  const html = markupResultado(resultadoDaRodada(placar));
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Bruno &amp; Cia/);
});
