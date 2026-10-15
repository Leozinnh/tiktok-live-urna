import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chaveDoTexto, criarVoz } from '../server/voz.js';

/*
 * A voz do narrador — e por que ela NÃO é a `speechSynthesis` do navegador.
 *
 * A tentação era óbvia: `speechSynthesis.speak()` é uma linha, fala português
 * e não precisa de arquivo nenhum. Ela não funciona aqui, e o motivo não é
 * preferência: o CEF que o OBS embarca não traz motor de fala. `getVoices()`
 * devolve lista vazia para sempre — não é o atraso assíncrono que a
 * documentação do navegador descreve, é ausência mesmo —, e mesmo que
 * falasse, o áudio dela não é capturado com "Control audio via OBS"
 * (obsproject/obs-browser#404).
 *
 * O que o OBS captura é um `<audio>`. Então o áudio precisa EXISTIR como
 * arquivo, e quem o produz é o sintetizador do próprio Windows, pelo
 * PowerShell — que já está instalado em qualquer máquina que rode OBS, tem
 * voz pt-BR de fábrica, e não custa uma dependência.
 *
 * A medida que decidiu o desenho: um processo novo leva ~1,9 s até a primeira
 * frase (quase tudo partida do .NET), e ~90 ms por frase depois disso. Daí o
 * processo de vida longa: 1,9 s uma vez, na subida do servidor, em vez de a
 * cada seguidor.
 */

/* ------------------------------------------------------------- a chave */

test('a chave do texto é estável, e distingue frases diferentes', () => {
  // É o nome do arquivo em cache. Se ela oscilasse entre duas chamadas, a
  // mesma frase geraria um arquivo novo a cada vez e o cache não existiria.
  assert.equal(chaveDoTexto('Bia acabou de seguir'), chaveDoTexto('Bia acabou de seguir'));
  assert.notEqual(chaveDoTexto('Bia acabou de seguir'), chaveDoTexto('Ana acabou de seguir'));
  assert.match(chaveDoTexto('qualquer coisa'), /^[0-9a-f]{16}$/);
});

test('a chave não se importa com espaço nas pontas', () => {
  // O texto vem de um modelo de frase montado no servidor, e um espaço a
  // mais num deles criaria um segundo arquivo para a mesma fala.
  assert.equal(chaveDoTexto('  Bia seguiu  '), chaveDoTexto('Bia seguiu'));
});

/* ---------------------------------------------------------- a síntese */

/*
 * O resto só roda onde há Windows para falar. Fora dele o teste é pulado, e
 * não falsamente aprovado: uma suíte verde numa máquina onde a voz não existe
 * não prova nada sobre a voz.
 */
const soWindows = process.platform === 'win32';

test('a voz devolve um WAV de verdade para uma frase', { skip: !soWindows }, async () => {
  const pasta = await mkdtemp(join(tmpdir(), 'urna-voz-'));
  const voz = criarVoz({ pasta });
  try {
    const r = await voz.sintetizar('Bia acabou de seguir a live');
    assert.ok(r, 'a síntese devolveu nada');
    assert.ok(Buffer.isBuffer(r.bytes), 'não voltou um Buffer');
    // RIFF....WAVE é o cabeçalho de todo WAV. Sem ele o `<audio>` da página
    // dispara `error` e a narração fica muda sem ninguém saber por quê.
    assert.equal(r.bytes.subarray(0, 4).toString('ascii'), 'RIFF', 'não é um WAV');
    assert.equal(r.bytes.subarray(8, 12).toString('ascii'), 'WAVE', 'não é um WAV');
    // Uma fala de dois segundos em 22 kHz tem centenas de KB. Um arquivo de
    // poucos bytes passaria no teste de cabeçalho e não teria som nenhum.
    assert.ok(r.bytes.length > 20_000, `WAV pequeno demais: ${r.bytes.length} bytes`);
  } finally {
    voz.parar();
    await rm(pasta, { recursive: true, force: true });
  }
});

test('o acento atravessa a ida e a volta sem virar interrogação', { skip: !soWindows }, async () => {
  /*
   * Nome brasileiro tem acento, e o caminho até o PowerShell é o lugar
   * clássico onde ele morre: o `stdin` do Windows PowerShell 5.1 não é UTF-8
   * por padrão, e "Conceição" chega como "Concei??o" — ou pior, "ConceiÃ§Ã£o".
   * É o defeito mais silencioso possível: sai som, sai bonito, e sai errado.
   *
   * A prova é o ECO. O PowerShell devolve o que recebeu, e a comparação é
   * byte a byte contra o que foi mandado. Não prova que o sintetizador
   * pronuncia bem — prova que o texto chegou inteiro, que é a parte que este
   * projeto controla.
   */
  const pasta = await mkdtemp(join(tmpdir(), 'urna-voz-'));
  const voz = criarVoz({ pasta });
  const frase = 'Ana Júlia Conceição acabou de seguir';
  try {
    const r = await voz.sintetizar(frase);
    assert.ok(r, 'a síntese devolveu nada');
    assert.equal(r.eco, frase, 'o texto voltou diferente do que foi mandado');
  } finally {
    voz.parar();
    await rm(pasta, { recursive: true, force: true });
  }
});

test('a segunda frase não paga a partida de novo', { skip: !soWindows }, async () => {
  /*
   * É a razão de o processo ser de vida longa. Se cada frase custasse os
   * ~1,9 s de partida, o narrador anunciaria um seguidor quase dois segundos
   * depois do follow — e num pico de follows a fila de fala nunca alcançaria
   * a live.
   *
   * O limite é generoso de propósito: o que ele pega é a diferença entre
   * "reaproveitou" e "subiu outro processo", que é de uma ordem de grandeza.
   */
  const pasta = await mkdtemp(join(tmpdir(), 'urna-voz-'));
  const voz = criarVoz({ pasta });
  try {
    const primeira = Date.now();
    await voz.sintetizar('primeira frase');
    const custoDaPrimeira = Date.now() - primeira;

    const segunda = Date.now();
    await voz.sintetizar('segunda frase completamente diferente');
    const custoDaSegunda = Date.now() - segunda;

    assert.ok(
      custoDaSegunda < custoDaPrimeira,
      `a segunda (${custoDaSegunda}ms) não foi mais rápida que a primeira (${custoDaPrimeira}ms)`,
    );
  } finally {
    voz.parar();
    await rm(pasta, { recursive: true, force: true });
  }
});

test('a chave da fala muda com a voz e com a velocidade', () => {
  /*
   * O arquivo em disco é o cache, e a chave dele é o texto. Sem a voz e a
   * velocidade dentro da chave, o Leonardo trocaria a voz no painel e
   * continuaria ouvindo a antiga — do cache, para sempre, sem nada acusar
   * erro. É o mesmo defeito da frase editada que não vale, e é pior, porque
   * aqui o sintetizador nem chega a ser chamado.
   *
   * O padrão NÃO pode mudar a chave: o cache que já está no disco é do
   * projeto, e uma chave nova para a mesma fala jogaria fora tudo o que já
   * foi sintetizado.
   */
  const texto = 'Bia acabou de seguir a live';
  assert.equal(chaveDoTexto(texto, {}), chaveDoTexto(texto), 'o ajuste vazio partiu o cache em dois');
  assert.equal(chaveDoTexto(texto, { nome: '', velocidade: 0 }), chaveDoTexto(texto));

  const maria = chaveDoTexto(texto, { nome: 'Maria', velocidade: 0 });
  assert.notEqual(maria, chaveDoTexto(texto));
  assert.notEqual(maria, chaveDoTexto(texto, { nome: 'Daniel', velocidade: 0 }), 'trocar a voz não trocou o arquivo');
  assert.notEqual(maria, chaveDoTexto(texto, { nome: 'Maria', velocidade: 4 }), 'trocar a velocidade não trocou o arquivo');
});

test('trocar a voz no painel vale para a frase seguinte', { skip: !soWindows }, async () => {
  /*
   * A velocidade e a voz são passadas ao sintetizador na hora em que ele
   * sobe, e o processo é de vida longa — então mudar o campo no painel não
   * muda nada no processo que já está de pé. Sem esta conferência, o Leonardo
   * arrastaria o controle de velocidade, salvaria, e continuaria ouvindo a
   * voz de antes até reiniciar o servidor.
   */
  const pasta = await mkdtemp(join(tmpdir(), 'urna-voz-'));
  const ajustes = { velocidade: 0 };
  const voz = criarVoz({ pasta, velocidade: () => ajustes.velocidade });
  try {
    const antes = await voz.sintetizar('a mesma frase de sempre');
    const partidasAntes = voz.partidas;

    ajustes.velocidade = 6;
    const depois = await voz.sintetizar('a mesma frase de sempre');

    assert.equal(voz.partidas, partidasAntes + 1, 'o sintetizador antigo ficou de pé com a velocidade antiga');
    assert.notEqual(depois.arquivo, antes.arquivo, 'a fala nova saiu do arquivo da velocidade antiga');
  } finally {
    voz.parar();
    await rm(pasta, { recursive: true, force: true });
  }
});

test('texto vazio não vira som nem erro', { skip: !soWindows }, async () => {
  // Um modelo de frase com o nome em branco produz " acabou de seguir". Sem
  // esta guarda o servidor sintetizaria silêncio e a página tocaria um
  // arquivo mudo, atrasando a fila de fala de todo mundo.
  const pasta = await mkdtemp(join(tmpdir(), 'urna-voz-'));
  const voz = criarVoz({ pasta });
  try {
    assert.equal(await voz.sintetizar(''), null);
    assert.equal(await voz.sintetizar('   '), null);
  } finally {
    voz.parar();
    await rm(pasta, { recursive: true, force: true });
  }
});

test('parar duas vezes não estoura, e falar depois de parar devolve silêncio', { skip: !soWindows }, async () => {
  /*
   * O servidor fica de pé a noite inteira e é derrubado com Ctrl+C, que
   * chega mais de uma vez e a qualquer momento. Um `parar()` que estoura na
   * segunda chamada derrubaria o processo no meio do encerramento — e o
   * Windows mostraria ao Leonardo um erro em vermelho ao desligar, sem nada
   * de errado acontecendo.
   *
   * Depois de parada, a voz devolve `null` em vez de subir outro processo: o
   * `parar` é deliberado, e ressuscitar sozinho desfaria o encerramento.
   */
  const pasta = await mkdtemp(join(tmpdir(), 'urna-voz-'));
  const voz = criarVoz({ pasta });
  try {
    assert.ok(await voz.sintetizar('alguma coisa'), 'a primeira frase devia sair');
  } finally {
    voz.parar();
    voz.parar();
  }
  assert.equal(await voz.sintetizar('depois de parar'), null);
  await rm(pasta, { recursive: true, force: true });
});

test('um processo morto por fora é ressuscitado na frase seguinte', { skip: !soWindows }, async () => {
  /*
   * O caso que separa "parar porque eu mandei" de "morreu sozinho". Um
   * sintetizador que cai — memória, atualização do Windows, alguém fechando
   * no gerenciador de tarefas — deixaria a live inteira sem narração se a
   * única saída fosse reiniciar o servidor no meio da transmissão.
   */
  const pasta = await mkdtemp(join(tmpdir(), 'urna-voz-'));
  const voz = criarVoz({ pasta });
  try {
    assert.ok(await voz.sintetizar('antes de morrer'), 'a primeira frase devia sair');
    voz.matarProcessoParaTeste();
    const r = await voz.sintetizar('depois de morrer');
    assert.ok(r, 'a voz não se recuperou da morte do processo');
    assert.equal(r.bytes.subarray(0, 4).toString('ascii'), 'RIFF');
  } finally {
    voz.parar();
    await rm(pasta, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------- o cache */

test('a mesma frase não é sintetizada duas vezes', { skip: !soWindows }, async () => {
  /*
   * Numa live os nomes repetem: os mesmos seguidores voltam, e um apelido
   * conhecido vira arquivo em disco na primeira vez. O contador de sínteses
   * existe na própria `voz` para o teste poder perguntar sem cronômetro —
   * medir tempo aqui seria um teste que passa em máquina rápida e falha em
   * máquina lenta, que é a pior espécie de teste.
   */
  const pasta = await mkdtemp(join(tmpdir(), 'urna-voz-'));
  const voz = criarVoz({ pasta });
  try {
    const a = await voz.sintetizar('frase repetida');
    const antes = voz.sinteses;
    const b = await voz.sintetizar('frase repetida');
    assert.equal(voz.sinteses, antes, 'sintetizou de novo em vez de reaproveitar o arquivo');
    assert.deepEqual(b.bytes, a.bytes, 'o arquivo devolvido mudou');
  } finally {
    voz.parar();
    await rm(pasta, { recursive: true, force: true });
  }
});

test('o cache em disco sobrevive ao processo', { skip: !soWindows }, async () => {
  /*
   * O arquivo é a memória do narrador. Depois de reiniciar o servidor, o
   * primeiro seguidor de apelido conhecido tem que sair na hora — senão a
   * primeira narração de toda live paga a partida de novo, justo no minuto
   * em que tem mais gente chegando.
   */
  const pasta = await mkdtemp(join(tmpdir(), 'urna-voz-'));

  const primeira = criarVoz({ pasta });
  await primeira.sintetizar('a mesma frase de sempre');
  primeira.parar();

  const segunda = criarVoz({ pasta });
  try {
    const r = await segunda.sintetizar('a mesma frase de sempre');
    assert.equal(segunda.sinteses, 0, 'sintetizou de novo o que já estava no disco');
    assert.ok(r.bytes.length > 20_000);
  } finally {
    segunda.parar();
    await rm(pasta, { recursive: true, force: true });
  }
});
