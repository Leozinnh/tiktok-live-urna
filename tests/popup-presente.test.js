import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dadosDoPresente, LIMITE_DO_NOME, LIMITE_DO_QUEM, LIMITE_DA_URNA,
} from '../public/js/popup-presente.js';

/*
 * O pop-up do presente — o que a tela mostra por cima de tudo quando alguém
 * paga.
 *
 * O Leonardo olhou o aviso de presente e disse o que faltava: "não quero só um
 * badge falando, quero um pop-up na tela com a png/webp/imagem do presente; se
 * não tiver a imagem, falar o nome e tal".
 *
 * A decisão do que o pop-up MOSTRA mora numa função pura, e é o que este
 * arquivo prende: as três telas do produto — a imagem, o nome no lugar da
 * imagem, e nada — e os cortes de texto. O desenho em si (o tamanho, o
 * brilho, a entrada) é conferido no navegador, pela sonda.
 */

const PRESENTE = Object.freeze({
  texto: 'Chegou Rosa de Painel!',
  wav: null,
  tipo: 'presente',
  usuario: 'Painel',
  presente: { nome: 'Rosa', desenho: 'rose', urna: 'Lulinha' },
});

const fala = (mudanca = {}) => ({ ...PRESENTE, ...mudanca });

test('o pop-up é do presente, e de mais nada', () => {
  /*
   * A mesma decisão que a faixa já toma, e pela mesma razão: um pop-up de meio
   * segundo cobrindo a tela porque alguém ENTROU na live seria o operador
   * perdendo o enquadramento por um evento que não vale isso. O que merece
   * tomar a tela é o que alguém pagou para acontecer.
   */
  for (const tipo of ['entrada', 'seguidor', 'curtida', 'compartilhou', 'assinatura', 'espera']) {
    assert.equal(dadosDoPresente(fala({ tipo })), null, `${tipo} não é presente`);
  }
});

test('o pop-up precisa do presente, e não só do tipo', () => {
  // O `tipo` é uma etiqueta; quem carrega o que mostrar é o `presente`. Uma
  // mensagem de presente sem ele é uma versão antiga do servidor, e o pop-up
  // fica quieto em vez de aparecer vazio no meio da transmissão.
  assert.equal(dadosDoPresente(fala({ presente: null })), null);
  assert.equal(dadosDoPresente(fala({ presente: undefined })), null);
  assert.equal(dadosDoPresente(fala({ presente: 'Rosa' })), null);
});

test('sem imagem, o nome do presente é quem aparece', () => {
  /*
   * "Se não tiver a imagem do presente, falar nome e tal."
   *
   * É o caso de hoje: a configuração do Leonardo não tem `desenho`, e o
   * arquivo do presente é escrito à mão. Sem esta saída, o pop-up do presente
   * mais caro da noite seria um retângulo vazio.
   */
  const dados = dadosDoPresente(fala({ presente: { nome: 'Rosa', desenho: null, urna: 'Lulinha' } }));
  assert.ok(dados, 'sumiu o pop-up de um presente sem desenho');
  assert.equal(dados.nome, 'Rosa');
  assert.equal(dados.desenho, null);
  assert.equal(dados.urna, 'Lulinha');
});

test('sem nome e sem desenho não há o que mostrar', () => {
  // Nem imagem, nem palavra: um pop-up assim seria um clarão na tela sem
  // explicação nenhuma. Melhor não aparecer.
  assert.equal(dadosDoPresente(fala({ presente: { nome: '', desenho: null, urna: 'Lulinha' } })), null);
  assert.equal(dadosDoPresente(fala({ presente: { desenho: null } })), null);
});

test('o nome do presente e o apelido de quem mandou vão cortados', () => {
  /*
   * O pop-up escreve os dois em corpo de manchete. Um apelido de rede social
   * tem quarenta caracteres com folga, e num título de 76px isso são três
   * linhas atravessando o enquadramento inteiro — numa live, o nome de uma
   * pessoa comendo a tela é pior do que o nome cortado.
   */
  const nomeLongo = 'Presente Com Um Nome Absurdamente Comprido De Tão Grande';
  const quemLongo = 'Um Apelido De TikTok Bem Comprido Demais Pra Caber';
  const dados = dadosDoPresente(fala({
    usuario: quemLongo,
    presente: { nome: nomeLongo, desenho: null, urna: 'Lulinha' },
  }));
  assert.equal(dados.nome.length, LIMITE_DO_NOME);
  assert.ok(dados.nome.endsWith('…'), 'o corte tem que avisar que cortou');
  assert.equal(dados.quem.length, LIMITE_DO_QUEM);
  assert.ok(dados.quem.endsWith('…'));
  // O que cabe passa inteiro, sem reticência nenhuma.
  assert.equal(dadosDoPresente(fala()).quem, 'Painel');
});

test('sem urna, o pop-up não inventa uma', () => {
  // O presente órfão — sem voto, sem candidato — é um caso real: o pop-up
  // mostra o presente e cala sobre o destino, em vez de escrever "undefined".
  const dados = dadosDoPresente(fala({ presente: { nome: 'Rosa', desenho: 'rose' } }));
  assert.equal(dados.urna, '');
  assert.equal(dadosDoPresente(fala({ presente: { nome: 'Rosa', urna: '   ' } })).urna, '');
});

test('a urna comprida também corta, e não empurra o crachá', () => {
  const dados = dadosDoPresente(fala({
    presente: { nome: 'Rosa', desenho: 'rose', urna: 'Um Apelido Muito Comprido De Candidato' },
  }));
  assert.equal(dados.urna.length, LIMITE_DA_URNA);
});

test('a mesma fala devolve sempre o mesmo pop-up', () => {
  // A fala passa pela fila e pode ser reexibida numa reconexão; uma função que
  // sorteasse ou guardasse estado daria dois pop-ups diferentes para o mesmo
  // presente.
  assert.deepEqual(dadosDoPresente(fala()), dadosDoPresente(fala()));
});

test('a cor do pop-up é a da urna que recebeu o voto', () => {
  /*
   * O segundo pedido do Leonardo olhando este pop-up, depois de vê-lo na tela:
   * "a cor do pop-up tem que ser de acordo com o voto dele, se for Lula
   * vermelho e tal".
   *
   * A cor não é do presente, é da URNA — a mesma rosa vira vermelha na 13 e
   * azul na 22. Por isso ela viaja junto do resto do presente e não é escolha
   * do pop-up: quem sabe de quem é o voto é o servidor, que é quem conta.
   */
  const vermelho = dadosDoPresente(fala({
    presente: { nome: 'Rosa', desenho: 'rose', urna: 'Lulinha', cor: '#e02020' },
  }));
  assert.equal(vermelho.cor, '#e02020');

  const azul = dadosDoPresente(fala({
    presente: { nome: 'Rosa', desenho: 'rose', urna: 'Flavio', cor: '#1a5fd0' },
  }));
  assert.equal(azul.cor, '#1a5fd0');
});

test('sem cor conhecida, o pop-up fica no dourado de sempre', () => {
  /*
   * Presente órfão, configuração antiga, servidor de uma versão anterior: o
   * pop-up tem que sair inteiro mesmo sem saber a cor. `null` é a resposta, e
   * não uma cor inventada — quem decide o dourado é o CSS.
   */
  assert.equal(dadosDoPresente(fala()).cor, null);
  assert.equal(dadosDoPresente(fala({ presente: { nome: 'Rosa', cor: null } })).cor, null);
  assert.equal(dadosDoPresente(fala({ presente: { nome: 'Rosa', cor: '   ' } })).cor, null);
});

test('uma cor que não é cor não chega ao CSS', () => {
  /*
   * Este campo é o único do pop-up que vira PROPRIEDADE DE ESTILO, e não
   * texto. `textContent` neutraliza o que vier — um apelido com `<script>` sai
   * como os caracteres que ele tem —, mas `style.setProperty` não neutraliza
   * nada: o valor é interpretado.
   *
   * O valor nasce no `config/local.json` e é conferido pela `COR_VALIDA` de
   * lá, então o caminho normal já vem limpo. Esta é a segunda ponta do fio, e
   * existe pela mesma razão que a `NOME_DE_DESENHO` do narrador existe: uma
   * peneira esquecida é uma porta aberta, e do outro lado dela está a página
   * que o OBS está capturando.
   */
  for (const ruim of [
    'red', 'rgb(1,2,3)', '#xyz', '#12345', '#e0202', 'e02020', 'url(x)', 'var(--x)',
    '#e02020; background: url(x)', '#e02020 }', 'expression(alert(1))', 42, {}, [],
  ]) {
    assert.equal(dadosDoPresente(fala({ presente: { nome: 'Rosa', cor: ruim } })).cor, null,
      `"${JSON.stringify(ruim)}" não podia virar cor do pop-up`);
  }
  // As três formas que o CSS aceita passam inteiras, e o `#` é obrigatório.
  for (const boa of ['#e02020', '#f00', '#e02020ff']) {
    assert.equal(dadosDoPresente(fala({ presente: { nome: 'Rosa', cor: boa } })).cor, boa);
  }
});
