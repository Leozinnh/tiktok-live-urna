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
