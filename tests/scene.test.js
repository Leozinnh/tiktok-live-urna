import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularEscala, PALCO } from '../public/js/scene.js';

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
