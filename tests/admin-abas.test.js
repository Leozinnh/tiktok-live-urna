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

import { ABAS, acharAba, gruposDaAba, camposDaAba, ACOES_SOCIAIS } from '../public/js/admin/abas.js';
import { PADRAO } from '../server/config.js';
import { TIPOS_SOCIAIS } from '../server/sources/base.js';

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

/* ------------------------------------------------------------- a narração */

test('toda fala que o narrador sabe dizer é editável no painel', () => {
  /*
   * A lista de tipos do narrador mora no servidor, e o painel é a única
   * janela para ela. Um tipo sem campo aqui é uma frase que o Leonardo só
   * ouviria — e para trocá-la teria que editar o JSON na mão, sem saber que
   * aquele tipo existia.
   *
   * A varredura é contra o PADRAO, e não contra uma configuração escrita
   * aqui: uma lista copiada para dentro do teste passaria mesmo no dia em que
   * o painel deixasse um tipo de fora, porque as duas cópias encolheriam
   * juntas. O PADRAO é a lista do que o servidor fala.
   */
  const campos = camposDaAba('textos', PADRAO);
  const faltando = Object.keys(PADRAO.narracao.falas).filter((tipo) => !campos.some(
    (c) => c.caminho === `narracao.falas.${tipo}` && c.tipo === 'lista',
  ));
  assert.deepEqual(faltando, [], `tipos sem campo de edição: ${faltando.join(', ')}`);
});

test('um tipo de fala que o painel não conhece ainda ganha caixa', () => {
  /*
   * O dia em que o servidor ganhar um tipo novo — uma "meta batida", um
   * "presente grande" —, o painel não pode simplesmente não mostrar. Sem
   * rótulo bonito ele mostra o nome cru, e o Leonardo edita a frase do mesmo
   * jeito, com o painel dizendo o que aquilo é pelo nome que ele lê no
   * arquivo.
   */
  const cfg = { ...PADRAO, narracao: { ...PADRAO.narracao, falas: { ...PADRAO.narracao.falas, metaBatida: ['Meta!'] } } };
  const campo = camposDaAba('textos', cfg).find((c) => c.caminho === 'narracao.falas.metaBatida');
  assert.ok(campo, 'o tipo novo não apareceu no painel');
  assert.equal(campo.tipo, 'lista');
  assert.match(campo.rotulo, /\S/, 'o tipo novo ficou sem rótulo nenhum');
});

test('os controles da voz estão na mesma aba das frases', () => {
  /*
   * Ligar, escolher a voz, a velocidade e o volume são a mesma decisão que as
   * frases: como o narrador soa. Separados em duas abas, o Leonardo mudaria a
   * frase numa e o volume na outra sem ver a relação.
   */
  const campos = camposDaAba('textos', CONFIG_DE_TESTE);
  const acha = (caminho) => campos.find((c) => c.caminho === caminho);
  assert.equal(acha('narracao.ativa')?.tipo, 'booleano');
  assert.equal(acha('narracao.voz')?.tipo, 'texto');
  // O volume é de 0 a 1. Sem a faixa, um 7 digitado por engano seria mostrado
  // no campo e o servidor tocaria 1 — o campo mentindo sobre o que está no ar.
  assert.equal(acha('narracao.volume')?.max, 1);
  assert.equal(acha('narracao.volume')?.min, 0);
  // A escala do SAPI, a mesma do `normalizar`.
  assert.equal(acha('narracao.velocidade')?.min, -10);
  assert.equal(acha('narracao.velocidade')?.max, 10);
});

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
