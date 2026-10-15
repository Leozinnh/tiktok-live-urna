/*
 * O painel é uma tela de formulário, e formulário é onde a edição some.
 *
 * A operação inteira do painel é uma ida e volta: a configuração vira campos,
 * o operador mexe, e os campos viram um remendo que volta para o servidor.
 * Cada uma das duas pontas dessa volta é pura e está testada aqui, porque o
 * defeito que este arquivo existe para prender não aparece em lugar nenhum —
 * ele é o campo que o operador editou e o remendo não levou.
 *
 * É um defeito silencioso de um jeito cruel: a tela mostra o valor novo, o
 * painel diz "salvo", e a live continua com o antigo. Só se descobre pela
 * ausência do efeito, no meio da transmissão.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  escapar, valorEm, montarCampos, patchDe, pendenciasDe,
} from '../public/js/admin/campos.js';

/* ------------------------------------------------------------- fugir do HTML */

test('o valor do operador não vira marcação', () => {
  // O nome do candidato é digitado à mão e vai para dentro de um atributo.
  // Sem escapar, um `<` derruba o campo e um `"` fecha o atributo no meio.
  assert.equal(escapar('Ana & "Prado" <b>'),
    'Ana &amp; &quot;Prado&quot; &lt;b&gt;');
});

test('escapar não estraga acento', () => {
  // A tela toda é em português, e entidade para acento é o jeito mais fácil
  // de o operador ver "DEPUTADO FEDERAL" escrito errado.
  assert.equal(escapar('DEPUTADO FEDERAL — Ação'), 'DEPUTADO FEDERAL — Ação');
});

/* ------------------------------------------------------ ler a configuração */

test('valorEm desce o caminho e devolve o que está lá', () => {
  const cfg = { urnas: { u1: { numero: '22' } }, presentes: [{ nome: 'Rosa' }] };
  assert.equal(valorEm(cfg, 'urnas.u1.numero'), '22');
  assert.equal(valorEm(cfg, 'presentes.0.nome'), 'Rosa');
});

test('valorEm devolve indefinido em vez de explodir no caminho que não existe', () => {
  /*
   * A configuração do operador é parcial: ele edita só a aba que mexeu, e o
   * que ele nunca tocou chega do padrão. Um caminho ausente é o caso normal,
   * não o excepcional — e uma exceção aqui derrubaria a aba inteira por causa
   * de um campo que nem existe.
   */
  assert.equal(valorEm({}, 'urnas.u1.numero'), undefined);
  assert.equal(valorEm({ urnas: {} }, 'urnas.u1.numero'), undefined);
  assert.equal(valorEm(null, 'urnas.u1.numero'), undefined);
});

/* ----------------------------------------------------- montar os campos */

const DEFS = [
  { caminho: 'urnas.u1.numero', rotulo: 'Número', tipo: 'texto' },
  { caminho: 'urnas.u1.ordem', rotulo: 'Ordem', tipo: 'numero', min: 0, max: 99 },
  { caminho: 'urnas.u1.corPrimaria', rotulo: 'Cor', tipo: 'cor' },
  { caminho: 'urnas.u1.ativo', rotulo: 'Ativa', tipo: 'booleano' },
  {
    caminho: 'integracao.modo', rotulo: 'Modo', tipo: 'selecao',
    opcoes: [{ valor: 'simulador', rotulo: 'Simulador' }, { valor: 'tiktok', rotulo: 'TikTok' }],
  },
];

test('cada campo carrega o caminho que ele governa', () => {
  /*
   * O `data-campo` é o CONTRATO entre as duas pontas: é por ele que a volta
   * sabe a que lugar da configuração cada valor pertence. Um campo sem ele é
   * um campo que o operador edita e o remendo não leva.
   */
  const html = montarCampos(DEFS, { urnas: { u1: { numero: '22' } }, integracao: { modo: 'tiktok' } });
  for (const d of DEFS) {
    assert.ok(html.includes(`data-campo="${d.caminho}"`), `sem gancho: ${d.caminho}`);
  }
});

test('o campo aberto já vem com o valor que está valendo', () => {
  const html = montarCampos(DEFS, {
    urnas: { u1: { numero: '22', ordem: 3, corPrimaria: '#1a5fd0' } },
    integracao: { modo: 'tiktok' },
  });
  assert.match(html, /data-campo="urnas\.u1\.numero"[^>]*value="22"/);
  assert.match(html, /data-campo="urnas\.u1\.ordem"[^>]*value="3"/);
  assert.match(html, /data-campo="urnas\.u1\.corPrimaria"[^>]*value="#1a5fd0"/);
});

test('o que o operador digitou entra no campo como texto, e não como HTML', () => {
  const html = montarCampos([{ caminho: 'a.nome', rotulo: 'Nome', tipo: 'texto' }],
    { a: { nome: '"><script>alert(1)</script>' } });
  assert.ok(!html.includes('<script'), `o valor virou marcação: ${html}`);
  assert.match(html, /value="&quot;&gt;&lt;script&gt;/);
});

test('o interruptor nasce ligado ou desligado, e não sempre igual', () => {
  // Um checkbox que não reflete o estado é pior do que nenhum: o operador
  // clica para desligar o que já estava desligado e salva o contrário.
  const ligado = montarCampos(DEFS, { urnas: { u1: { ativo: true } } });
  const desligado = montarCampos(DEFS, { urnas: { u1: { ativo: false } } });
  // A marcação inteira do campo, para a asserção ser sobre ESTAR MARCADO e
  // não sobre a ordem em que os atributos saíram.
  const caixa = (html) => html.match(/<input[^>]*data-campo="urnas\.u1\.ativo"[^>]*>/)[0];
  assert.match(caixa(ligado), /\bchecked\b/);
  assert.doesNotMatch(caixa(desligado), /\bchecked\b/);
});

test('o seletor marca a opção que está valendo', () => {
  const html = montarCampos(DEFS, { integracao: { modo: 'tiktok' } });
  assert.match(html, /<option value="tiktok"[^>]*selected/);
  assert.ok(!/<option value="simulador"[^>]*selected/.test(html),
    'as duas opções ficaram marcadas');
});

test('o rótulo aparece na tela, e não só no código', () => {
  const html = montarCampos(DEFS, {});
  for (const d of DEFS) assert.ok(html.includes(d.rotulo), `sem rótulo: ${d.rotulo}`);
});

/* -------------------------------------------------- a volta: campos → remendo */

test('a volta monta o remendo no formato da configuração', () => {
  /*
   * O remendo é o que o servidor recebe em `config.update`. Ele precisa ter a
   * MESMA forma da configuração, porque quem aplica é o `mesclar` recursivo —
   * um remendo plano seria aceito sem erro e não mudaria nada.
   */
  const patch = patchDe(DEFS, {
    'urnas.u1.numero': '13',
    'urnas.u1.ordem': '7',
    'urnas.u1.corPrimaria': '#e02020',
    'urnas.u1.ativo': false,
    'integracao.modo': 'tiktok',
  });
  assert.deepEqual(patch, {
    urnas: { u1: { numero: '13', ordem: 7, corPrimaria: '#e02020', ativo: false } },
    integracao: { modo: 'tiktok' },
  });
});

test('a volta acerta o tipo pelo campo, e não pelo que o DOM devolveu', () => {
  /*
   * O DOM só sabe devolver texto. Se o número subisse como string, o
   * `duracaoSegundos` chegaria "300" no servidor, a checagem de número
   * falharia, e a configuração cairia no padrão SEM aviso — o operador salva
   * 600 segundos e a rodada continua de 300.
   */
  const patch = patchDe(DEFS, { 'urnas.u1.ordem': '7' });
  assert.equal(typeof patch.urnas.u1.ordem, 'number');
});

test('índice numérico vira lista, porque lista se manda inteira', () => {
  /*
   * O `mesclar` SUBSTITUI listas, não remenda por índice — é decisão
   * registrada no server/config.js. Então um remendo com um presente só
   * apagaria os outros. Quem monta os campos de uma lista monta a lista
   * inteira, e a volta precisa devolver lista, e não um objeto de chaves.
   */
  const patch = patchDe(
    [{ caminho: 'presentes.0.nome', rotulo: 'Nome', tipo: 'texto' },
      { caminho: 'presentes.1.nome', rotulo: 'Nome', tipo: 'texto' }],
    { 'presentes.0.nome': 'Rosa', 'presentes.1.nome': 'Heart Me' },
  );
  assert.deepEqual(patch.presentes, [{ nome: 'Rosa' }, { nome: 'Heart Me' }]);
});

test('a volta não inventa campo que não foi lido', () => {
  // Um campo ausente é um campo que a aba não mostrou. Escrever `undefined`
  // ali apagaria o valor bom que estava valendo.
  const patch = patchDe(DEFS, { 'urnas.u1.numero': '13' });
  assert.deepEqual(patch, { urnas: { u1: { numero: '13' } } });
});

/* ------------------------------------------------------------- a lista de falas */

/*
 * A caixa de texto que é uma lista.
 *
 * As frases da narração são um `string[]`, e a caixa de texto do painel é
 * texto puro. A volta entre as duas é o lugar onde a edição some: o operador
 * escreve cinco frases, salva, e a live fala uma — ou fala a lista inteira
 * como se fosse uma frase só, que é o defeito mais feio dos dois.
 */

const LISTA = [{ caminho: 'narracao.falas.seguidor', rotulo: 'Frases', tipo: 'lista' }];

test('a lista abre uma frase por linha', () => {
  const html = montarCampos(LISTA, { narracao: { falas: { seguidor: ['Valeu, {nome}!', 'Seguiu: {nome}'] } } });
  assert.match(html, /<textarea[^>]*data-campo="narracao\.falas\.seguidor"[^>]*>/);
  assert.ok(html.includes('Valeu, {nome}!\nSeguiu: {nome}'), `as frases não saíram separadas: ${html}`);
});

test('a volta corta as linhas em lista, e a linha em branco não vira fala', () => {
  /*
   * A linha em branco é o jeito natural de separar grupos numa caixa de texto
   * — e uma fala vazia na fila é um silêncio que ninguém pediu, atrasando a
   * frase seguinte. O servidor também tira as vazias, e os dois tiram de
   * propósito: o servidor protege o arquivo editado à mão, o painel protege o
   * que o operador VÊ. Mandar três linhas e guardar duas faria a caixa mostrar
   * uma frase que não existe.
   */
  const patch = patchDe(LISTA, {
    'narracao.falas.seguidor': '  Valeu, {nome}!  \n\n   \nSeguiu: {nome}\n',
  });
  assert.deepEqual(patch.narracao.falas.seguidor, ['Valeu, {nome}!', 'Seguiu: {nome}']);
});

test('a lista vazia volta como lista vazia, e não como texto', () => {
  // Lista vazia é uma decisão legítima: calar um tipo de aviso. Um `''` no
  // lugar do `[]` seria recusado pelo servidor em silêncio — e o operador
  // veria a caixa vazia e continuaria ouvindo a frase que ele apagou.
  const patch = patchDe(LISTA, { 'narracao.falas.seguidor': '   \n  \n' });
  assert.deepEqual(patch.narracao.falas.seguidor, []);

  const html = montarCampos([{ ...LISTA[0], caminho: 'narracao.falas.curtida' }],
    { narracao: { falas: {} } });
  assert.match(html, /<textarea[^>]*><\/textarea>/, 'a caixa sem valor não nasceu vazia');
});

test('a lista de ida e volta dá no mesmo', () => {
  /*
   * O caminho inteiro do painel: configuração → caixa → remendo → caixa. É o
   * que o operador vive a cada salvamento, e uma volta que não fecha aparece
   * como uma frase que muda sozinha depois de salvar.
   */
  const frases = ['Bem-vindo, {nome}!', 'Oi, {nome}!', '{nome} chegou!'];
  const html1 = montarCampos(LISTA, { narracao: { falas: { seguidor: frases } } });
  const texto = html1.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1];
  const patch = patchDe(LISTA, { 'narracao.falas.seguidor': texto });
  const html2 = montarCampos(LISTA, patch);
  assert.equal(html2, html1, 'a caixa mudou depois de uma volta');
});

test('a lista com uma frase só não é confundida com texto solto', () => {
  const patch = patchDe(LISTA, { 'narracao.falas.seguidor': 'Só esta: {nome}' });
  assert.deepEqual(patch.narracao.falas.seguidor, ['Só esta: {nome}']);
});

/* ------------------------------------------------- o que impede de salvar */

test('número em branco vira pendência, e não zero', () => {
  /*
   * `Number('')` é 0, e zero é um valor VÁLIDO para quase tudo que é número
   * aqui — duração de rodada inclusive. Deixar passar seria transformar
   * "apaguei o campo sem querer" em "a rodada agora dura zero segundo", e o
   * servidor recusaria em silêncio, caindo no padrão. O operador tem que ver
   * que o campo está vazio antes de salvar.
   */
  const p = pendenciasDe(DEFS, { 'urnas.u1.ordem': '' });
  assert.equal(p.length, 1);
  assert.equal(p[0].caminho, 'urnas.u1.ordem');
});

test('número fora da faixa vira pendência', () => {
  const p = pendenciasDe(DEFS, { 'urnas.u1.ordem': '200' });
  assert.equal(p.length, 1, 'o máximo do campo foi ignorado');
});

test('texto em branco não é pendência: nem todo campo é obrigatório', () => {
  // O `foto` do candidato é opcional, e a urna desenha o retrato no lugar.
  // Recusar o salvamento por causa de um campo que pode ficar vazio travaria
  // a aba inteira por nada.
  assert.deepEqual(pendenciasDe(DEFS, { 'urnas.u1.numero': '' }), []);
});

test('campo preenchido não é pendência', () => {
  assert.deepEqual(pendenciasDe(DEFS, {
    'urnas.u1.numero': '22', 'urnas.u1.ordem': '0',
    'urnas.u1.corPrimaria': '#000000', 'urnas.u1.ativo': true,
    'integracao.modo': 'simulador',
  }), []);
});
