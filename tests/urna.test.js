import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paraCoordenadasDoPalco } from '../public/js/urna.js';

test('converte rect do viewport para coordenadas do palco', () => {
  // Palco de 1080x1920 escalado a 0.5 e posicionado em (100, 50)
  const palcoRect = { left: 100, top: 50, width: 540, height: 960 };
  const rect = { left: 370, top: 530, width: 108, height: 96 };
  const r = paraCoordenadasDoPalco(rect, palcoRect);

  // (370-100)/0.5 = 540 ; (530-50)/0.5 = 960
  assert.equal(r.x, 540);
  assert.equal(r.y, 960);
  // 108/0.5 = 216 ; 96/0.5 = 192
  assert.equal(r.largura, 216);
  assert.equal(r.altura, 192);
});

test('o centro da tecla é o ponto que a mão mira', () => {
  const palcoRect = { left: 0, top: 0, width: 1080, height: 1920 };
  const rect = { left: 10, top: 20, width: 100, height: 80 };
  const r = paraCoordenadasDoPalco(rect, palcoRect);
  assert.deepEqual(r.centro, { x: 60, y: 60 });
});

test('a conversão é a inversa da escala do palco, em qualquer resolução', () => {
  // O OBS pode capturar em qualquer tamanho; a tecla medida tem de cair
  // sempre no mesmo ponto do palco, senão a mão erra a tecla ao vivo.
  for (const larguraPalco of [540, 1080, 1920, 405]) {
    const escala = larguraPalco / 1080;
    const palcoRect = { left: 37, top: 91, width: larguraPalco, height: 1920 * escala };
    // Um ponto que está a (270, 480) do palco, em pixels do viewport:
    const rect = {
      left: 37 + 270 * escala,
      top: 91 + 480 * escala,
      width: 100 * escala,
      height: 60 * escala,
    };
    const r = paraCoordenadasDoPalco(rect, palcoRect);
    assert.ok(Math.abs(r.x - 270) < 1e-9, `x errou em escala ${escala}`);
    assert.ok(Math.abs(r.y - 480) < 1e-9, `y errou em escala ${escala}`);
    assert.ok(Math.abs(r.largura - 100) < 1e-9, `largura errou em escala ${escala}`);
  }
});
