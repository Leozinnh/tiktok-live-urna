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
    // Formato que o servidor não escreve. A lista é fechada nos dois formatos
    // que os dois sintetizadores produzem — um `.ogg` aqui é um pedido que
    // ninguém fez, e é a lista fechada que impede um caminho de passar.
    '/voz/a1b2c3d4e5f60718.ogg',
    '/voz/a1b2c3d4e5f60718.mp3.wav',
    '/voz/../../server/hub.js',
    'javascript:alert(1)',
  ]) {
    assert.equal(falaDoServidor(fala({ wav: ruim })).wav, null, `${ruim} não podia passar`);
  }
  // E o que o servidor manda de verdade continua passando — nos DOIS formatos,
  // porque são dois sintetizadores: o `.wav` da voz do Windows e o `.mp3` da
  // neural. Recusar o segundo deixaria a live muda com a voz nova ligada.
  assert.equal(falaDoServidor(fala()).wav, '/voz/a1b2c3d4e5f60718.wav');
  assert.equal(falaDoServidor(fala({ wav: '/voz/a1b2c3d4e5f60718.mp3' })).wav,
    '/voz/a1b2c3d4e5f60718.mp3');
  // Sem áudio é o caso normal — o sintetizador cai, a voz está desligada.
  assert.equal(falaDoServidor(fala({ wav: null })).wav, null);
});

test('o tipo vira o nome de uma classe, e só dos tipos conhecidos', () => {
  /*
   * O tipo sai daqui direto para o `classList` da faixa, que é quem dá a cor
   * de cada aviso. Um texto livre ali não é só feiúra: é o visitante
   * escolhendo o nome de uma classe do projeto.
   */
  assert.deepEqual([...TIPOS_DA_FAIXA].sort(),
    ['assinatura', 'compartilhou', 'curtida', 'entrada', 'presente', 'seguidor']);
  assert.equal(falaDoServidor(fala({ tipo: 'curtida' })).tipo, 'curtida');
  /*
   * O PRESENTE entrou nesta lista em 2026-10-15, e o motivo não é estético.
   *
   * Ele não estava aqui, então caía na classe neutra — e o Leonardo viu o
   * aviso de uma Rosa sair cinza, no meio de uma live, com a mesma cara de
   * "alguém entrou". O aviso que ele PAGA para acontecer era o mais apagado
   * da tela. Um tipo sem estilo próprio não dá erro: só fica sem graça.
   */
  assert.equal(falaDoServidor(fala({ tipo: 'presente' })).tipo, 'presente');
  for (const ruim of ['<script>', 'seguidor destaque', '', null, 7, 'Presente']) {
    assert.equal(falaDoServidor(fala({ tipo: ruim })).tipo, 'social', `"${ruim}" virou classe`);
  }
});

test('o desenho do presente é um nome de arquivo, e não um caminho', () => {
  /*
   * A faixa do presente mostra o desenho do presente que chegou — a rosa, o
   * coração —, e é o que faz o aviso que a pessoa PAGOU ser reconhecido de
   * longe: o Leonardo olhou a faixa de presente e disse que estava "muito
   * simples e pouco chamativo".
   *
   * Como o `wav`, este campo faz a página BUSCAR alguma coisa, e por isso ele
   * passa pela mesma peneira: só o nome de um arquivo de `public/img/`, sem
   * extensão, sem barra, sem ponto. Um caminho de verdade aqui seria a tela da
   * live buscando em qualquer lugar do projeto — e o valor vem de um arquivo
   * de configuração que é editado à mão, onde um dedo escorregado é normal.
   */
  assert.equal(falaDoServidor(fala({ tipo: 'presente', desenho: 'rose' })).desenho, 'rose');
  assert.equal(falaDoServidor(fala({ tipo: 'presente', desenho: 'heart_me' })).desenho, 'heart_me');
  for (const ruim of [
    '../../server/hub', 'server/hub', 'rose.webp', 'ROSE', 'rosa ', 'rosa/../x',
    '/img/rose', 'a'.repeat(41), '', null, undefined,
  ]) {
    assert.equal(falaDoServidor(fala({ tipo: 'presente', desenho: ruim })).desenho, null,
      `"${ruim}" não podia virar endereço de imagem`);
  }
  /*
   * A regra é sobre a FORMA do nome, e não sobre o tipo do campo no JSON: um
   * número vira texto, como o `wav` e como todo campo desta mensagem. Recusar
   * por tipo seria uma checagem a mais para o mesmo resultado — o arquivo
   * `42.webp` existiria ou não, e quem decide isso é o `onerror` da figura.
   */
  assert.equal(falaDoServidor(fala({ tipo: 'presente', desenho: 42 })).desenho, '42');
  // Sem desenho é o caso normal: a vitrine de hoje tem dois presentes e o
  // arquivo do Leonardo não diz desenho nenhum. A faixa dourada continua
  // inteira, sem imagem.
  assert.equal(falaDoServidor(fala({ tipo: 'presente' })).desenho, null);
});

test('só o aviso de presente carrega desenho', () => {
  /*
   * O desenho é do PRESENTE, e o resto da faixa não tem o que desenhar: um
   * seguidor não manda rosa, e uma curtida não tem figura. Aceitar o campo em
   * qualquer tipo deixaria a porta aberta para uma imagem entrar num aviso
   * onde ela não significa nada — e o dia em que isso acontecesse, ninguém
   * estaria olhando para cá.
   */
  assert.equal(falaDoServidor(fala({ tipo: 'seguidor', desenho: 'rose' })).desenho, null);
  assert.equal(falaDoServidor(fala({ tipo: 'curtida', desenho: 'rose' })).desenho, null);
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
