import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizar, mesclar, pontosDoPresente, votosPeloPreco, VOTOS_DO_PRESENTE, PADRAO,
} from '../server/config.js';

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

test('o presente de entrada é o Heart Me, e não o joinha', () => {
  /*
   * O presente que a maioria manda numa live é o Heart Me — era o joinha
   * quando este projeto começou, e o nome trocado é o que aparece embaixo
   * do desenho na vitrine, na etiqueta do placar e na voz do narrador.
   *
   * O `id` fica em `p1`: ele é a chave do presente na configuração, e quem
   * já tiver um `local.json` salvo continua com o presente ligado à mesma
   * urna. Trocar o id junto com o nome desligaria a urna dele em silêncio.
   */
  const { config } = normalizar({});
  const p1 = config.presentes.find((p) => p.id === 'p1');
  assert.equal(p1.nome, 'Heart Me');
  assert.equal(config.presentes.find((p) => p.id === 'p2').nome, 'Rosa');
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

test('a urna aceita um apelido, e sem ele o nome dela já serve', () => {
  /*
   * O apelido é como o Leonardo chama o candidato na fala: a urna 13 pode se
   * chamar "Lula" no palco e "Lulinha" na boca do narrador — "Lulinha ganhou
   * um voto" é o que ele pediu em 2026-10-15.
   *
   * Ele é OPCIONAL por decisão, e não por preguiça: a frase do voto cai para
   * o nome da urna quando não há apelido, então as urnas do arquivo de hoje
   * continuam funcionando sem que ninguém precise preencher campo nenhum.
   * Como todo texto daqui, ele é aparado — um apelido com espaço nas pontas
   * sairia com o espaço na fala.
   */
  const { config, avisos } = normalizar({
    urnas: { u2: { nome: 'Lula', apelido: '  Lulinha  ' } },
  });
  assert.equal(config.urnas.u2.apelido, 'Lulinha');
  assert.equal(config.urnas.u1.apelido, '', 'o apelido é vazio quando não foi escrito');
  assert.deepEqual(avisos, [], 'o apelido é texto livre: nada aqui vira aviso');
});

test('o desenho do presente é o nome do arquivo, sem a extensão', () => {
  /*
   * O desenho é o do ARQUIVO em `public/img/`: a rosa do Leonardo mora em
   * `rose.webp`, e o config escreve `"desenho": "rose"`. Guardar o nome do
   * arquivo inteiro faria a extensão virar configuração — e trocar o `.webp`
   * por `.png` um dia viraria uma caça a um campo que ninguém lembra.
   *
   * O ponto e a barra são recusados aqui, e não só no navegador: este campo
   * vira endereço de imagem na tela da live, e a configuração é editada à mão.
   * Um valor recusado vira aviso, porque um desenho que não aparece é um
   * defeito que só se vê no ar — a faixa sai dourada e sem a figura.
   */
  const { config, avisos } = normalizar({
    presentes: [
      { id: 'p2', nome: 'Rosa', giftId: '2', urnaId: 'u2', desenho: '  rose  ' },
      { id: 'p3', nome: 'Feio', giftId: '3', urnaId: 'u2', desenho: '../../server/hub' },
      { id: 'p4', nome: 'Sem figura', giftId: '4', urnaId: 'u2' },
    ],
  });
  assert.equal(config.presentes[0].desenho, 'rose');
  assert.equal(config.presentes[1].desenho, '', 'um caminho não pode virar endereço de imagem');
  assert.ok(avisos.some((a) => /desenho/.test(a)), 'a recusa tem que aparecer no boot');
  // Sem desenho escrito, o presente fica sem desenho — e isso não é aviso: o
  // arquivo do Leonardo tem dois presentes, e nenhum deles diz desenho hoje.
  // A faixa dourada sai inteira, sem a figura.
  assert.equal(config.presentes[2].desenho, '');
  assert.ok(!avisos.some((a) => /presentes\.p4/.test(a)), 'faltar desenho não é defeito');
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

/*
 * O preço do presente, que é o segundo pedido do Leonardo, literal: "quando
 * for presente, contar 5x o voto ... e quanto mais caro o caro presente, mais
 * voto".
 *
 * A conta é a RAIZ do preço em moedas, e não o preço. Sem ela, o primeiro
 * diamante da noite decidiria a eleição e o Heart Me — que é o presente de
 * todo mundo — viraria enfeite. Com ela, o caro ganha com folga e o barato
 * ainda pesa. Os testes abaixo prendem as duas metades: o piso de cinco e a
 * curva.
 */

test('um presente vale cinco votos, e cinco é o piso', () => {
  // O piso, e não o teto: a vitrine da cena já prometia "5x" no rótulo de
  // cada presente, e um presente valendo um voto faria a tela prometer uma
  // coisa e o placar entregar outra.
  const urna = { ativo: true, multiplicador: 1 };
  assert.equal(VOTOS_DO_PRESENTE, 5);
  assert.equal(pontosDoPresente({ moedas: 1, ativo: true }, urna), 5);
  assert.equal(votosPeloPreco(1), 5);
});

test('quanto mais caro o presente, mais votos ele vale', () => {
  /*
   * A tabela do `votosPeloPreco`, escrita por extenso de propósito: é o
   * contrato dele com o Leonardo, e um número que muda sem ninguém ver muda o
   * peso de uma eleição inteira. A raiz é o que faz 100 moedas valerem dez
   * vezes o Heart Me, e não cem.
   */
  const esperado = [[1, 5], [4, 10], [9, 15], [25, 25], [100, 50], [1000, 160]];
  for (const [moedas, votos] of esperado) {
    assert.equal(votosPeloPreco(moedas), votos, `${moedas} moedas deveriam valer ${votos} votos`);
  }
});

test('o preço nunca faz um presente valer menos que outro mais barato', () => {
  // A garantia que a tabela não dá sozinha: se um dia a curva mudar, ela não
  // pode virar uma escada quebrada — o presente caro valendo menos que o
  // barato é o defeito que ninguém percebe olhando o código.
  for (let moedas = 1; moedas < 300; moedas += 1) {
    assert.ok(
      votosPeloPreco(moedas + 1) >= votosPeloPreco(moedas),
      `${moedas + 1} moedas valem menos que ${moedas}`,
    );
  }
});

test('preço ausente ou absurdo vale o piso, e não zero', () => {
  /*
   * É o caso do presente que a TikTok inventou ontem e ainda não tem preço no
   * arquivo. Ele conta, e conta os cinco votos de sempre: zero votos seria um
   * presente pago que não fez nada.
   */
  for (const ruim of [undefined, null, 0, -10, 'muito', NaN, '']) {
    assert.equal(votosPeloPreco(ruim), VOTOS_DO_PRESENTE, `preço "${ruim}" não caiu no piso`);
  }
});

test('o `votos` escrito no arquivo manda no preço', () => {
  /*
   * A saída de emergência: quem quiser um presente valendo um número redondo,
   * fora da curva do preço, escreve o número no arquivo e ele vale. Sem esta
   * porta, a única forma de ajustar um presente seria mentir no preço em
   * moedas — e aí o painel mostraria um preço que não é o da TikTok.
   */
  const urna = { ativo: true, multiplicador: 1 };
  assert.equal(pontosDoPresente({ moedas: 1000, votos: 7, ativo: true }, urna), 7);
  // E o zero escrito é uma decisão, não um campo esquecido.
  assert.equal(pontosDoPresente({ moedas: 1000, votos: 0, ativo: true }, urna), 0);
});

test('um `votos` escrito e inválido vira aviso e cai no preço', () => {
  // O arquivo é editado à mão. Um `votos: "muitos"` não pode virar um presente
  // que conta zero — nem um que conta NaN, que é pior: ele sumiria do placar
  // sem deixar rastro em lugar nenhum.
  const { config, avisos } = normalizar({
    urnas: { u1: { id: 'u1', numero: '22' } },
    presentes: [{ id: 'p1', giftId: '1', moedas: 9, urnaId: 'u1', votos: 'muitos' }],
  });
  assert.ok(avisos.some((a) => /votos/.test(a)), 'o arquivo errado não avisou nada');
  assert.equal(config.presentes[0].votos, null, 'o número inválido ficou de pé');
  assert.equal(pontosDoPresente(config.presentes[0], config.urnas.u1), 15,
    'o presente sem número válido não voltou para o preço');
});

test('o presente padrão nasce sem número de votos, e vale pelo preço', () => {
  // Sem `votos` no PADRAO, quem manda é o preço — e é isso que impede a
  // regra nova de nascer desligada num projeto recém-criado.
  for (const p of PADRAO.presentes) {
    assert.equal(p.votos, undefined, `${p.id} nasceu com um número fixo de votos`);
  }
});

/* --------------------------------------------------------------- narração */

/*
 * A configuração da voz.
 *
 * O narrador não pode nascer mudo: uma configuração recém-criada não tem
 * frase nenhuma escrita, e sem os padrões do código o Leonardo teria que
 * inventar todas antes de ouvir a primeira. Por isso "sem nada configurado"
 * aqui quer dizer "com as frases que já vêm no projeto".
 *
 * O outro lado é que lista VAZIA é silêncio deliberado, e não campo
 * esquecido: o painel mostra as frases escritas desde o começo, então apagar
 * tudo é uma decisão — quem quer o narrador calado tem o interruptor, mas
 * quem quer um tipo calado apaga só aquele.
 */

test('sem nada configurado, a narração vem ligada e com as frases do projeto', () => {
  const { config } = normalizar({});
  assert.equal(config.narracao.ativa, true);
  assert.equal(config.narracao.voz, '');
  assert.equal(config.narracao.volume, 1);
  for (const tipo of ['seguidor', 'curtida', 'entrada', 'compartilhou', 'assinatura', 'presente']) {
    assert.ok(config.narracao.falas[tipo]?.length > 0, `a narração nasceu muda em ${tipo}`);
  }
});

test('a narração pode ser desligada', () => {
  assert.equal(normalizar({ narracao: { ativa: false } }).config.narracao.ativa, false);
  // Qualquer coisa que não seja `false` é "ligada": o padrão de um narrador
  // é falar, e um `undefined` vindo de um painel antigo não pode calá-lo.
  assert.equal(normalizar({ narracao: {} }).config.narracao.ativa, true);
  assert.equal(normalizar({ narracao: { ativa: 'sim' } }).config.narracao.ativa, true);
});

test('a velocidade da voz fica dentro do que o Windows aceita', () => {
  /*
   * O SAPI vai de -10 a 10. Um `99` vindo de um campo mal digitado não
   * estoura nada — o `[int]` do PowerShell pega e o `Rate` reclama —, mas o
   * número que o painel mostraria não seria o que está valendo, e isso é
   * pior: ele mexeria no campo e nada mudaria, sem entender por quê.
   */
  assert.equal(normalizar({ narracao: { velocidade: 3 } }).config.narracao.velocidade, 3);
  assert.equal(normalizar({ narracao: { velocidade: -5 } }).config.narracao.velocidade, -5);
  assert.equal(normalizar({ narracao: { velocidade: 99 } }).config.narracao.velocidade, 10);
  assert.equal(normalizar({ narracao: { velocidade: -99 } }).config.narracao.velocidade, -10);
  assert.equal(normalizar({ narracao: { velocidade: 'rápido' } }).config.narracao.velocidade, 0);
  assert.equal(normalizar({ narracao: {} }).config.narracao.velocidade, 0);
});

test('o volume fica entre o mudo e o máximo', () => {
  // Zero é um valor legítimo — é o mudo. O que não pode passar é 7, que o
  // `<audio>` da página obedeceria clipando, e o painel mostraria 7.
  assert.equal(normalizar({ narracao: { volume: 0 } }).config.narracao.volume, 0);
  assert.equal(normalizar({ narracao: { volume: 0.5 } }).config.narracao.volume, 0.5);
  assert.equal(normalizar({ narracao: { volume: 7 } }).config.narracao.volume, 1);
  assert.equal(normalizar({ narracao: { volume: -1 } }).config.narracao.volume, 0);
  assert.equal(normalizar({ narracao: {} }).config.narracao.volume, 1);
});

test('a lista de frases vazia é silêncio, e não o padrão de volta', () => {
  /*
   * A distinção que faz o painel funcionar: uma lista APAGADA cala aquele
   * tipo, e uma lista AUSENTE herda o projeto. Sem ela, o Leonardo apagaria
   * as frases de entrada e elas voltariam sozinhas no próximo salvamento.
   */
  const { config } = normalizar({ narracao: { falas: { entrada: [] } } });
  assert.deepEqual(config.narracao.falas.entrada, []);
  assert.ok(config.narracao.falas.seguidor.length > 0, 'apagar uma calou as outras');
});

test('frase em branco na lista não vira fala vazia', () => {
  // O painel é uma caixa de texto: uma linha em branco no meio é o jeito mais
  // natural de separar grupos, e viraria uma fala muda na fila — atrasando a
  // fala seguinte em um silêncio que ninguém pediu.
  const { config } = normalizar({
    narracao: { falas: { seguidor: ['Valeu, {nome}!', '', '   ', 'Mais um: {nome}'] } },
  });
  assert.deepEqual(config.narracao.falas.seguidor, ['Valeu, {nome}!', 'Mais um: {nome}']);
});

test('frase que não é texto não entra na lista', () => {
  // Um número solto na lista viraria `String(7)` no preenchedor e a live
  // ouviria "7". Recusar é mais barato do que explicar depois.
  const { config } = normalizar({
    narracao: { falas: { seguidor: ['Boa, {nome}', 7, null, { x: 1 }] } },
  });
  assert.deepEqual(config.narracao.falas.seguidor, ['Boa, {nome}']);
});

test('a narração não inventa tipo de fala que não existe', () => {
  // A lista de tipos é fechada no `narracao.js`. Uma chave a mais no arquivo
  // seria uma frase que ninguém nunca fala, guardada para sempre.
  const { config } = normalizar({ narracao: { falas: { dancou: ['Dançou, {nome}'] } } });
  assert.equal(config.narracao.falas.dancou, undefined);
});

test('o padrão da narração é congelado como o resto', () => {
  // Pelo mesmo motivo das urnas: um remendo que escrevesse nos padrões
  // envenenaria todas as leituras seguintes do processo.
  assert.throws(() => { 'use strict'; PADRAO.config.narracao.ativa = false; }, TypeError);
});

test('a espera do número no chat tem prazo, e o prazo é quinze segundos', () => {
  /*
   * O prazo do pedido do Leonardo: "se demorar mais de 15s, avisar por voz".
   * Ele entra na configuração porque o painel mostra o campo, e o painel só
   * mostra o que existe — um número solto no código seria um prazo que o
   * operador não consegue mudar no meio de uma live em que o chat é lento.
   */
  const { config } = normalizar({});
  assert.equal(config.integracao.esperaNumeroSegundos, 15);
});

test('um prazo absurdo não deixa a espera sem prazo', () => {
  // Prazo zero ou negativo venceria no mesmo instante em que o presente
  // chegou: a voz cobraria o número antes de a pessoa ter chance de escrever,
  // e o presente caro pareceria quebrado. Texto ou ausente cai no padrão pelo
  // mesmo motivo.
  assert.equal(normalizar({ integracao: { esperaNumeroSegundos: 0 } }).config.integracao.esperaNumeroSegundos, 15);
  assert.equal(normalizar({ integracao: { esperaNumeroSegundos: -3 } }).config.integracao.esperaNumeroSegundos, 15);
  assert.equal(normalizar({ integracao: { esperaNumeroSegundos: 'logo' } }).config.integracao.esperaNumeroSegundos, 15);
  assert.equal(normalizar({ integracao: {} }).config.integracao.esperaNumeroSegundos, 15);
});

test('um prazo escolhido no painel vale', () => {
  const { config } = normalizar({ integracao: { esperaNumeroSegundos: 30 } });
  assert.equal(config.integracao.esperaNumeroSegundos, 30);
});

/* ------------------------------------------------------- o motor da voz */

test('a voz nasce neural, que é a que soa como gente', () => {
  /*
   * A voz do Windows funciona e é feia: é uma colagem de pedaços gravados, e
   * lê um nome brasileiro com a música de um GPS. A neural é a qualidade que
   * se ouve no Teams — e é o padrão porque o padrão é o que o Leonardo ouve se
   * não mexer em nada, e o que ele ouve tem que ser a melhor das duas.
   */
  const { config } = normalizar({});
  assert.equal(config.narracao.motor, 'edge');
});

test('um motor que o servidor não conhece cai no padrão, e não cala a live', () => {
  /*
   * Este campo é texto livre no arquivo de configuração. Um `"Edge"` com
   * maiúscula, um `"edgi"` de dedo escorregado, um `null` de um painel antigo
   * — nada disso pode deixar a live muda. O valor é aceito só se for um motor
   * que existe; o resto vira o padrão.
   */
  assert.equal(normalizar({ narracao: { motor: 'sapi' } }).config.narracao.motor, 'sapi');
  assert.equal(normalizar({ narracao: { motor: 'Edge' } }).config.narracao.motor, 'edge');
  assert.equal(normalizar({ narracao: { motor: ' SAPI ' } }).config.narracao.motor, 'sapi');
  assert.equal(normalizar({ narracao: { motor: 'edgi' } }).config.narracao.motor, 'edge');
  assert.equal(normalizar({ narracao: { motor: '' } }).config.narracao.motor, 'edge');
  assert.equal(normalizar({ narracao: { motor: 7 } }).config.narracao.motor, 'edge');
});

test('a narração nasce com duas vozes, e não com uma', () => {
  /*
   * O rodízio é o que faz a live deixar de soar como um robô lendo avisos: a
   * mesma frase dita por duas vozes soa como duas pessoas chamando na tela.
   *
   * As duas são neurais (`edge`), que é o motor padrão, e o par é feminina +
   * masculina de propósito: é o contraste que se ouve. Duas femininas de
   * timbres parecidos soariam como uma voz só com defeito.
   */
  const { config } = normalizar({});
  assert.deepEqual(config.narracao.vozes, ['pt-BR-FranciscaNeural', 'pt-BR-AntonioNeural']);
});

test('a lista de vozes aceita o que o Leonardo escreveu, limpa', () => {
  const { config } = normalizar({
    narracao: { vozes: ['  pt-BR-AntonioNeural  ', 'Microsoft Maria Desktop'] },
  });
  assert.deepEqual(config.narracao.vozes, ['pt-BR-AntonioNeural', 'Microsoft Maria Desktop']);
});

test('lista de vozes VAZIA é uma decisão: uma voz só, a de `voz`', () => {
  /*
   * A mesma distinção que as frases fazem, e pelo mesmo motivo: `[]` é alguém
   * dizendo "quero uma voz" — e quem a escolhe é o campo `voz`. Ausente é
   * outra coisa: é o projeto decidindo, e o projeto decide rodízio.
   *
   * Sem esta separação, apagar a lista no arquivo traria as duas vozes de
   * volta no salvamento seguinte, e o Leonardo não teria como pedir uma voz só
   * sem escolher uma voz que ele não quer.
   *
   * Uma lista que só tinha lixo é a MESMA coisa que a lista vazia: quem
   * esvazia uma caixa de texto no painel produz `[""]`, e não `[]`. Resgatar
   * esse caso para o padrão desfaria o pedido — e seria a única regra do
   * arquivo a tratar lixo como erro em vez de como ausência.
   */
  assert.deepEqual(normalizar({ narracao: { vozes: [] } }).config.narracao.vozes, []);
  assert.deepEqual(normalizar({ narracao: { vozes: ['', '  ', null, 7] } }).config.narracao.vozes, []);
  assert.equal(normalizar({}).config.narracao.vozes.length, 2);
});

test('o que não é lista de vozes vira a lista padrão, e não cala a live', () => {
  /*
   * O campo é escrito à mão no arquivo: uma string solta (o erro clássico de
   * quem escreve uma voz só depois de ter aprendido a chave nova), um número,
   * um objeto. Nenhum deles é uma lista, e nenhum deles pode deixar o narrador
   * mudo — todos viram o padrão, que é o pedido de quem nunca escreveu nada.
   */
  assert.deepEqual(normalizar({ narracao: { vozes: 'pt-BR-FranciscaNeural' } }).config.narracao.vozes,
    ['pt-BR-FranciscaNeural', 'pt-BR-AntonioNeural']);
  assert.deepEqual(normalizar({ narracao: { vozes: 7 } }).config.narracao.vozes,
    ['pt-BR-FranciscaNeural', 'pt-BR-AntonioNeural']);
});

test('uma voz só na lista é uma lista de uma, e o rodízio não a perde', () => {
  const { config } = normalizar({ narracao: { vozes: ['pt-BR-ThalitaMultilingualNeural'] } });
  assert.deepEqual(config.narracao.vozes, ['pt-BR-ThalitaMultilingualNeural']);
});
