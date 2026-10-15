import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderizarTela } from '../public/js/urna.js';

test('ocioso mostra o número, o nome e o cargo do candidato', () => {
  /*
   * É o que a urna de verdade deixa na tela entre um eleitor e outro: o
   * retrato, o nome, o partido e o número. A contagem NÃO entra aqui — ela
   * mora no painel do alto do enquadramento, e é lá que o teste dela vive.
   */
  const html = renderizarTela({
    tipo: 'ocioso', numero: '22', nome: 'URNA 1', votos: 61,
    cargo: 'DEPUTADO FEDERAL',
    candidato: { nome: 'Ana Prado', partido: 'PARTIDO A' },
  });
  assert.match(html, /22/);
  assert.match(html, /Ana Prado/);
  assert.match(html, /PARTIDO A/);
  assert.match(html, /DEPUTADO FEDERAL/);
});

test('digitando mostra os dígitos já digitados, alinhados à direita', () => {
  const html = renderizarTela({ tipo: 'digitando', numeroDigitado: '2', numero: '22', votos: 0 });
  assert.match(html, /tela__digito/);
  assert.match(html, />2</);
});

test('confirmado mostra a mensagem e a contagem', () => {
  const html = renderizarTela({ tipo: 'confirmado', numero: '22', votos: 62, votosAdicionados: 1 });
  assert.match(html, /VOTO CONFIRMADO/);
  assert.match(html, /62/);
});

test('escapa HTML vindo do nome da urna', () => {
  const html = renderizarTela({ tipo: 'ocioso', numero: '22', nome: '<img src=x onerror=alert(1)>', votos: 0 });
  assert.ok(!html.includes('<img'));
  assert.match(html, /&lt;img/);
});

test('estado desconhecido não quebra nem some da tela', () => {
  // Um estado a mais chegando de uma integração futura não pode deixar
  // a tela em branco no meio da live: cai no ocioso.
  const html = renderizarTela({ tipo: 'inexistente', numero: '22', nome: 'URNA 1', votos: 7 });
  assert.match(html, /URNA 1/);
  assert.match(html, /7/);
});

test('o dígito ainda não digitado fica apagado, e o digitado aceso', () => {
  const html = renderizarTela({ tipo: 'digitando', numeroDigitado: '1', numero: '13', votos: 0 });
  const spans = [...html.matchAll(/<span class="tela__digito([^"]*)">([^<]*)<\/span>/g)];
  assert.equal(spans.length, 2);
  assert.match(spans[0][1], /is-preenchido/);
  assert.equal(spans[0][2], '1');
  assert.ok(!spans[1][1].includes('is-preenchido'));
});

/*
 * A partir daqui, o que separa esta tela de um painel verde qualquer.
 *
 * A urna de verdade tem uma cara específica: uma faixa "SEU VOTO PARA" com
 * o cargo em disputa, o retrato do candidato ao lado do nome e do partido,
 * o número em corpo grande, e um rodapé dizendo qual tecla confirma. Era
 * isso que faltava — a tela mostrava "URNA 1 / 22 / 0 VOTOS", que não é a
 * urna brasileira, é um painel de aeroporto.
 */

test('a tela traz a faixa "SEU VOTO PARA" com o cargo em disputa', () => {
  const html = renderizarTela({
    tipo: 'ocioso', numero: '22', nome: 'URNA 1', votos: 0, cargo: 'PRESIDENTE',
  });
  assert.match(html, /SEU VOTO PARA/i);
  assert.match(html, /PRESIDENTE/);
});

test('a tela mostra o retrato, o nome e o partido do candidato', () => {
  const html = renderizarTela({
    tipo: 'ocioso', numero: '22', nome: 'URNA 1', votos: 0,
    candidato: { nome: 'Maria Silva', partido: 'PDB' },
  });
  assert.match(html, /tela__retrato/, 'falta o retrato do candidato');
  assert.match(html, /Maria Silva/);
  assert.match(html, /PDB/);
});

test('a tela cobra os mesmos campos que a urna de verdade cobra', () => {
  const html = renderizarTela({ tipo: 'ocioso', numero: '22', nome: 'U', votos: 0 });
  for (const rotulo of ['Nome', 'Partido']) {
    assert.match(html, new RegExp(rotulo, 'i'), `falta o campo ${rotulo}`);
  }
});

test('o retrato aceita uma foto de verdade quando o usuário puser uma', () => {
  // O desenho é o padrão, não a única opção: quem tem a foto do candidato
  // aponta para ela na configuração.
  const html = renderizarTela({
    tipo: 'ocioso', numero: '22', nome: 'U', votos: 0,
    candidato: { nome: 'A', partido: 'B', foto: '/fotos/ana.jpg' },
  });
  const img = html.match(/<img[^>]*>/)?.[0] ?? '';
  assert.match(img, /src="\/fotos\/ana\.jpg"/);
});

test('o endereço da foto é escapado, e não vira atributo novo', () => {
  // O caminho da foto vem da configuração do usuário e acaba dentro de um
  // atributo. Uma aspa solta ali dentro escreve o resto do elemento.
  const html = renderizarTela({
    tipo: 'ocioso', numero: '22', nome: 'U', votos: 0,
    candidato: { nome: 'A', partido: 'B', foto: '/x.jpg" onerror="alert(1)' },
  });
  assert.ok(!/onerror="alert/.test(html), 'a aspa da configuração virou atributo');
});

test('o número em disputa aparece em corpo grande, e não em letra miúda', () => {
  const html = renderizarTela({ tipo: 'ocioso', numero: '22', nome: 'U', votos: 0 });
  assert.match(html, /tela__numero\b/, 'o número perdeu o lugar de destaque');
});

test('o rodapé diz qual tecla confirma o voto', () => {
  const html = renderizarTela({ tipo: 'ocioso', numero: '22', nome: 'U', votos: 0 });
  assert.match(html, /VERDE/i);
  assert.match(html, /CONFIRMAR/i);
});

test('o visor instrui as duas teclas, como o da urna de verdade', () => {
  /*
   * O rodapé do visor da urna do TSE diz o que cada tecla faz, e só isso:
   * "VERDE para CONFIRMAR" e "LARANJA para REINICIAR". A tecla laranja é a
   * do CORRIGE, que na urna real recomeça o voto.
   */
  const html = renderizarTela({ tipo: 'ocioso', numero: '22', nome: 'U', votos: 7 });
  assert.match(html, /VERDE/i);
  assert.match(html, /CONFIRMAR/i);
  assert.match(html, /LARANJA/i);
  assert.match(html, /REINICIAR/i);
});

test('o visor não vira placar', () => {
  /*
   * A urna do TSE não mostra contagem nenhuma no visor — quem conta voto é
   * o painel, lá em cima. Um "7 VOTOS" aqui dentro é o detalhe que denuncia
   * a imitação, e é justamente o que a foto de referência não tem.
   */
  const html = renderizarTela({ tipo: 'ocioso', numero: '22', nome: 'U', votos: 7 });
  assert.ok(!/VOTOS/i.test(html), 'o visor virou placar');
});

/*
 * O candidato só existe no número dele.
 *
 * Enquanto a urna mostrava o candidato o tempo todo, digitar um número que
 * não é o dele deixava a foto, o nome e o partido na tela do mesmo jeito —
 * ou seja, a urna afirmava que o 99 é a Ana Prado. É a mesma família de
 * defeito do placar no visor: a tela dizendo uma coisa que não é verdade.
 *
 * A regra é o COMEÇO do número, e não o número inteiro: com "22" na urna,
 * digitar "2" mantém o candidato. Se a regra exigisse os dois dígitos, a
 * ficha sumiria no primeiro toque e voltaria no segundo — um piscar que
 * parece defeito. Assim ela só some quando o que foi digitado já não pode
 * mais virar o número do candidato.
 */

const CANDIDATO = { nome: 'Ana Prado', partido: 'PARTIDO A', foto: '/fotos/ana.jpg' };

test('número que não bate não mostra candidato nenhum', () => {
  const html = renderizarTela({
    tipo: 'digitando', numero: '22', numeroDigitado: '21', candidato: CANDIDATO,
  });
  assert.ok(!/Ana Prado/.test(html), 'a urna disse que o 21 é a Ana Prado');
  assert.ok(!/PARTIDO A/.test(html), 'a urna mostrou o partido dela para o número errado');
  assert.ok(!/<img/.test(html), 'a urna mostrou a foto dela para o número errado');
});

test('o número do candidato mantém a ficha, mesmo digitado pela metade', () => {
  for (const parcial of ['2', '22']) {
    const html = renderizarTela({
      tipo: 'digitando', numero: '22', numeroDigitado: parcial, candidato: CANDIDATO,
    });
    assert.match(html, /Ana Prado/, `a ficha sumiu com "${parcial}" digitado`);
    assert.match(html, /<img/, `a foto sumiu com "${parcial}" digitado`);
  }
});

test('o número grande fica na tela mesmo sem candidato', () => {
  /*
   * O eleitor está conferindo o que digitou — o número é a última coisa que
   * pode sumir. Limpar a tela inteira deixaria em branco justamente o
   * instante em que ela precisa dizer alguma coisa.
   */
  const html = renderizarTela({
    tipo: 'digitando', numero: '22', numeroDigitado: '99', candidato: CANDIDATO,
  });
  assert.match(html, /tela__digito/);
  assert.match(html, />9</);
});

test('sem candidato configurado, digitar o número certo não inventa um', () => {
  // O outro lado: a urna não pode desenhar um retrato nem um "—" de partido
  // para um candidato que ninguém cadastrou.
  const html = renderizarTela({ tipo: 'digitando', numero: '22', numeroDigitado: '22' });
  assert.ok(!/<img/.test(html), 'apareceu foto sem candidato configurado');
  assert.ok(!/Partido/.test(html), 'apareceu campo de partido sem candidato configurado');
});

test('ocioso continua mostrando o candidato, como antes', () => {
  // A regra vale para o momento da digitação. Em repouso, entre um eleitor e
  // outro, a urna mostra o candidato — é o que ela faz na vida real.
  const html = renderizarTela({
    tipo: 'ocioso', numero: '22', nome: 'URNA 1', votos: 0, candidato: CANDIDATO,
  });
  assert.match(html, /Ana Prado/);
  assert.match(html, /PARTIDO A/);
});
