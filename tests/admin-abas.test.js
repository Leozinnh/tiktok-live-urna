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
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ABAS, acharAba, gruposDaAba, camposDaAba } from '../public/js/admin/abas.js';
import { PADRAO } from '../server/config.js';

const CONFIG_DE_TESTE = {
  urnas: {
    u1: { id: 'u1', nome: 'URNA 1', candidato: { nome: 'Ana', partido: 'A', foto: '' } },
    u2: { id: 'u2', nome: 'URNA 2', candidato: { nome: 'Bruno', partido: 'B', foto: '' } },
  },
  presentes: [
    { id: 'p1', nome: 'Joinha', giftId: '1', urnaId: 'u1' },
    { id: 'p2', nome: 'Rosa', giftId: '2', urnaId: 'u2' },
  ],
  rodada: { duracaoSegundos: 300 },
  animacao: { velocidade: 1 },
  placar: { mensagemVitoria: '{urna} VENCEU!' },
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

test('as sete abas da especificação estão no painel', () => {
  assert.deepEqual(ABAS.map((a) => a.id),
    ['urnas', 'presentes', 'rodada', 'animacao', 'teste', 'integracao', 'textos']);
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
   *
   * Os caminhos de lista (`presentes.0.nome`) são comparados contra o primeiro
   * item do padrão, que é onde os nomes dos campos moram.
   */
  const orfaos = [];
  for (const aba of ABAS) {
    for (const c of camposDaAba(aba.id, CONFIG_DE_TESTE)) {
      const partes = c.caminho.split('.');
      // Numa lista, o que se compara é o item: `presentes.0.nome` vira `nome`
      // contra o primeiro item do padrão, que é onde os nomes dos campos moram.
      const alvo = partes[0] === 'presentes' ? PADRAO.presentes[0] : PADRAO;
      const dentro = partes[0] === 'presentes' ? partes.slice(2) : partes;
      if (dentro.length === 0 || valorEm(alvo, dentro.join('.')) === undefined) {
        orfaos.push(`${aba.id}: ${c.caminho}`);
      }
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

test('a aba de presentes cresce com a configuração', () => {
  // Uma lista fixa mentiria no dia em que o operador cadastrasse o terceiro.
  const dois = gruposDaAba('presentes', CONFIG_DE_TESTE);
  assert.equal(dois.length, 2);

  const tres = gruposDaAba('presentes', {
    ...CONFIG_DE_TESTE,
    presentes: [...CONFIG_DE_TESTE.presentes, { id: 'p3', nome: 'Leão', giftId: '9' }],
  });
  assert.equal(tres.length, 3);
  assert.ok(tres[2].campos.some((c) => c.caminho === 'presentes.2.giftId'),
    'o terceiro presente não ganhou campos');
});

test('o presente leva o id escondido, para o salvamento não apagá-lo', () => {
  /*
   * O `normalizar` recusa presente sem id — "sem nome pelo qual ser mapeado".
   * Se o id não voltasse no remendo, salvar a aba apagaria o presente inteiro
   * da configuração, e o operador veria o presente sumir da tela ao salvar.
   */
  const grupos = gruposDaAba('presentes', CONFIG_DE_TESTE);
  const ocultos = (grupos[0].oculto ?? []).map((o) => o.caminho);
  assert.deepEqual(ocultos, ['presentes.0.id']);
});

test('a urna de destino do presente é escolhida entre as urnas que existem', () => {
  const grupos = gruposDaAba('presentes', CONFIG_DE_TESTE);
  const alvo = grupos[0].campos.find((c) => c.caminho === 'presentes.0.urnaId');
  const valores = alvo.opcoes.map((o) => o.valor);
  assert.deepEqual(valores, ['', 'u1', 'u2'], 'a lista de urnas não bateu com a configuração');
  assert.equal(valores[0], '', 'falta a opção "não conta", que é como se desliga um presente');
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
