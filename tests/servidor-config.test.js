import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizar, mesclar, pontosDoPresente, PADRAO } from '../server/config.js';

/*
 * A configuração que o SERVIDOR lê.
 *
 * O navegador já tem a dele (public/js/config.js), e ela continua sendo quem
 * desenha a cena. Esta aqui existe porque o motor de votos precisa saber, sem
 * navegador nenhum, quais urnas existem, qual o número de cada uma e quanto
 * vale cada presente — é com isso que ele conta.
 *
 * São duas leituras do MESMO arquivo, e é de propósito: o `local.json` é do
 * Leonardo, e as duas pontas precisam concordar sobre ele. O que não pode
 * haver é duas verdades sobre a CONTAGEM, e por isso quem conta é o servidor
 * — a página da live desenha o que ele mandar.
 */

test('sem nada configurado, valem os padrões', () => {
  const { config, avisos } = normalizar({});
  assert.equal(Object.keys(config.urnas).length, 2, 'o projeto tem duas urnas');
  assert.deepEqual(avisos, []);
  for (const u of Object.values(config.urnas)) {
    assert.match(u.numero, /^\d{1,5}$/);
    assert.equal(u.multiplicador, 1);
    assert.equal(u.ativo, true);
  }
});

test('o arquivo do usuário remenda campo a campo, sem apagar o resto', () => {
  /*
   * Quem só quer trocar a foto escreve só a foto. Se o remendo substituísse
   * a urna inteira, o número e o nome sumiriam no dia em que ele mexesse na
   * cor — e a urna apareceria sem número no ar.
   */
  const { config } = normalizar({
    urnas: { u1: { candidato: { foto: 'ana.jpg' } } },
  });
  assert.equal(config.urnas.u1.candidato.foto, 'ana.jpg');
  assert.equal(config.urnas.u1.numero, PADRAO.urnas.u1.numero);
  assert.equal(config.urnas.u1.nome, PADRAO.urnas.u1.nome);
});

test('a lista de urnas também é aceita, além do objeto', () => {
  /*
   * A especificação escreve `urnas` como lista com `id` dentro; o projeto
   * usa objeto indexado por id, que é melhor para remendar um campo só.
   * Duas verdades que discordam é pior do que qualquer uma das duas, então
   * as duas formas entram — e saem sempre como objeto.
   */
  const { config, avisos } = normalizar({
    urnas: [{ id: 'u1', numero: '99', nome: 'Nove Nove' }],
  });
  assert.equal(config.urnas.u1.numero, '99');
  assert.equal(config.urnas.u1.nome, 'Nove Nove');
  assert.deepEqual(avisos, []);
});

test('um campo inválido cai no padrão, e o motivo vira aviso', () => {
  /*
   * A regra da seção 7 da especificação: configuração corrompida não derruba
   * a live. O valor ruim é trocado pelo padrão e o motivo sai como aviso —
   * engolir em silêncio deixaria o Leonardo procurando na tela por que a
   * urna dele ficou azul.
   */
  const { config, avisos } = normalizar({
    urnas: { u1: { numero: '123456789', corPrimaria: 'azulzinho' } },
  });
  assert.equal(config.urnas.u1.numero, PADRAO.urnas.u1.numero);
  assert.equal(config.urnas.u1.corPrimaria, PADRAO.urnas.u1.corPrimaria);
  assert.equal(avisos.length, 2, `avisos: ${JSON.stringify(avisos)}`);
  assert.ok(avisos.some((a) => /numero/.test(a)), 'o aviso não diz qual campo estava errado');
  assert.ok(avisos.some((a) => /corPrimaria/.test(a)));
});

test('um presente que aponta para urna inexistente é avisado, e não conta', () => {
  const { config, avisos } = normalizar({
    presentes: [{ id: 'p9', nome: 'Leão', urnaId: 'u9', votos: 3 }],
  });
  const p9 = config.presentes.find((p) => p.id === 'p9');
  assert.equal(p9.urnaId, null, 'o presente ficou apontando para uma urna que não existe');
  assert.ok(avisos.some((a) => /u9/.test(a)), `avisos: ${JSON.stringify(avisos)}`);
});

test('presente sem id é recusado, e o resto da lista fica', () => {
  /*
   * Um presente sem id não pode ser mapeado nem deduplicado: não há nome
   * pelo qual chamá-lo. Ele sai da lista com um aviso, e os outros ficam —
   * derrubar a lista inteira por causa de um item faria o Leonardo perder a
   * configuração toda por um erro de digitação num campo.
   */
  const { config, avisos } = normalizar({
    presentes: [{ nome: 'sem id' }, { id: 'p7', nome: 'Leão', urnaId: 'u1', votos: 5 }],
  });
  assert.deepEqual(config.presentes.map((p) => p.id), ['p7']);
  assert.equal(config.presentes[0].votos, 5);
  assert.ok(avisos.some((a) => /id/.test(a)), `avisos: ${JSON.stringify(avisos)}`);
});

test('o multiplicador da urna entra na conta, e o zero não é aceito', () => {
  const { config, avisos } = normalizar({ urnas: { u1: { multiplicador: 0 } } });
  assert.equal(config.urnas.u1.multiplicador, 1, 'multiplicador zero zeraria a urna inteira');
  assert.equal(avisos.length, 1);
});

test('as políticas de fim de rodada são só as três da especificação', () => {
  const ok = normalizar({ rodada: { politica: 'corte-exato' } });
  assert.equal(ok.config.rodada.politica, 'corte-exato');
  const ruim = normalizar({ rodada: { politica: 'quando-eu-quiser' } });
  assert.equal(ruim.config.rodada.politica, PADRAO.rodada.politica);
  assert.equal(ruim.avisos.length, 1);
});

test('o modo de integração é simulador ou tiktok', () => {
  const ok = normalizar({ integracao: { modo: 'tiktok' } });
  assert.equal(ok.config.integracao.modo, 'tiktok');
  const ruim = normalizar({ integracao: { modo: 'chute' } });
  assert.equal(ruim.config.integracao.modo, 'simulador');
  assert.equal(ruim.avisos.length, 1);
});

test('mesclar não mexe no objeto que recebeu', () => {
  // Os padrões são um módulo congelado; um remendo que escrevesse neles
  // envenenaria todas as leituras seguintes do processo.
  const base = { a: 1, b: { c: 2, d: 3 } };
  const saida = mesclar(base, { b: { c: 9 } });
  assert.deepEqual(base, { a: 1, b: { c: 2, d: 3 } });
  assert.deepEqual(saida, { a: 1, b: { c: 9, d: 3 } });
});

test('lista não é remendada item a item: ela substitui', () => {
  /*
   * Remendar listas por índice é o caminho mais curto para o presente 3 do
   * usuário virar o presente 3 do padrão sem ninguém entender por quê. Quem
   * manda a lista, manda a lista inteira — e o motor a normaliza depois.
   */
  const { config } = normalizar({ presentes: [{ id: 'p1', nome: 'Só este' }] });
  assert.equal(config.presentes.length, 1);
  assert.equal(config.presentes[0].nome, 'Só este');
});

test('o padrão é congelado: ninguém o altera por acidente', () => {
  assert.ok(Object.isFrozen(PADRAO), 'PADRAO devia estar congelado');
});

/*
 * A conta do voto — seção 6.1 da especificação.
 *
 * É a única regra do projeto que decide QUANTOS votos um presente vale, e
 * por isso ela é uma função pura, com teste, e não uma multiplicação
 * espalhada por dentro do motor.
 */

test('um presente vale os votos dele vezes o multiplicador da urna', () => {
  const urna = { ativo: true, multiplicador: 3 };
  assert.equal(pontosDoPresente({ votos: 2, ativo: true }, urna), 6);
});

test('o combo multiplica: cinco rosas de uma vez são um evento de cinco votos', () => {
  const urna = { ativo: true, multiplicador: 1 };
  assert.equal(pontosDoPresente({ votos: 1, ativo: true }, urna, 5), 5);
});

test('presente sem urna não vale nada', () => {
  // Presente órfão — apontando para uma urna que não existe — não conta.
  // Zero é a resposta honesta para "quanto ele vale".
  assert.equal(pontosDoPresente({ votos: 1, ativo: true }, null), 0);
});

test('presente ou urna desativados não valem nada', () => {
  assert.equal(pontosDoPresente({ votos: 1, ativo: false }, { ativo: true, multiplicador: 1 }), 0);
  assert.equal(pontosDoPresente({ votos: 1, ativo: true }, { ativo: false, multiplicador: 1 }), 0);
});

test('combo inválido conta como um, e não como zero', () => {
  // Um combo ausente ou zerado é o caso NORMAL — quem manda um presente só
  // não gera combo. Tratar isso como zero faria o voto sumir.
  const urna = { ativo: true, multiplicador: 1 };
  for (const combo of [undefined, null, 0, -3, 'muito', NaN]) {
    assert.equal(pontosDoPresente({ votos: 1, ativo: true }, urna, combo), 1, `combo ${combo}`);
  }
});
