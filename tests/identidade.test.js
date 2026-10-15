import { test } from 'node:test';
import assert from 'node:assert/strict';
import { variaveisDeIdentidade, corParaRgba } from '../public/js/urna.js';

test('produz as variáveis CSS a partir da configuração da urna', () => {
  const v = variaveisDeIdentidade({ corPrimaria: '#1a5fd0', corSecundaria: '#0d3a8f' });
  assert.equal(v['--cor-urna'], '#1a5fd0');
  assert.equal(v['--cor-urna-2'], '#0d3a8f');
});

test('usa a cor primária como cor secundária quando a secundária falta', () => {
  const v = variaveisDeIdentidade({ corPrimaria: '#e02020' });
  assert.equal(v['--cor-urna-2'], '#e02020');
});

test('recusa cor inválida e cai no cinza padrão', () => {
  const v = variaveisDeIdentidade({ corPrimaria: 'javascript:alert(1)' });
  assert.equal(v['--cor-urna'], '#8a8f98');
});

test('converte a cor da urna para rgba translúcido', () => {
  assert.equal(corParaRgba('#1a5fd0', 0.55), 'rgba(26, 95, 208, 0.55)');
  assert.equal(corParaRgba('#fff', 1), 'rgba(255, 255, 255, 1)');
  assert.equal(corParaRgba('#000000', 0), 'rgba(0, 0, 0, 0)');
});

test('a identidade sobrevive a cores em qualquer notação hexadecimal', () => {
  // #abc e #aabbcc são a mesma cor; as duas precisam virar o mesmo rgba,
  // senão o halo de uma urna some e o da outra não.
  assert.equal(corParaRgba('#abc', 0.5), corParaRgba('#aabbcc', 0.5));
});

test('o LED das teclas numéricas assume a cor da urna', () => {
  // As teclas de ação mantêm verde e laranja por classe (a urna brasileira
  // é assim). O que muda por urna é o LED dos números.
  const v = variaveisDeIdentidade({ corPrimaria: '#e02020' });
  assert.equal(v['--tecla-led-cor'], '#e02020');
});
