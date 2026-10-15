/*
 * Os caminhos das abas existem do outro lado.
 *
 * Uma aba é uma lista de caminhos para a configuração. Um caminho com erro de
 * digitação não quebra nada: o campo abre vazio, o operador preenche, o
 * `mesclar` aceita a chave nova sem reclamar, e o servidor a ignora porque o
 * `normalizar` não a conhece. A tela diz "salvo" e a live continua igual.
 *
 * Este arquivo prende as duas pontas uma na outra: todo caminho declarado
 * numa aba tem que resolver contra o PADRAO do servidor. É o único teste
 * desta suíte que importa código dos dois lados, e é de propósito — o defeito
 * que ele pega mora justamente na costura.
 *
 * O painel tem QUATRO abas. Ele nasceu com sete, e em 2026-10-15 o Leonardo
 * cortou Presentes, Animação e Textos: essas três ele edita direto no
 * `config/local.json` e não quer a tela no meio. O que saiu foi a TELA —
 * as chaves continuam no arquivo e continuam sendo lidas pelo servidor, e é
 * o último teste daqui que prende isso.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ABAS, acharAba, gruposDaAba, camposDaAba, ACOES_SOCIAIS, giftIdSemUrna, numeroDeTeste } from '../public/js/admin/abas.js';
import { PADRAO, POLITICAS_DE_ENCERRAMENTO } from '../server/config.js';
import { TIPOS_SOCIAIS } from '../server/sources/base.js';

const CONFIG_DE_TESTE = {
  urnas: {
    u1: { id: 'u1', nome: 'URNA 1', candidato: { nome: 'Ana', partido: 'A', foto: '' } },
    u2: { id: 'u2', nome: 'URNA 2', candidato: { nome: 'Bruno', partido: 'B', foto: '' } },
  },
  rodada: { duracaoSegundos: 300 },
  integracao: { modo: 'simulador' },
};

/** O valor que está neste caminho, ou `undefined`. */
function valorEm(objeto, caminho) {
  let atual = objeto;
  for (const parte of caminho.split('.')) {
    if (atual === null || typeof atual !== 'object') return undefined;
    atual = atual[parte];
  }
  return atual;
}

test('o painel tem as quatro abas que sobraram', () => {
  assert.deepEqual(ABAS.map((a) => a.id), ['urnas', 'rodada', 'teste', 'integracao']);
});

test('toda aba tem rótulo e ajuda legível', () => {
  for (const a of ABAS) {
    assert.match(a.rotulo ?? '', /\S/, `a aba ${a.id} ficou sem rótulo`);
    assert.match(a.ajuda ?? '', /\S/, `a aba ${a.id} ficou sem explicação`);
  }
});

test('todo caminho de aba existe na configuração do servidor', () => {
  /*
   * A varredura é contra o PADRAO, e não contra a configuração de teste: o
   * padrão é a lista do que o servidor conhece, e é ele que decide se uma
   * chave vira campo honrado ou campo ignorado em silêncio.
   */
  const orfaos = [];
  for (const aba of ABAS) {
    for (const c of camposDaAba(aba.id, CONFIG_DE_TESTE)) {
      if (valorEm(PADRAO, c.caminho) === undefined) orfaos.push(`${aba.id}: ${c.caminho}`);
    }
  }
  assert.deepEqual(orfaos, [],
    `campo que o servidor não conhece — o painel salvaria e nada mudaria: ${orfaos.join(', ')}`);
});

test('a duração da rodada é editável no painel', () => {
  // Pedido direto do Leonardo, e o motivo de a aba Rodada existir.
  const campos = camposDaAba('rodada', CONFIG_DE_TESTE);
  const duracao = campos.find((c) => c.caminho === 'rodada.duracaoSegundos');
  assert.ok(duracao, 'a aba Rodada não tem campo de duração');
  assert.equal(duracao.tipo, 'numero');
  // Sem faixa, um 86401 digitado por engano viraria uma rodada de um dia
  // inteiro — e o servidor o aceitaria.
  assert.equal(duracao.max, 86400);
});

test('a aba de teste é feita de botões, e não de campos', () => {
  // Disparar um presente não é editar configuração: um botão que salvasse
  // junto mudaria a live por causa de um teste.
  assert.deepEqual(camposDaAba('teste', CONFIG_DE_TESTE), []);
  assert.equal(acharAba('teste').acoes, true);
});

test('aba desconhecida devolve nada, e não explode', () => {
  assert.deepEqual(gruposDaAba('nao-existe', CONFIG_DE_TESTE), []);
  assert.equal(acharAba('nao-existe'), undefined);
});

/* ------------------------------------------------- os botões do teste */

test('o painel tem um botão de teste para cada tipo social', () => {
  /*
   * A voz é a parte mais frágil do sistema e a única que não dá para conferir
   * olhando o painel. Sem botão, o Leonardo só descobriria que ela não
   * funciona quando alguém seguisse de verdade, no ar.
   *
   * A costura é a de sempre: a lista de tipos sociais é do SERVIDOR, e o
   * botão é do painel. Um tipo que nascesse lá sem botão aqui seria uma fala
   * que ninguém consegue testar — e o teste fica vermelho em vez de o buraco
   * passar despercebido.
   */
  assert.deepEqual(ACOES_SOCIAIS.map((a) => a.tipo), [...TIPOS_SOCIAIS]);
  for (const a of ACOES_SOCIAIS) {
    assert.match(a.rotulo ?? '', /\S/, `o botão de ${a.tipo} ficou sem rótulo`);
  }
});

test('o presente de teste não colide com nenhum presente mapeado', () => {
  /*
   * O botão "presente sem urna" precisa de um id que NÃO esteja no
   * mapeamento: é justamente o presente desconhecido que abre a espera pelo
   * número. Se o id escolhido estivesse cadastrado, o voto contaria na hora e
   * a espera nunca abriria — o Leonardo apertaria o botão, veria o voto
   * acontecer, e concluiria que o caminho do chat está pronto quando ele nem
   * chegou a ser exercitado.
   */
  assert.equal(giftIdSemUrna([{ giftId: '1' }, { giftId: '2' }]), '9999');
  // E se o Leonardo cadastrar justamente o 9999, o botão anda sozinho em vez
  // de virar um falso positivo.
  assert.equal(giftIdSemUrna([{ giftId: '9999' }]), '10000');
  assert.equal(giftIdSemUrna([]), '9999');
  assert.equal(giftIdSemUrna(null), '9999');
});

test('o campo do número abre preenchido com uma urna que existe', () => {
  // Um campo vazio faria o botão "escreveu o número" não fazer nada — e um
  // botão que não faz nada é indistinguível de um caminho quebrado.
  assert.equal(numeroDeTeste({ u1: { numero: '22' }, u2: { numero: '13' } }), '22');
  assert.equal(numeroDeTeste({}), '');
  assert.equal(numeroDeTeste(null), '');
});

/* ------------------------------- o que saiu do painel, e o que ficou */

test('as três abas cortadas não voltam, e as chaves delas continuam valendo', () => {
  /*
   * O corte de 2026-10-15 tirou a TELA, e não o recurso. Presentes, Animação
   * e Textos continuam existindo em `config/local.json` e continuam sendo
   * lidos pelo `normalizar` — o que acabou foi o caminho de editá-los pelo
   * navegador.
   *
   * As duas metades importam. Uma aba que voltasse sozinha traria de volta a
   * tela que ele não quer; uma chave que sumisse junto quebraria a live dele
   * em silêncio, porque o `local.json` continuaria com ela e o servidor
   * passaria a ignorá-la.
   */
  const ids = ABAS.map((a) => a.id);
  for (const fora of ['presentes', 'animacao', 'textos']) {
    assert.equal(ids.includes(fora), false, `a aba ${fora} voltou ao painel`);
  }

  for (const caminho of [
    'animacao.velocidade',
    'placar.mensagemVitoria',
    'narracao.ativa',
    'narracao.motor',
    'narracao.volume',
    'narracao.falas.seguidor',
    'presentes.0.nome',
    'presentes.0.urnaId',
  ]) {
    assert.notEqual(valorEm(PADRAO, caminho), undefined,
      `${caminho} saiu da configuração junto com a aba — o local.json do Leonardo ficaria mentindo`);
  }
});

/* ---------------------------------------------- o que o servidor não honra */

test('a política de fechamento só volta ao painel quando o servidor a honrar', () => {
  /*
   * O campo oferecia duas políticas — "processar-recebidos" e
   * "descartar-atrasados". O servidor conhece três, e "descartar-atrasados"
   * NÃO é uma delas: `POLITICAS_DE_ENCERRAMENTO` traz "corte-exato" e
   * "tolerancia-2s" no lugar. Escolher a opção inventada era exatamente o
   * defeito que a regra deste arquivo existe para impedir — o painel dizia
   * "salvo", o `normalizar` avisava baixinho, e a rodada continuava fechando
   * do mesmo jeito.
   *
   * Pior: das três que o servidor ACEITA, só "processar-recebidos" é
   * HONRADA. O `fecharRodada` do tally processa o que chegou e não consulta a
   * política em lugar nenhum. Um campo com três opções das quais duas não
   * fazem nada é a mesma mentira, com mais cliques.
   *
   * A tolerância é o MESMO recurso e tem o mesmo problema: `toleranciaMs` é a
   * janela em que um voto atrasado ainda vale, e só quer dizer alguma coisa
   * junto de uma política que olhe o relógio do evento. Ninguém a lê. Ela sai
   * junto — um campo de milissegundos que não muda nada é pior do que os
   * outros, porque parece o mais técnico e o mais confiável dos três.
   *
   * Então os dois saem, e voltam na etapa que implementar as três políticas.
   * Este teste é o que impede eles de voltarem antes disso.
   */
  const campos = ABAS.flatMap((a) => camposDaAba(a.id, PADRAO));
  for (const caminho of ['rodada.politica', 'rodada.toleranciaMs']) {
    assert.equal(campos.some((c) => c.caminho === caminho), false,
      `${caminho} voltou ao painel sem o servidor honrá-lo`);
  }

  // E a lista do servidor continua sendo a das três da spec, seção 6.3: no dia
  // em que o campo voltar, é dela que as opções têm que sair — e não de uma
  // lista escrita no painel, que foi como "descartar-atrasados" nasceu.
  assert.deepEqual([...POLITICAS_DE_ENCERRAMENTO].sort(),
    ['corte-exato', 'processar-recebidos', 'tolerancia-2s']);
});
