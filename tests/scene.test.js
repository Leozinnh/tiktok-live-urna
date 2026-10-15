import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularEscala, escalaDaCena, escalaPedida, PALCO } from '../public/js/scene.js';

test('o palco é desenhado em 1080x1920', () => {
  assert.deepEqual(PALCO, { largura: 1080, altura: 1920 });
});

test('janela mais larga que o palco é limitada pela altura', () => {
  // 1920x1080 é 16:9; o palco é 9:16. Sobra largura, falta altura.
  assert.equal(calcularEscala(1920, 1080), 1080 / 1920);
});

test('janela exatamente 1080x1920 fica em escala 1', () => {
  assert.equal(calcularEscala(1080, 1920), 1);
});

test('janela mais alta que o palco é limitada pela largura', () => {
  // 500x1200: a altura sobra, a largura limita.
  assert.equal(calcularEscala(500, 1200), 500 / 1080);
});

test('o palco escalado cabe sempre dentro da janela, sem sobra', () => {
  const casos = [
    [1920, 1080], [1080, 1920], [1280, 720], [2560, 1440],
    [800, 600], [3840, 2160], [500, 1200], [1, 1],
  ];
  for (const [w, h] of casos) {
    const e = calcularEscala(w, h);
    assert.ok(PALCO.largura * e <= w + 1e-9, `sobra largura em ${w}x${h}`);
    assert.ok(PALCO.altura * e <= h + 1e-9, `sobra altura em ${w}x${h}`);
  }
});

test('a escala encosta na borda — não deixa faixa morta', () => {
  for (const [w, h] of [[1920, 1080], [500, 1200], [1080, 1920]]) {
    const e = calcularEscala(w, h);
    const encosta = Math.abs(PALCO.largura * e - w) < 1e-9
      || Math.abs(PALCO.altura * e - h) < 1e-9;
    assert.ok(encosta, `nao encostou em nenhuma borda em ${w}x${h}`);
  }
});

/*
 * `?zoom=1` é o modo de conferência: desenha o palco no tamanho real para
 * quem está no notebook conseguir ler o que a transmissão mostra. Ele é
 * lido da barra de endereços, e é por isso que a leitura é uma função
 * separada — uma função pura dá para testar; `location.search` não.
 */
test('sem parâmetro nenhum, a escala continua vindo da janela', () => {
  assert.equal(escalaPedida(''), null);
  assert.equal(escalaPedida('?outra=coisa'), null);
});

test('?zoom=1 desenha o palco no tamanho real', () => {
  assert.equal(escalaPedida('?zoom=1'), 1);
});

test('?zoom aceita outros tamanhos, para conferir de perto sem exagero', () => {
  assert.equal(escalaPedida('?zoom=0.5'), 0.5);
  assert.equal(escalaPedida('?zoom=2'), 2);
});

test('com o zoom de conferência ligado, a janela deixa de mandar', () => {
  /*
   * Numa janela deitada o palco cai para 0,38 e o texto miúdo da urna vira
   * borrão — é o que se vê ao abrir a página no notebook. O modo de
   * conferência ignora a janela e desenha no tamanho real; a página passa a
   * rolar em vez de encolher.
   */
  const janela = { larguraJanela: 1536, alturaJanela: 730 };

  assert.equal(escalaDaCena({ ...janela, ligado: true, pedida: null }), 1,
    'ligado e sem zoom pedido, a escala é a do tamanho real');
  assert.equal(escalaDaCena({ ...janela, ligado: true, pedida: 0.5 }), 0.5,
    'o zoom do endereço continua valendo quando informado');
  assert.equal(escalaDaCena({ ...janela, ligado: false, pedida: null }),
    calcularEscala(1536, 730),
    'desligado, a escala volta a ser a da janela');
});

test('um zoom inválido não some com a cena', () => {
  // Sem esta guarda, "?zoom=abc" viraria NaN, a escala viraria "NaN" e o
  // palco sumiria da tela — com a live no ar.
  for (const ruim of ['?zoom=abc', '?zoom=0', '?zoom=-2', '?zoom=']) {
    assert.equal(escalaPedida(ruim), null, `"${ruim}" devia cair no ajuste automático`);
  }
});
