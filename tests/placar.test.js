import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularPlacar, renderizarPlacar, mudancaDeLideranca, ordemDosCartoes, textoDaFaixa } from '../public/js/placar.js';

const U1 = { id: 'u1', nome: 'URNA 1', numero: '22', votos: 61, cor: '#1a5fd0' };
const U2 = { id: 'u2', nome: 'URNA 2', numero: '13', votos: 48, cor: '#e02020' };

test('soma o total e calcula a fatia de cada urna', () => {
  const p = calcularPlacar([U1, U2]);
  assert.equal(p.total, 109);
  assert.equal(p.cartoes[0].votos, 61);
  assert.equal(p.cartoes[0].percentual, '56,0%');
  assert.equal(p.cartoes[1].percentual, '44,0%');
  assert.ok(Math.abs(p.cartoes[0].fracao - 61 / 109) < 1e-9);
});

test('o percentual sai com vírgula, que é como se escreve em português', () => {
  const p = calcularPlacar([{ ...U1, votos: 2 }, { ...U2, votos: 1 }]);
  // Com ponto, "66.7%" aparece no meio de um placar em português.
  assert.equal(p.cartoes[0].percentual, '66,7%');
  assert.ok(!p.cartoes[0].percentual.includes('.'));
});

test('aponta quem está na frente e por quantos votos', () => {
  const p = calcularPlacar([U1, U2]);
  assert.equal(p.lider, 'u1');
  assert.equal(p.cartoes[0].posicao, 'lider');
  assert.equal(p.cartoes[0].diferenca, 13, 'o líder mostra a distância até o segundo');
  assert.equal(p.cartoes[1].posicao, 'atras');
  assert.equal(p.cartoes[1].diferenca, 13, 'quem está atrás mostra a mesma distância');
});

test('empate não elege ninguém como líder', () => {
  const p = calcularPlacar([{ ...U1, votos: 7 }, { ...U2, votos: 7 }]);
  assert.equal(p.lider, null);
  for (const c of p.cartoes) {
    assert.equal(c.posicao, 'empate');
    assert.equal(c.diferenca, 0);
  }
});

test('placar zerado não divide por zero nem inventa líder', () => {
  // O estado em que a cena passa a maior parte do tempo é este: nenhum voto.
  const p = calcularPlacar([{ ...U1, votos: 0 }, { ...U2, votos: 0 }]);
  assert.equal(p.total, 0);
  assert.equal(p.lider, null);
  for (const c of p.cartoes) {
    assert.equal(c.fracao, 0);
    assert.equal(c.percentual, '0,0%');
    assert.ok(Number.isFinite(c.fracao), 'fração virou NaN');
  }
});

test('com três urnas quem está na frente se mede contra o segundo colocado', () => {
  // Com duas urnas "à frente do segundo" e "à frente de todos" são a mesma
  // coisa, e a conta errada passa despercebida. Com três, não.
  const p = calcularPlacar([
    { ...U1, votos: 50 },
    { ...U2, votos: 30 },
    { id: 'u3', nome: 'URNA 3', numero: '45', votos: 20, cor: '#22a04a' },
  ]);
  assert.equal(p.lider, 'u1');
  assert.equal(p.cartoes[0].diferenca, 20, 'a distância é até o segundo, não até o último');
  assert.equal(p.cartoes[2].diferenca, 30, 'quem está atrás se mede contra o líder');
});

test('a barra de cada urna usa a fatia do total, não a fatia do líder', () => {
  const p = calcularPlacar([U1, U2]);
  assert.equal(p.cartoes[1].fracaoBarra, 48 / 109);
});

test('o placar mostra número, contagem e percentual de cada urna', () => {
  const html = renderizarPlacar(calcularPlacar([U1, U2]));
  assert.match(html, /22/);
  assert.match(html, /61/);
  assert.match(html, /56,0%/);
  assert.match(html, /13/);
  assert.match(html, /48/);
  assert.match(html, /44,0%/);
});

test('o placar diz quem está à frente e quem está atrás, em palavras', () => {
  const html = renderizarPlacar(calcularPlacar([U1, U2]));
  assert.match(html, /13 à frente/);
  assert.match(html, /13 atrás/);
});

test('empate e placar zerado não anunciam ninguém à frente', () => {
  const empatado = renderizarPlacar(calcularPlacar([{ ...U1, votos: 5 }, { ...U2, votos: 5 }]));
  assert.ok(!/à frente/.test(empatado), 'empate anunciou alguém na frente');
  assert.match(empatado, /empatad/i);

  const zerado = renderizarPlacar(calcularPlacar([{ ...U1, votos: 0 }, { ...U2, votos: 0 }]));
  assert.ok(!/à frente/.test(zerado), 'placar zerado anunciou alguém na frente');
});

test('o nome da urna vem da configuração e é escapado', () => {
  const html = renderizarPlacar(calcularPlacar([
    { ...U1, nome: '<img src=x onerror=alert(1)>' }, U2,
  ]));
  assert.ok(!html.includes('<img'), 'o nome da urna entrou cru no HTML');
  assert.match(html, /&lt;img/);
});

test('o placar não inventa um número de espectadores', () => {
  // Não há integração com a TikTok ainda. Escrever "13 ESPECTADORES" aqui
  // seria apresentar um número simulado como se fosse da live.
  const semNinguem = renderizarPlacar(calcularPlacar([U1, U2]));
  assert.ok(!/espectador/i.test(semNinguem), 'o placar mostrou espectadores que ninguém informou');

  // Quando a Etapa 7 trouxer o número real, ele aparece.
  const comGente = renderizarPlacar(calcularPlacar([U1, U2], { espectadores: 13 }));
  assert.match(comGente, /13/);
  assert.match(comGente, /espectador/i);
});

test('o total de votos aparece em destaque', () => {
  const html = renderizarPlacar(calcularPlacar([U1, U2]));
  assert.match(html, /109/);
  assert.match(html, /total/i);
});

test('o selo "na frente" sai só no cartão de quem lidera', () => {
  /*
   * O selo é a resposta que o olho pega antes de ler qualquer número. Se
   * ele aparecesse nos dois cartões, não responderia nada; se sumisse do
   * cartão do líder, o placar voltaria a exigir a comparação mental de
   * "61 contra 48" para saber quem está ganhando.
   */
  const html = renderizarPlacar(calcularPlacar([U1, U2]));
  const selos = [...html.matchAll(/class="cartao__selo"/g)];
  assert.equal(selos.length, 1, 'o selo precisa aparecer exatamente uma vez');

  // E ele está dentro do cartão do líder, que é o u1.
  const cartaoLider = html.slice(html.indexOf('data-urna="u1"'));
  assert.match(cartaoLider.slice(0, cartaoLider.indexOf('</article>')), /cartao__selo/,
    'o selo ficou no cartão de quem está atrás');

  const empatado = renderizarPlacar(calcularPlacar([{ ...U1, votos: 5 }, { ...U2, votos: 5 }]));
  assert.ok(!/cartao__selo/.test(empatado), 'num empate ninguém está na frente');
});

// ---- A ultrapassagem --------------------------------------------------

const comVotos = (a, b) => calcularPlacar([{ ...U1, votos: a }, { ...U2, votos: b }]);

test('quem passa na frente provoca uma virada de liderança', () => {
  const m = mudancaDeLideranca(comVotos(61, 48), comVotos(61, 62));
  assert.equal(m.tipo, 'lideranca');
  assert.equal(m.de, 'u1');
  assert.equal(m.para, 'u2');
});

test('o primeiro voto da rodada NÃO é uma ultrapassagem', () => {
  /*
   * Antes do primeiro voto não havia disputa nenhuma, então ninguém foi
   * ultrapassado. Anunciar "URNA 1 ASSUMIU A LIDERANÇA!" com um voto a zero
   * é o mesmo que gritar em cima do silêncio: a faixa que existe para marcar
   * o momento mais importante da disputa apareceria no momento mais vazio.
   */
  const m = mudancaDeLideranca(comVotos(0, 0), comVotos(1, 0));
  assert.equal(m.tipo, 'nada');
});

test('sem mudança de líder não há nada a anunciar', () => {
  assert.equal(mudancaDeLideranca(comVotos(61, 48), comVotos(62, 48)).tipo, 'nada');
  assert.equal(mudancaDeLideranca(comVotos(61, 48), comVotos(61, 48)).tipo, 'nada');
});

test('quem empata tira a liderança do outro e isso é um empate, não uma virada', () => {
  const m = mudancaDeLideranca(comVotos(61, 48), comVotos(61, 61));
  assert.equal(m.tipo, 'empate');
  assert.equal(m.de, 'u1');
  assert.equal(m.para, null);
});

test('zerar a rodada não é empate', () => {
  // Reiniciar o placar também deixa todo mundo igual, mas não há empate
  // nenhum na disputa: há uma disputa nova. A diferença é o total.
  assert.equal(mudancaDeLideranca(comVotos(61, 48), comVotos(0, 0)).tipo, 'nada');
});

test('desempatar é assumir a liderança', () => {
  // Dois empatados e um passa na frente: é o momento em que a liderança
  // deixa de ser dividida, e vale o mesmo anúncio.
  const m = mudancaDeLideranca(comVotos(61, 61), comVotos(61, 62));
  assert.equal(m.tipo, 'lideranca');
  assert.equal(m.para, 'u2');
});

test('a primeira medição não anuncia nada', () => {
  // `null` é "não havia placar antes", que é diferente de "o placar estava
  // zerado": o primeiro desenho da tela não pode sair gritando.
  assert.equal(mudancaDeLideranca(null, comVotos(61, 48)).tipo, 'nada');
});

test('a ordem dos cartões põe quem lidera à esquerda', () => {
  assert.deepEqual(ordemDosCartoes(comVotos(48, 61)), ['u2', 'u1']);
  assert.deepEqual(ordemDosCartoes(comVotos(61, 48)), ['u1', 'u2']);
});

test('empatados mantêm a ordem da configuração', () => {
  // Num empate não há primeiro lugar para mover para a esquerda, e trocar
  // os dois de lugar assim mesmo seria um tranco sem significado.
  assert.deepEqual(ordemDosCartoes(comVotos(50, 50)), ['u1', 'u2']);
  assert.deepEqual(ordemDosCartoes(comVotos(0, 0)), ['u1', 'u2']);
});

test('cada cartão carrega o seu lugar na disputa', () => {
  const p = comVotos(61, 48);
  assert.equal(p.cartoes.find((c) => c.id === 'u1').lugar, 1);
  assert.equal(p.cartoes.find((c) => c.id === 'u2').lugar, 2);
});

test('num empate os dois são o primeiro lugar', () => {
  const p = comVotos(50, 50);
  assert.equal(p.cartoes.find((c) => c.id === 'u1').lugar, 1);
  assert.equal(p.cartoes.find((c) => c.id === 'u2').lugar, 1);
});

test('o lugar aparece escrito no cartão', () => {
  const html = renderizarPlacar(comVotos(61, 48));
  assert.match(html, /cartao__lugar">1º</);
  assert.match(html, /cartao__lugar">2º</);
});

// ---- A faixa, que é onde o momento vira palavra ------------------------

const CARTAO_U1 = { id: 'u1', nome: 'URNA 1', numero: '22', cor: '#1a5fd0' };
const CARTAO_U2 = { id: 'u2', nome: 'URNA 2', numero: '13', cor: '#e02020' };

test('sem ninguém na frente a faixa não anuncia ninguém', () => {
  const f = textoDaFaixa(comVotos(0, 0));
  assert.equal(f.vazio, true);
  assert.equal(f.cor, null);
});

test('com um líder, a faixa diz quem está na frente e na cor dele', () => {
  const f = textoDaFaixa(comVotos(61, 48));
  assert.equal(f.texto, '22 À FRENTE');
  assert.equal(f.cor, '#1a5fd0');
});

test('empatados NÃO é a mesma coisa que sem votos', () => {
  /*
   * Defeito que já estava na tela: 5 a 5 tem `lider: null`, e a faixa caía no
   * mesmo caso do placar zerado — anunciava "sem votos ainda" com dez votos
   * apurados e os dois cartões cheios logo abaixo. A faixa é o primeiro lugar
   * onde o olho procura o estado da disputa, e era o único que mentia.
   */
  const f = textoDaFaixa(comVotos(5, 5));
  assert.equal(f.vazio, false);
  assert.match(f.texto, /EMPATE/);
  assert.equal(f.cor, null, 'num empate não há cor de ninguém para vestir');
});

test('a ultrapassagem troca o texto da faixa pela mensagem da spec', () => {
  const f = textoDaFaixa(comVotos(61, 62), {
    aviso: { tipo: 'lideranca', cartao: CARTAO_U2 },
  });
  assert.equal(f.texto, 'URNA 2 ASSUMIU A LIDERANÇA!');
  assert.equal(f.cor, '#e02020');
});

test('o aviso de empate tem texto próprio', () => {
  const f = textoDaFaixa(comVotos(61, 61), { aviso: { tipo: 'empate' } });
  assert.equal(f.texto, 'EMPATE NA DISPUTA!');
});

test('as mensagens são configuráveis, com o nome da urna no lugar do marcador', () => {
  // O `{urna}` sai do arquivo de configuração e vira o NOME da urna — "URNA
  // 2" e não "13". Quem lê a faixa de longe precisa saber QUAL urna virou,
  // e o número é o que o espectador digita, não o que ele chama a urna.
  const f = textoDaFaixa(comVotos(61, 62), {
    aviso: { tipo: 'lideranca', cartao: CARTAO_U2 },
    modelos: { mensagemLideranca: '{urna} VIROU!', mensagemEmpate: 'X' },
  });
  assert.equal(f.texto, 'URNA 2 VIROU!');
});

test('o marcador {numero} também funciona, para quem preferir', () => {
  const f = textoDaFaixa(comVotos(61, 62), {
    aviso: { tipo: 'lideranca', cartao: CARTAO_U2 },
    modelos: { mensagemLideranca: 'O {numero} PASSOU!' },
  });
  assert.equal(f.texto, 'O 13 PASSOU!');
});

test('uma mensagem sem marcador nenhum sai como está', () => {
  const f = textoDaFaixa(comVotos(61, 62), {
    aviso: { tipo: 'lideranca', cartao: CARTAO_U2 },
    modelos: { mensagemLideranca: 'VIROU!' },
  });
  assert.equal(f.texto, 'VIROU!');
});

test('o aviso manda no texto, mas o desenho continua sendo o do placar', () => {
  // Enquanto o aviso está no ar, `renderizarPlacar` precisa usar o texto
  // dele e não o "À FRENTE" de sempre — senão a mensagem existe só no
  // objeto e nunca chega à tela.
  const p = comVotos(61, 62);
  const comAviso = renderizarPlacar(p, { aviso: { tipo: 'lideranca', cartao: CARTAO_U2 } });
  assert.match(comAviso, /URNA 2 ASSUMIU A LIDERANÇA!/);
  assert.doesNotMatch(comAviso, /13 À FRENTE/);
});

test('o empate também chega ao desenho', () => {
  const html = renderizarPlacar(comVotos(5, 5));
  assert.match(html, /EMPATE NA DISPUTA!/);
  assert.doesNotMatch(html, /sem votos ainda/);
});
