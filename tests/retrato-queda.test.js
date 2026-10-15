/*
 * A foto do candidato que não carrega.
 *
 * Quem configura vai apontar para o arquivo dele e vai errar o caminho — é o
 * que acontece na primeira vez. Sem tratamento, o navegador desenha o ícone
 * de imagem quebrada no lugar do retrato: na live, na frente de todo mundo, a
 * urna mostra um quadradinho com um X no meio.
 *
 * O que o Leonardo pediu foi o contrário disso: se o link não vale, aparece o
 * desenho que já existia. Então a queda não é um detalhe de robustez, é o
 * comportamento pedido — e por isso tem teste.
 *
 * O teste monta um elemento falso em vez de um DOM de verdade: o que precisa
 * ser exercitado é a LIGAÇÃO (que evento, que troca, em que ordem), e isso se
 * verifica sem navegador. Ver tests/retrato-queda.test.js no navegador não
 * provaria mais do que isto prova.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ligarQuedaDoRetrato } from '../public/js/urna.js';

/**
 * Uma tela de mentira com a foto dentro.
 *
 * `jaFalhou` é o caso da imagem que o navegador já tentou carregar e
 * desistiu ANTES de este código existir — cache negativo, ou a tela escrita
 * e relida no mesmo quadro. Nesse caso não vem evento nenhum, e esperar por
 * ele deixaria o X na tela para sempre.
 */
function telaFalsa({ comFoto = true, jaFalhou = false } = {}) {
  const ouvintes = new Map();
  const caixa = { innerHTML: '' };
  const img = comFoto
    ? {
      parentNode: caixa,
      addEventListener(tipo, fn) {
        if (!ouvintes.has(tipo)) ouvintes.set(tipo, []);
        ouvintes.get(tipo).push(fn);
      },
      complete: jaFalhou,
      naturalWidth: 0,
    }
    : null;

  return {
    caixa,
    img,
    raiz: { querySelector: (sel) => (sel === '.tela__retrato-foto' ? img : null) },
    /** Dispara o evento como o navegador dispararia. */
    falhar() { for (const fn of ouvintes.get('error') ?? []) fn(); },
    ouve: (tipo) => ouvintes.has(tipo),
  };
}

test('a foto que não carrega dá lugar ao desenho', () => {
  const t = telaFalsa();
  ligarQuedaDoRetrato(t.raiz, '#1a5fd0');
  assert.ok(t.ouve('error'), 'ninguém escutou a falha da imagem');

  t.falhar();
  assert.match(t.caixa.innerHTML, /tela__retrato-svg/, 'a foto quebrada não virou o desenho');
});

test('enquanto a foto carrega, o desenho não aparece por baixo', () => {
  // Se o desenho fosse escrito junto com a foto, o retrato de verdade
  // ficaria escondido atrás dele — ou apareceriam os dois.
  const t = telaFalsa();
  ligarQuedaDoRetrato(t.raiz, '#1a5fd0');
  assert.equal(t.caixa.innerHTML, '', 'o desenho apareceu antes de a foto falhar');
});

test('o desenho da queda é da cor da urna', () => {
  // O retrato de reserva é o mesmo desenho do começo — com a cor da urna, e
  // não com o azul padrão. Uma foto errada que virasse um retrato de outra
  // cor apareceria como um segundo candidato.
  const t = telaFalsa();
  ligarQuedaDoRetrato(t.raiz, '#c8102e');
  t.falhar();
  assert.match(t.caixa.innerHTML, /#c8102e/, 'o desenho veio com a cor padrão');
});

test('a queda não é um <img>, senão ela se repetiria para sempre', () => {
  /*
   * O jeito errado de consertar isto é trocar o `src` por um desenho em
   * arquivo: o desenho também seria uma imagem, também poderia falhar, e a
   * tela ficaria alternando entre dois erros. O reserva é SVG desenhado
   * dentro da página, e não tem como falhar.
   */
  const t = telaFalsa();
  ligarQuedaDoRetrato(t.raiz, '#1a5fd0');
  t.falhar();
  assert.ok(!/<img/.test(t.caixa.innerHTML), 'o reserva é uma imagem: pode falhar de novo');
});

test('a foto que já chegou quebrada é trocada sem esperar evento', () => {
  const t = telaFalsa({ jaFalhou: true });
  ligarQuedaDoRetrato(t.raiz, '#1a5fd0');
  assert.match(t.caixa.innerHTML, /tela__retrato-svg/, 'ficou o X na tela esperando um evento que não vem');
});

test('a foto que carregou não é trocada', () => {
  const t = telaFalsa({ jaFalhou: false });
  const ligou = ligarQuedaDoRetrato(t.raiz, '#1a5fd0');
  assert.equal(ligou, true);
  assert.equal(t.caixa.innerHTML, '');
});

test('sem foto na tela não há o que ligar, e isso não é erro', () => {
  // O caso comum: candidato sem foto configurada, o desenho já está lá.
  const t = telaFalsa({ comFoto: false });
  assert.equal(ligarQuedaDoRetrato(t.raiz, '#1a5fd0'), false);
});

test('uma tela sem retrato nenhum não derruba a escrita da tela', () => {
  // O estado "confirmado" e o "corrija" não têm ficha: nenhum retrato, e
  // nenhuma foto para ligar. Isso não pode virar exceção no meio da live.
  assert.equal(ligarQuedaDoRetrato({ querySelector: () => null }, '#1a5fd0'), false);
  assert.equal(ligarQuedaDoRetrato(null, '#1a5fd0'), false);
});

/*
 * E o teste que prende as duas metades uma na outra.
 *
 * Os oito acima provam que a função funciona; nenhum deles prova que a urna
 * a CHAMA. Uma função certa que ninguém chama não conserta nada na live, e
 * este projeto já teve um defeito exatamente assim — o `data-urna` que dois
 * elementos respondiam, com o voto morrendo em silêncio.
 *
 * Lê o texto do arquivo porque é o único jeito sem navegador: `criarUrna`
 * monta o painel com um DOM de verdade, e o teste não tem um. Vale o que
 * vale um teste de texto — prende a ligação e a ORDEM, não o comportamento.
 */
function semComentarios(js) {
  return js
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

test('a tela liga a queda do retrato a cada escrita, e depois de escrever', () => {
  const fonte = semComentarios(readFileSync(
    fileURLToPath(new URL('../public/js/urna.js', import.meta.url)), 'utf8',
  ));

  const escritas = [...fonte.matchAll(/telaConteudo\.innerHTML\s*=/g)];
  assert.equal(escritas.length, 1,
    `a tela é escrita em ${escritas.length} lugares; a queda do retrato só está ligada em um`);

  const ligacoes = [...fonte.matchAll(/ligarQuedaDoRetrato\(\s*telaConteudo\b/g)];
  assert.equal(ligacoes.length, 1, 'a queda do retrato não está ligada na tela');

  /*
   * A ordem não é estilo. Ligar ANTES de escrever prendê-los-ia na foto que
   * está prestes a ser jogada fora: a tela seria reescrita logo em seguida,
   * a foto nova ficaria sem ouvinte, e o defeito só apareceria na segunda
   * foto quebrada.
   */
  assert.ok(ligacoes[0].index > escritas[0].index,
    'a queda do retrato é ligada antes de a tela ser escrita — o ouvinte morre na escrita seguinte');
});
