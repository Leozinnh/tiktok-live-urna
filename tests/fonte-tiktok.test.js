/*
 * A fonte da TikTok — Etapa 7.
 *
 * O que está sob teste aqui NÃO é a TikTok. É a costura entre duas linguagens:
 * um processo Python que fala JSON por uma linha de comando, e o motor em
 * Node que precisa transformar essas linhas em votos.
 *
 * A costura é onde moram os defeitos, e todos eles têm a mesma cara — a live
 * parece funcionar e não conta voto:
 *
 *   - um JSON cortado em duas leituras do cano, que vira duas linhas quebradas
 *     e some sem erro;
 *   - uma linha de log da biblioteca no meio do JSON, que derruba o parser;
 *   - um presente que chega com `giftId` de um catálogo que o painel não tem;
 *   - o processo que morre às 3 da manhã e ninguém levanta de novo.
 *
 * É por isso que a fonte aceita o `iniciarProcesso` por parâmetro: sem isso,
 * testar qualquer uma dessas coisas exigiria estar numa live de verdade.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { criarFonteTiktok } from '../server/sources/tiktok.js';
import { criarTrocaDeFontes } from '../server/sources/troca.js';
import { montarMotor } from '../server/index.js';
import { criarHub } from '../server/hub.js';
import { criarTally } from '../server/tally.js';
import { abrirBanco } from '../server/db.js';
import { carregar, normalizar } from '../server/config.js';
import { criarFonte } from '../server/sources/base.js';

/**
 * Um processo de mentira com canos de VERDADE.
 *
 * `PassThrough` e não um array de strings: o defeito que mais importa aqui é
 * o pedaço de JSON que chega partido, e ele só existe porque um cano entrega
 * bytes, não linhas. Um dublê que entregasse linhas prontas esconderia
 * exatamente o defeito que este arquivo existe para pegar.
 */
function processoFalso() {
  const p = new EventEmitter();
  p.stdout = new PassThrough();
  p.stderr = new PassThrough();
  p.morto = false;
  p.kill = () => {
    p.morto = true;
    p.emit('exit', 0, null);
  };
  return p;
}

/**
 * Uma fonte ligada a um processo de mentira, e o que a sonda precisa ver.
 *
 * A `espera` é capturada em vez de dormida: o backoff de verdade é de segundos
 * e o teste não pode esperar por ele. Ela devolve uma promessa que só resolve
 * quando o teste mandar — assim o teste decide quando a próxima tentativa
 * acontece, em vez de torcer para que ela já tenha acontecido.
 */
function montarPonte({ usuario = 'fulano' } = {}) {
  const filhos = [];
  const eventos = [];
  const status = [];
  const esperas = [];

  const fonte = criarFonteTiktok({
    usuario,
    iniciarProcesso: () => {
      const p = processoFalso();
      filhos.push(p);
      return p;
    },
    espera: (ms) => new Promise((resolve) => esperas.push({ ms, resolve })),
  });

  fonte.aoEvento((e) => eventos.push(e));
  fonte.aoStatus((s) => status.push(s));
  return { fonte, filhos, eventos, status, esperas, atual: () => filhos.at(-1) };
}

/** Manda um pedaço cru pelo cano, como o cano faria. */
function falar(filho, texto) {
  filho.stdout.write(texto);
}

/** Deixa o laço de leitura do fluxo rodar. */
const respirar = () => new Promise((r) => setImmediate(r));

/* ------------------------------------------------------- o caminho feliz */

test('um presente da ponte vira um voto, com o presente e quem mandou', async () => {
  const p = montarPonte();
  p.fonte.iniciar();
  falar(p.atual(), '{"tipo":"presente","userId":"u1","usuario":"Ana",'
    + '"giftId":"5655","giftNome":"Rosa","combo":3,"comboIndex":0}\n');
  await respirar();

  assert.equal(p.eventos.length, 1, 'o presente não chegou');
  assert.deepEqual(p.eventos[0], {
    tipo: 'presente',
    plataforma: 'tiktok',
    userId: 'u1',
    usuario: 'Ana',
    em: p.eventos[0].em,
    giftId: '5655',
    giftNome: 'Rosa',
    combo: 3,
    comboIndex: 0,
  });
  assert.ok(Number.isFinite(p.eventos[0].em), 'sem carimbo de tempo');
});

test('a plataforma é tiktok, e não simulador', async () => {
  const p = montarPonte();
  p.fonte.iniciar();
  falar(p.atual(), '{"tipo":"seguidor","userId":"u9","usuario":"Bia"}\n');
  await respirar();

  assert.equal(p.eventos[0].plataforma, 'tiktok',
    'um evento da live real com a etiqueta do simulador é uma mentira no log');
});

/* ------------------------------------------ as duas armadilhas do cano */

test('um JSON partido em dois pedaços do cano ainda vira um evento', async () => {
  const p = montarPonte();
  p.fonte.iniciar();
  // É assim que um cano entrega: bytes, e o corte cai onde cair.
  falar(p.atual(), '{"tipo":"presente","userId":"u1","usuario":"A');
  await respirar();
  assert.equal(p.eventos.length, 0, 'meia linha não é evento');

  falar(p.atual(), 'na","giftId":"5655","combo":1}\n');
  await respirar();

  assert.equal(p.eventos.length, 1, 'o evento partido se perdeu');
  assert.equal(p.eventos[0].usuario, 'Ana');
});

test('o log da biblioteca no meio do JSON não derruba a leitura', async () => {
  const p = montarPonte();
  p.fonte.iniciar();
  const filho = p.atual();
  // Uma linha de log crua e uma linha vazia no meio: as duas acontecem num
  // processo Python de verdade, e as duas não são evento.
  falar(filho, 'INFO:tiktok.conexao: tentando de novo\n');
  falar(filho, '\n');
  falar(filho, '{"tipo":"presente","userId":"u1","usuario":"Ana","giftId":"1","combo":1}\n');
  falar(filho, 'WARNING: algo aconteceu\n');
  falar(filho, '{"tipo":"seguidor","userId":"u2","usuario":"Bia"}\n');
  await respirar();

  assert.equal(p.eventos.length, 2, 'o log comeu um evento');
  assert.equal(p.eventos[1].usuario, 'Bia');
});

test('uma linha que é JSON mas não é evento não vira voto', async () => {
  const p = montarPonte();
  p.fonte.iniciar();
  const filho = p.atual();
  filho.stdout.write('{"tipo":"coisa-que-nao-existe","userId":"u1"}\n');
  // Presente sem `giftId` é o caso perigoso: contaria para a urna errada.
  filho.stdout.write('{"tipo":"presente","userId":"u1","usuario":"Ana"}\n');
  filho.stdout.write('{"tipo":"presente","userId":"u2","giftId":"7","combo":1}\n');
  await respirar();

  assert.equal(p.eventos.length, 1, 'passou coisa que não era evento');
  assert.equal(p.eventos[0].userId, 'u2');
});

/* ------------------------------------------------------- o estado da ponte */

test('a ponte diz quando está na live, e a fonte avisa quem olha', async () => {
  const p = montarPonte();
  p.fonte.iniciar();
  assert.equal(p.fonte.conectada, false, 'nasceu conectada sem provar nada');

  falar(p.atual(), '{"ponte":"status","conectada":true,"detalhe":"na live de @fulano"}\n');
  await respirar();

  assert.equal(p.fonte.conectada, true);
  assert.equal(p.fonte.status().detalhe, 'na live de @fulano');
  assert.ok(p.status.length >= 1, 'ninguém foi avisado da mudança');
});

test('o painel sabe por que não conectou, mesmo sem nunca ter conectado', async () => {
  const p = montarPonte();
  p.fonte.iniciar();
  /*
   * Este é o caso que a sonda pegou no ar, e é o pior possível.
   *
   * A fonte nunca esteve conectada, então `conectada` continua `false` — e uma
   * base que só avisa quando o estado MUDA não avisa nada. No painel, o
   * operador que digitou o @ errado veria "sem live conectada" para sempre,
   * sem uma palavra sobre o nome estar errado. É a única mensagem que ele
   * precisa ler, e era a única que não chegava.
   */
  falar(p.atual(), '{"ponte":"status","conectada":false,'
    + '"detalhe":"não existe usuário @fulano no TikTok — confira o nome"}\n');
  await respirar();

  assert.ok(p.status.length >= 1, 'o motivo não chegou a ninguém');
  assert.match(p.fonte.status().detalhe, /não existe usuário/);
});

test('um @ que não existe não fica tentando para sempre', async () => {
  const p = montarPonte();
  p.fonte.iniciar();
  // A ponte avisa que não adianta insistir e sai. Insistir num @ errado gasta
  // cota do servidor de assinatura e leva a um 429 — que depois derruba
  // também a tentativa CERTA, quando o Leonardo corrigir o nome.
  falar(p.atual(), '{"ponte":"status","conectada":false,'
    + '"detalhe":"não existe usuário @fulano","fim":true}\n');
  await respirar();
  p.atual().emit('exit', 0, null);
  await respirar();

  assert.equal(p.filhos.length, 1, 'ficou levantando uma ponte que nunca vai conectar');
  assert.equal(p.esperas.length, 0, 'agendou uma tentativa que não faz sentido');
});

test('o motivo da queda chega ao painel, e não só um "desconectado"', async () => {
  const p = montarPonte();
  p.fonte.iniciar();
  falar(p.atual(), '{"ponte":"status","conectada":true,"detalhe":"na live"}\n');
  falar(p.atual(), '{"ponte":"status","conectada":false,"detalhe":"a live encerrou"}\n');
  await respirar();

  assert.equal(p.fonte.conectada, false);
  assert.equal(p.fonte.status().detalhe, 'a live encerrou',
    'o painel precisa dizer POR QUE caiu, ou o operador não sabe o que fazer');
});

/* ----------------------------------------------- o processo que morre */

test('quando a ponte morre, a fonte levanta outra', async () => {
  const p = montarPonte();
  p.fonte.iniciar();
  assert.equal(p.filhos.length, 1);

  p.atual().emit('exit', 1, null);
  await respirar();

  // Primeiro ela espera — e é a espera que o teste segura na mão, porque o
  // backoff de verdade é de segundos.
  assert.equal(p.filhos.length, 1, 'levantou outra sem esperar');
  assert.equal(p.esperas.length, 1, 'não agendou tentativa nenhuma');
  p.esperas[0].resolve();
  await respirar();

  assert.equal(p.filhos.length, 2, 'a ponte morreu e ninguém levantou outra');
  assert.equal(p.fonte.conectada, false, 'sem processo, não está conectada');
});

test('a espera antes de tentar de novo cresce, e para de crescer', async () => {
  const p = montarPonte();
  p.fonte.iniciar();

  // Cinco mortes seguidas, cada uma passando pela espera anterior.
  for (let i = 0; i < 5; i++) {
    p.atual().emit('exit', 1, null);
    await respirar();
    p.esperas.at(-1)?.resolve();
    await respirar();
  }

  const tempos = p.esperas.map((e) => e.ms);
  assert.ok(tempos.length >= 4, `esperou de menos: ${tempos.join(',')}`);
  assert.ok(tempos[1] > tempos[0], `não cresceu: ${tempos.join(',')}`);
  assert.ok(Math.max(...tempos) <= 60_000, `esperaria demais: ${tempos.join(',')}`);
});

test('parar mata o processo e não levanta mais nenhum', async () => {
  const p = montarPonte();
  p.fonte.iniciar();
  const filho = p.atual();

  p.fonte.parar();
  await respirar();

  assert.equal(filho.morto, true, 'o Python ficou rodando depois de parar');
  assert.equal(p.fonte.conectada, false);

  // E o `exit` que o processo morto ainda vai emitir não pode virar uma
  // ressuscitação: é isso que faz a diferença entre parar e reiniciar.
  filho.emit('exit', 0, null);
  await respirar();
  assert.equal(p.filhos.length, 1, 'levantou um processo depois de parar');
});

test('não dá para iniciar duas vezes e ficar com dois Pythons', async () => {
  const p = montarPonte();
  p.fonte.iniciar();
  const segunda = p.fonte.iniciar();
  await respirar();

  assert.equal(segunda, false, 'o segundo iniciar devia dizer que não fez nada');
  assert.equal(p.filhos.length, 1, 'dois processos falando pelo mesmo motor');
});

/* ----------------------------------------- sem usuário, sem processo */

test('sem o nome da live, a fonte não sobe processo e diz o que falta', () => {
  const p = montarPonte({ usuario: '' });
  p.fonte.iniciar();

  assert.equal(p.filhos.length, 0, 'subiu um Python que não teria o que fazer');
  assert.equal(p.fonte.conectada, false);
  assert.match(p.fonte.status().detalhe, /usuário/i,
    'o painel tem que dizer que falta preencher o nome da live');
});

/* ------------------------------------------------- a costura com o motor */

test('o motor escolhe a fonte pela configuração', async () => {
  const { config } = await carregar(null);
  const motor = montarMotor({
    config: { ...config, integracao: { modo: 'tiktok', usuario: '' } },
    caminhoDoBanco: ':memory:',
    aoSalvar: null,
  });
  try {
    assert.equal(motor.fonte.modo, 'tiktok',
      'a configuração mandou usar a live real e o motor continuou no simulador');
  } finally {
    motor.fonte.parar();
    motor.db.fechar();
  }
});

test('a configuração padrão continua sendo o simulador', async () => {
  const { config } = await carregar(null);
  const motor = montarMotor({ config, caminhoDoBanco: ':memory:', aoSalvar: null });
  try {
    assert.equal(motor.fonte.modo, 'simulador',
      'quem não pediu live real não pode receber uma');
  } finally {
    motor.fonte.parar();
    motor.db.fechar();
  }
});

test('um presente da ponte conta voto de verdade no placar', async () => {
  const { config } = await carregar(null);
  // O presente que o painel conhece, e a urna para onde ele aponta.
  const presente = config.presentes.find((p) => p.ativo !== false);
  assert.ok(presente, 'a configuração padrão precisa ter um presente ativo');

  const ponte = criarFonteTiktok({
    usuario: 'fulano',
    iniciarProcesso: () => processoFalso(),
    espera: () => new Promise(() => {}),
  });

  const motor = montarMotor({
    config: { ...config, integracao: { modo: 'tiktok', usuario: 'fulano' } },
    caminhoDoBanco: ':memory:',
    aoSalvar: null,
    fonte: ponte,
  });

  try {
    ponte.emitir({
      tipo: 'presente',
      plataforma: 'tiktok',
      userId: 'u1',
      usuario: 'Ana',
      giftId: String(presente.giftId),
      giftNome: presente.nome,
      combo: 2,
      comboIndex: 0,
      em: Date.now(),
    });

    const urnas = motor.tally.estado().urnas;
    const alvo = urnas.find((u) => u.id === presente.urnaId);
    assert.equal(alvo.votos, 2,
      'o presente chegou pela ponte e não virou voto — é o defeito que não deixa rastro');
  } finally {
    motor.fonte.parar();
    motor.db.fechar();
  }
});

/* ------------------------------------ trocar de fonte com a live no ar */

/**
 * A troca de fonte pelo painel, com o hub no meio.
 *
 * O caminho testado é o do Leonardo, e não um atalho: ele abre a aba
 * Integração, muda o modo, salva — e a live passa a contar pela fonte nova
 * sem ninguém reiniciar nada. Ele já disse que não quer reiniciar, e o meio
 * de uma transmissão é o pior momento possível para descobrir que precisa.
 *
 * As fontes são de mentira, mas a troca, o hub e a contagem são de verdade.
 */
function montarComTroca() {
  const db = abrirBanco(':memory:');
  const { config } = normalizar({});
  const tally = criarTally({ db, config });
  tally.abrirRodada({ iniciadaEm: 1000 });

  const criadas = [];
  const troca = criarTrocaDeFontes({
    config,
    criar: (cfg) => {
      const f = criarFonte({
        modo: cfg?.integracao?.modo === 'tiktok' ? 'tiktok' : 'simulador',
      });
      f.usuario = String(cfg?.integracao?.usuario ?? '');
      f.paradas = 0;
      f.iniciada = false;
      f.iniciar = () => { f.iniciada = true; return true; };
      f.parar = () => { f.paradas += 1; return true; };
      criadas.push(f);
      return f;
    },
  });

  const hub = criarHub({ tally, fonte: troca, config, aoSalvar: null, agora: () => 1000 });
  troca.iniciar();
  return { db, tally, troca, hub, criadas };
}

test('mudar o modo no painel troca a fonte sem reiniciar o servidor', () => {
  const { hub, troca, criadas } = montarComTroca();
  assert.equal(troca.modo, 'simulador');

  const admin = { papel: 'admin', recebidas: [], enviar(t) { this.recebidas.push(JSON.parse(t)); } };
  const cliente = hub.conectar(admin);
  cliente.receber(JSON.stringify({
    tipo: 'config.update',
    config: { integracao: { modo: 'tiktok', usuario: 'fulano' } },
  }));

  assert.equal(troca.modo, 'tiktok', 'o painel salvou e a fonte continuou a antiga');
  assert.equal(criadas.length, 2);
});

test('a fonte antiga é parada quando a nova entra', () => {
  const { hub, criadas } = montarComTroca();
  const admin = { papel: 'admin', recebidas: [], enviar(t) { this.recebidas.push(JSON.parse(t)); } };
  const cliente = hub.conectar(admin);
  cliente.receber(JSON.stringify({
    tipo: 'config.update',
    config: { integracao: { modo: 'tiktok', usuario: 'fulano' } },
  }));

  assert.equal(criadas[0].paradas, 1,
    'a fonte antiga ficou de pé: dois processos contando o mesmo presente');
  assert.equal(criadas[1].iniciada, true, 'a fonte nova não foi ligada');
});

test('corrigir o nome da live levanta a ponte de novo, sem reiniciar', () => {
  const { hub, troca, criadas } = montarComTroca();
  const admin = { papel: 'admin', recebidas: [], enviar(t) { this.recebidas.push(JSON.parse(t)); } };
  const cliente = hub.conectar(admin);

  // O Leonardo erra o nome e salva.
  cliente.receber(JSON.stringify({
    tipo: 'config.update',
    config: { integracao: { modo: 'tiktok', usuario: 'fulano_errado' } },
  }));
  assert.equal(criadas.length, 2);

  // Depois corrige. A fonte de antes desistiu do nome errado e está parada;
  // sem esta troca, ele teria que reiniciar o servidor com a live no ar.
  cliente.receber(JSON.stringify({
    tipo: 'config.update',
    config: { integracao: { modo: 'tiktok', usuario: 'fulano' } },
  }));

  assert.equal(troca.modo, 'tiktok');
  assert.equal(criadas.length, 3, 'corrigir o nome não levantou a ponte de novo');
  assert.equal(criadas.at(-1).usuario, 'fulano');
});

test('salvar de novo o mesmo nome não derruba a conexão que está de pé', () => {
  const { hub, criadas } = montarComTroca();
  const admin = { papel: 'admin', recebidas: [], enviar(t) { this.recebidas.push(JSON.parse(t)); } };
  const cliente = hub.conectar(admin);
  const salvar = (cfg) => cliente.receber(JSON.stringify({ tipo: 'config.update', config: cfg }));

  salvar({ integracao: { modo: 'tiktok', usuario: 'fulano' } });
  assert.equal(criadas.length, 2);
  // Salvar qualquer OUTRA coisa — o tempo da rodada, uma frase — não pode
  // derrubar a live: o `config.changed` chega a cada mudança de aba salva.
  salvar({ rodada: { duracaoSegundos: 120 } });
  salvar({ integracao: { modo: 'tiktok', usuario: 'fulano' } });

  assert.equal(criadas.length, 2,
    'salvar sem mudar nada derrubou a conexão — e o Leonardo salva o tempo todo');
});
