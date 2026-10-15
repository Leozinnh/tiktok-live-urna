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

import { ABAS, acharAba, gruposDaAba, camposDaAba, ACOES_SOCIAIS, giftIdSemUrna, numeroDeTeste, MOTORES_DA_VOZ } from '../public/js/admin/abas.js';
import { PADRAO, POLITICAS_DE_ENCERRAMENTO } from '../server/config.js';
import { TIPOS_SOCIAIS } from '../server/sources/base.js';
import { MOTORES } from '../server/voz.js';

const CONFIG_DE_TESTE = {
  urnas: {
    u1: { id: 'u1', nome: 'URNA 1', candidato: { nome: 'Ana', partido: 'A', foto: '' } },
    u2: { id: 'u2', nome: 'URNA 2', candidato: { nome: 'Bruno', partido: 'B', foto: '' } },
  },
  presentes: [
    { id: 'p1', nome: 'Heart Me', giftId: '1', urnaId: 'u1' },
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

/* ------------------------------------------------- os botões do chat */

test('todo tipo de fala tem um rótulo humano no painel', () => {
  /*
   * A aba Textos monta uma caixa por tipo de fala que o servidor conhece, e
   * tira o rótulo de um mapa. Um tipo que nasça no servidor sem entrada nesse
   * mapa aparece no painel com o nome técnico — "espera" em vez de "quando
   * alguém manda presente e não escreve o número". A caixa existe, o operador
   * pode até editá-la, e ele não faz ideia de para que serve.
   */
  const campos = camposDaAba('textos', PADRAO);
  const semRotulo = Object.keys(PADRAO.narracao.falas).filter((tipo) => {
    const campo = campos.find((c) => c.caminho === `narracao.falas.${tipo}`);
    return campo?.rotulo === tipo;
  });
  assert.deepEqual(semRotulo, [], `falas sem rótulo no painel: ${semRotulo.join(', ')}`);
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

/* --------------------------------------------------------- o motor da voz */

test('os motores oferecidos no painel são os que o servidor tem', () => {
  /*
   * A costura de sempre, e aqui ela vale mais do que nas outras abas: o motor
   * da voz é uma lista FECHADA do lado do servidor, e um nome que o painel
   * oferecesse sem o servidor conhecer seria salvo, mostrado como escolhido, e
   * ignorado — a voz continuaria a mesma e nada na tela explicaria por quê.
   *
   * A varredura é contra a tabela de motores do `voz.js`, que é quem decide.
   *
   * A comparação é por CONJUNTO, e não por ordem: a ordem da tabela do
   * servidor é a de inserção no objeto e não quer dizer nada, enquanto a do
   * painel é uma escolha de apresentação — o neural primeiro, porque é o
   * padrão e é o que o Leonardo vai querer na maioria das vezes. Prender a
   * ordem aqui obrigaria o painel a listar na ordem em que o servidor por
   * acaso declarou, que é o tipo de acoplamento que ninguém percebe até
   * reordenar o objeto e ver um teste vermelho sem defeito nenhum por trás.
   */
  const doServidor = Object.keys(MOTORES).sort();
  assert.deepEqual(MOTORES_DA_VOZ.map((m) => m.valor).sort(), doServidor);

  const campo = camposDaAba('textos', PADRAO).find((c) => c.caminho === 'narracao.motor');
  assert.ok(campo, 'não há campo de motor da voz no painel');
  assert.equal(campo.tipo, 'selecao');
  assert.deepEqual(campo.opcoes.map((o) => o.valor).sort(), doServidor);
  for (const o of campo.opcoes) assert.match(o.rotulo ?? '', /\S/, `o motor ${o.valor} ficou sem rótulo`);
  // O padrão do servidor tem que estar entre as opções: um padrão que o painel
  // não oferece deixaria o campo mostrando uma escolha que não existe na lista,
  // e o primeiro salvamento trocaria a voz sem ninguém pedir.
  assert.ok(campo.opcoes.some((o) => o.valor === PADRAO.narracao.motor),
    'o motor padrão do servidor não está entre as opções do painel');
});

test('o campo da voz não promete mais o Windows do que ele é', () => {
  /*
   * O rótulo antigo dizia "Voz do Windows", e dizia certo enquanto havia um
   * motor só. Com dois, o mesmo campo agora aceita um nome de voz NEURAL e um
   * nome de voz do SAPI — que são listas diferentes —, e um rótulo que falasse
   * de Windows mandaria o Leonardo procurar a Francisca neural no painel do
   * Windows, onde ela não está.
   */
  const campo = camposDaAba('textos', PADRAO).find((c) => c.caminho === 'narracao.voz');
  assert.doesNotMatch(campo.rotulo, /Windows/i);
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
