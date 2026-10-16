/*
 * A cor de quem RECEBEU o voto, na tela da urna.
 *
 * O `--cor-urna` da raiz é a identidade do GABINETE, e o gabinete continua
 * sendo ele mesmo: a placa diz 13, o filete é vermelho, o halo na mesa é
 * vermelho. Mas o que está ESCRITO na tela é o voto — o número grande, os
 * dígitos, a moldura do retrato, a cédula impressa. Quando o Flávio (22,
 * azul) vota numa urna dois (13, vermelha) porque a do 22 está ocupada, a
 * tela herdava a cor do gabinete e o voto do 22 aparecia em vermelho, dizendo
 * ao espectador que ele tinha votado no 13.
 *
 * A correção é de ESCOPO, e não de valor: a mesma variável, escrita no
 * elemento da tela em vez de na raiz. Como `--cor-urna` herda, quem está
 * dentro da tela passa a ler a cor do voto, e o gabinete — que está fora —
 * continua vermelho. Nada de `--cor-urna-2`, `--cor-urna-fraca` ou
 * `--cor-urna-media`: essas três são do halo e do filete, que são do
 * gabinete.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pintarCorDaTela } from '../public/js/urna.js';

/** Uma caixa de mentira: só o `style` importa, e ele guarda o que foi escrito. */
function caixaFalsa() {
  const props = new Map();
  return {
    props,
    style: {
      setProperty: (nome, valor) => props.set(nome, valor),
      removeProperty: (nome) => props.delete(nome),
    },
  };
}

test('a cor do voto é escrita na tela, por cima da cor do gabinete', () => {
  const caixa = caixaFalsa();
  assert.equal(pintarCorDaTela(caixa, '#1a5fd0'), true);
  assert.equal(caixa.props.get('--cor-urna'), '#1a5fd0',
    'a tela não recebeu a cor do voto: ela vai herdar a do gabinete');
});

test('acabado o voto, a tela volta a herdar a cor do gabinete', () => {
  // O repouso é a máquina sendo ela mesma entre um eleitor e outro. Sem a
  // remoção, a urna ficaria com a tela do candidato anterior até o próximo
  // voto — e uma urna 13 com a tela azul é tão errada quanto o contrário.
  const caixa = caixaFalsa();
  pintarCorDaTela(caixa, '#1a5fd0');
  pintarCorDaTela(caixa, null);
  assert.equal(caixa.props.has('--cor-urna'), false,
    'a cor do voto ficou grudada na tela depois de o voto acabar');
});

test('cor que não é cor não vira variável', () => {
  // A cor vem da configuração, que é editada ao vivo pelo painel. Um valor
  // inválido escrito em `color: var(--cor-urna)` deixaria o texto da tela sem
  // cor nenhuma; sem a variável, ele cai na cor do gabinete, que é válida.
  const caixa = caixaFalsa();
  assert.equal(pintarCorDaTela(caixa, 'javascript:alert(1)'), false);
  assert.equal(caixa.props.has('--cor-urna'), false, 'uma cor inválida foi escrita na tela');
});

test('tela ausente não derruba a escrita do voto', () => {
  assert.equal(pintarCorDaTela(null, '#1a5fd0'), false);
  assert.equal(pintarCorDaTela(undefined, '#1a5fd0'), false);
  assert.equal(pintarCorDaTela({}, '#1a5fd0'), false);
});

/*
 * E as duas metades presas uma na outra: a função acima funciona, e a urna
 * precisa CHAMÁ-LA. Sem navegador não dá para montar uma urna de verdade, e
 * um teste de texto prende o que interessa — quem chama, com que cor, e em
 * que elemento.
 */
function semComentarios(js) {
  return js
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const fonte = semComentarios(readFileSync(
  fileURLToPath(new URL('../public/js/urna.js', import.meta.url)), 'utf8',
));

test('a escrita da tela pinta a cor do estado, e não a da configuração', () => {
  assert.match(fonte, /pintarCorDaTela\(telaConteudo,\s*estado\.cor\s*\)/,
    'a tela é escrita sem a cor do voto: o número sai na cor do gabinete');
});

test('a cédula impressa também sai na cor do voto', () => {
  assert.match(fonte, /pintarCorDaTela\(cedulaEl,\s*dados\.cor\s*\)/,
    'a cédula impressa sai na cor do gabinete, e não na do voto');
});

test('a cor do voto é escrita na tela, e não na raiz da urna', () => {
  // Escrita na raiz, ela levaria junto o filete, o halo e o anel de destaque
  // — o gabinete inteiro viraria a cor do candidato emprestado, e a placa
  // continuaria dizendo 13.
  assert.doesNotMatch(fonte, /pintarCorDaTela\(el,/,
    'a cor do voto foi escrita na raiz: o gabinete inteiro muda de cor');
});
