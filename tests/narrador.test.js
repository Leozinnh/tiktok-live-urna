import { test } from 'node:test';
import assert from 'node:assert/strict';
import { falaDoServidor, TIPOS_DA_FAIXA, LIMITE_DO_TEXTO } from '../public/js/narrador.js';

/*
 * A fala que chega do servidor, antes de virar desenho.
 *
 * Esta função é pura de propósito, e existe por um motivo concreto: o que ela
 * devolve é escrito na tela que o OBS está capturando. O texto vem do apelido
 * de quem chegou — e apelido é o campo mais livre que existe numa rede social.
 * A faixa não pode ser o lugar onde esse texto ganha poder.
 *
 * O desenho em si é conferido no navegador, pela sonda. Aqui fica a decisão.
 */

const fala = (extra = {}) => ({
  texto: 'Ana acabou de seguir!',
  wav: '/voz/a1b2c3d4e5f60718.wav',
  tipo: 'seguidor',
  usuario: 'Ana',
  em: 7000,
  ...extra,
});

test('a fala do servidor vira o que a faixa precisa desenhar', () => {
  const f = falaDoServidor(fala());
  assert.equal(f.texto, 'Ana acabou de seguir!');
  assert.equal(f.wav, '/voz/a1b2c3d4e5f60718.wav');
  assert.equal(f.tipo, 'seguidor');
  assert.equal(f.usuario, 'Ana');
});

test('a fala sem texto não vira faixa', () => {
  // O servidor nunca manda isto — o narrador devolve `null` em vez de uma
  // fala vazia. Mas uma faixa em branco piscando na transmissão é pior do que
  // nenhuma, e a guarda custa uma linha.
  assert.equal(falaDoServidor(null), null);
  assert.equal(falaDoServidor(undefined), null);
  assert.equal(falaDoServidor('texto solto'), null);
  assert.equal(falaDoServidor({ tipo: 'seguidor' }), null);
  assert.equal(falaDoServidor({ texto: '   ' }), null);
});

test('o áudio só é pedido do endereço que o servidor serve', () => {
  /*
   * O `wav` é a única coisa aqui que faz a página BUSCAR algo. Um endereço
   * que não seja a rota da voz faria a tela da live pedir a um servidor de
   * fora — e a transmissão ficaria dependendo da rede de terceiros para
   * mostrar um nome. Recusar não perde a faixa: ela aparece sem som.
   */
  for (const ruim of [
    'http://outro.site/x.wav',
    '//outro.site/x.wav',
    '/voz/A1B2C3D4E5F60718.wav',
    '/voz/curto.wav',
    '/voz/a1b2c3d4e5f60718.mp3',
    '/voz/../../server/hub.js',
    'javascript:alert(1)',
  ]) {
    assert.equal(falaDoServidor(fala({ wav: ruim })).wav, null, `${ruim} não podia passar`);
  }
  // E o que o servidor manda de verdade continua passando.
  assert.equal(falaDoServidor(fala()).wav, '/voz/a1b2c3d4e5f60718.wav');
  // Sem áudio é o caso normal — o sintetizador cai, a voz está desligada.
  assert.equal(falaDoServidor(fala({ wav: null })).wav, null);
});

test('o tipo vira o nome de uma classe, e só dos tipos conhecidos', () => {
  /*
   * O tipo sai daqui direto para o `classList` da faixa, que é quem dá a cor
   * de cada aviso. Um texto livre ali não é só feiúra: é o visitante
   * escolhendo o nome de uma classe do projeto.
   */
  assert.deepEqual([...TIPOS_DA_FAIXA].sort(), ['assinatura', 'compartilhou', 'curtida', 'entrada', 'seguidor']);
  assert.equal(falaDoServidor(fala({ tipo: 'curtida' })).tipo, 'curtida');
  for (const ruim of ['<script>', 'seguidor destaque', '', null, 7, 'presente']) {
    assert.equal(falaDoServidor(fala({ tipo: ruim })).tipo, 'social', `"${ruim}" virou classe`);
  }
});

test('o nome de quem chegou é aparado, e não cresce sem fim', () => {
  /*
   * O apelido do TikTok vai a dezenas de caracteres e a faixa tem a largura
   * do palco. Sem limite, um nome comprido empurraria a frase para fora da
   * tela no meio da transmissão — e o texto sairia cortado pela borda, que é
   * pior do que cortado com reticências.
   */
  assert.equal(falaDoServidor(fala({ texto: '  oi  ' })).texto, 'oi');

  const enorme = 'x'.repeat(LIMITE_DO_TEXTO + 50);
  const f = falaDoServidor(fala({ texto: enorme }));
  assert.equal(f.texto.length, LIMITE_DO_TEXTO);
  assert.ok(f.texto.endsWith('…'), 'o corte precisa avisar que cortou');
});

test('o usuário também é texto, e some quando não vem', () => {
  assert.equal(falaDoServidor(fala({ usuario: '  Bia  ' })).usuario, 'Bia');
  assert.equal(falaDoServidor(fala({ usuario: null })).usuario, '');
  assert.equal(falaDoServidor(fala({ usuario: 42 })).usuario, '42');
});
