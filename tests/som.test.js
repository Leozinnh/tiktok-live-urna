/*
 * O som da ultrapassagem, com um AudioContext de mentira.
 *
 * O que se testa aqui não é o timbre — é o TRATO com a Web Audio API, que é
 * onde os erros de verdade moram: um oscilador que nunca é parado fica
 * apitando para sempre, um ganho que não é rampeado estala, e um nó criado
 * antes de o contexto existir derruba a página inteira.
 *
 * O navegador de verdade é conferido pela sonda do painel; aqui o que se
 * prende é o contrato.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarSom, NOTAS_DA_VIRADA } from '../public/js/som.js';

function audioFalso({ estado = 'running' } = {}) {
  let retomadas = 0;
  const osciladores = [];
  const ganhos = [];
  const fontes = [];

  const parametro = () => ({
    valor: null,
    setValueAtTime(v) { this.valor = v; return this; },
    linearRampToValueAtTime() { return this; },
    exponentialRampToValueAtTime() { return this; },
    cancelScheduledValues() { return this; },
  });

  const ctx = {
    state: estado,
    currentTime: 0,
    destination: { nome: 'destino' },
    /*
     * `resume()` NÃO muda o estado aqui, de propósito: no navegador ele é
     * assíncrono e o contexto continua 'suspended' até a promessa resolver —
     * e, sem gesto do usuário, pode nunca resolver. Um dublê que retomasse
     * na hora esconderia justamente o caso do OBS, que é o que este teste
     * existe para prender.
     */
    resume() { retomadas += 1; return Promise.resolve(); },
    createOscillator() {
      const o = {
        type: 'sine',
        frequency: parametro(),
        ligado: false,
        desligado: false,
        connect(destino) { o.destino = destino; return destino; },
        start() { o.ligado = true; },
        stop() { o.desligado = true; },
        addEventListener() {},
      };
      osciladores.push(o);
      return o;
    },
    createGain() {
      const g = {
        gain: parametro(),
        connect(destino) { g.destino = destino; return destino; },
      };
      ganhos.push(g);
      return g;
    },
    /* O CONFIRMA toca um arquivo: o dublê precisa saber decodificar e tocar
       uma fonte de buffer, que são os dois nós que as notas não usam. */
    decodeAudioData() { return Promise.resolve({ duracao: 1.54 }); },
    createBufferSource() {
      const f = {
        buffer: null,
        ligado: false,
        parado: null,
        connect(destino) { f.destino = destino; return destino; },
        start() { f.ligado = true; },
        stop(quando) { f.parado = quando; },
      };
      fontes.push(f);
      return f;
    },
  };
  return { ctx, osciladores, ganhos, fontes, retomadas: () => retomadas };
}

/*
 * O `fetch` do arquivo, substituído pelo tempo do teste.
 *
 * O módulo busca `public/sound/confirm.mp3` na criação do som, e o `fetch` do
 * Node não sabe ler uma URL relativa — sem o dublê, todo teste daqui falharia
 * por um motivo que não é o do módulo. O que se prende é o TRATO: busca uma
 * vez, guarda o buffer, e falha em silêncio.
 */
async function comArquivo(fn, { ok = true } = {}) {
  const original = globalThis.fetch;
  const chamadas = [];
  globalThis.fetch = (url) => {
    chamadas.push(url);
    return Promise.resolve({ ok, status: ok ? 200 : 404, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
  };
  try {
    await fn(chamadas);
  } finally {
    globalThis.fetch = original;
  }
}

/* Deixa as promessas do carregamento assentarem. */
const assentar = () => new Promise((r) => setTimeout(r, 0));

test('sem AudioContext nenhum, tocar não derruba a página', () => {
  /*
   * Este é o caso que mais importa: o som é enfeite e a live é o produto. Se
   * o navegador não tiver Web Audio — ou se a criação do contexto falhar —, o
   * show tem de continuar exatamente igual, só que mudo.
   */
  const som = criarSom({ Contexto: undefined });
  assert.equal(som.ligado, false);
  assert.doesNotThrow(() => som.tocarVirada());
  assert.doesNotThrow(() => som.tocarEmpate());
  assert.doesNotThrow(() => som.tocarVitoria());
});

test('um contexto que estoura na construção não derruba a página', () => {
  // Navegador antigo, ou a cota de contextos de áudio da página estourada.
  const Explodindo = function () { throw new Error('sem audio hoje'); };
  const som = criarSom({ Contexto: Explodindo });
  assert.equal(som.ligado, false);
  assert.doesNotThrow(() => som.tocarVirada());
});

test('a virada toca as notas, e todas são desligadas', () => {
  /*
   * Um oscilador que dá `start` e nunca dá `stop` apita para sempre: o
   * navegador não o recolhe sozinho, e depois de algumas ultrapassagens a
   * live fica com um zumbido por cima de tudo.
   */
  const { ctx, osciladores } = audioFalso();
  const som = criarSom({ Contexto: function () { return ctx; } });
  som.tocarVirada();

  assert.equal(osciladores.length, NOTAS_DA_VIRADA.length);
  for (const o of osciladores) {
    assert.ok(o.ligado, 'o oscilador não foi iniciado');
    assert.ok(o.desligado, 'o oscilador ficou apitando para sempre');
  }
  assert.deepEqual(
    osciladores.map((o) => o.frequency.valor),
    NOTAS_DA_VIRADA.map((n) => n.frequencia),
    'as notas saíram fora de ordem ou com outra frequência',
  );
});

test('as notas da virada sobem', () => {
  // Ultrapassagem é subida. Uma sequência que desce soa como derrota, e o
  // ouvido entende antes de o cérebro conferir o placar.
  for (let i = 1; i < NOTAS_DA_VIRADA.length; i++) {
    assert.ok(NOTAS_DA_VIRADA[i].frequencia > NOTAS_DA_VIRADA[i - 1].frequencia,
      `a nota ${i} não é mais aguda que a anterior`);
  }
});

test('cada som tem o seu ganho, e nenhum divide o do outro', () => {
  // Dois sons no mesmo nó de ganho se atropelam: o segundo `stop` corta o
  // primeiro no meio, e a virada some quando um empate acontece junto.
  const { ctx, osciladores, ganhos } = audioFalso();
  const som = criarSom({ Contexto: function () { return ctx; } });
  som.tocarVirada();
  const depoisDaVirada = ganhos.length;
  som.tocarEmpate();
  assert.ok(ganhos.length > depoisDaVirada, 'o segundo som reusou o ganho do primeiro');
  assert.ok(osciladores.length > NOTAS_DA_VIRADA.length);
});

test('tocar duas vezes seguidas não acumula som nenhum pendurado', () => {
  const { ctx, osciladores } = audioFalso();
  const som = criarSom({ Contexto: function () { return ctx; } });
  som.tocarVirada();
  som.tocarVirada();
  assert.equal(osciladores.filter((o) => !o.desligado).length, 0);
});

test('o contexto suspenso é retomado antes de tocar', () => {
  /*
   * A armadilha do OBS: o navegador nasce com o áudio suspenso esperando um
   * gesto do usuário, e a página de transmissão não recebe gesto nenhum —
   * ninguém clica num browser source. Sem tentar retomar, a primeira
   * ultrapassagem da live sai muda e parece que o som não funciona.
   */
  /*
   * A asserção é sobre a TENTATIVA, e não sobre o estado depois dela: no
   * navegador `resume()` é assíncrono e o contexto continua 'suspended' até a
   * promessa resolver. O que o módulo promete é pedir; se o navegador
   * concede é com ele.
   */
  const { ctx, osciladores, retomadas } = audioFalso({ estado: 'suspended' });
  const som = criarSom({ Contexto: function () { return ctx; } });
  const antes = retomadas();
  som.tocarVirada();
  assert.ok(retomadas() > antes, 'o módulo não pediu para retomar o contexto');
  assert.ok(osciladores.length > 0, 'nada foi agendado');
});

test('calado, não toca nada', () => {
  const { ctx, osciladores } = audioFalso();
  const som = criarSom({ Contexto: function () { return ctx; } });
  som.calar();
  som.tocarVirada();
  som.tocarVitoria();
  assert.equal(osciladores.length, 0);
  assert.equal(som.ligado, false);
});

test('o silêncio é reversível', () => {
  // Um botão de mudo que não volta é uma armadilha: o operador cala o som
  // para atender o telefone e a live fica muda para sempre.
  const { ctx, osciladores } = audioFalso();
  const som = criarSom({ Contexto: function () { return ctx; } });
  som.calar();
  som.voltar();
  som.tocarVirada();
  assert.ok(osciladores.length > 0);
  assert.equal(som.ligado, true);
});

/* ---------- O CONFIRMA: o som que é arquivo ---------- */

test('sem áudio, tocar a confirmação não derruba a página', () => {
  // O mesmo contrato das notas: o som é enfeite, a live é o produto.
  const som = criarSom({ Contexto: undefined });
  assert.doesNotThrow(() => som.tocarConfirmacao());
});

test('o arquivo do CONFIRMA é buscado uma vez, na criação do som', async () => {
  /*
   * Buscar na hora do primeiro voto faria o clique chegar atrasado — som sem
   * causa visível é pior do que silêncio. E buscar a cada voto seria uma
   * requisição por voto, a noite inteira.
   */
  const { ctx } = audioFalso();
  await comArquivo(async (chamadas) => {
    const som = criarSom({ Contexto: function () { return ctx; } });
    await assentar();
    assert.equal(chamadas.length, 1, `buscou ${chamadas.length} vezes`);
    assert.match(chamadas[0], /confirm\.mp3$/);
    som.tocarConfirmacao();
    som.tocarConfirmacao();   // o segundo sai antes do intervalo mínimo
    som.tocarConfirmacao();
    await assentar();
    assert.equal(chamadas.length, 1, 'buscou de novo na hora de tocar');
  });
});

test('o CONFIRMA sai baixo, e num nó de ganho próprio', async () => {
  /*
   * "Toque o barulho baixo" — o pedido, literal. O arquivo é um mp3
   * masterizado (-0,7dB de pico), então o volume tem de ser uma fração
   * pequena: a 1.0 ele passaria por cima da narração e do áudio da live.
   */
  const { ctx, ganhos, fontes } = audioFalso();
  await comArquivo(async () => {
    const som = criarSom({ Contexto: function () { return ctx; } });
    await assentar();
    som.tocarConfirmacao();
    assert.equal(fontes.length, 1, 'o arquivo não foi tocado');
    assert.ok(fontes[0].ligado, 'a fonte não foi iniciada');
    const doClique = ganhos.at(-1);
    assert.ok(doClique.gain.valor > 0 && doClique.gain.valor < 0.5,
      `o clique saiu a ${doClique.gain.valor}: nem mudo, nem por cima da live`);
  });
});

test('numa rajada, o clique anterior sai antes de o novo entrar', async () => {
  /*
   * O arquivo tem 1,5s e o modo lote dispara um voto a cada 260ms por mão.
   * Sem desligar o anterior, cem votos em rajada viram cem cópias
   * sobrepostas — um zumbido, e o clique some dentro dele.
   *
   * A queda de 30ms antes do `stop` é o outro lado: cortar uma onda no meio
   * estala, e o estalo é mais audível que o próprio clique.
   */
  const { ctx, fontes } = audioFalso();
  await comArquivo(async () => {
    const som = criarSom({ Contexto: function () { return ctx; } });
    await assentar();

    // O `currentTime` do dublê é parado: para o segundo clique passar pelo
    // intervalo mínimo, o tempo anda à mão entre um e outro.
    som.tocarConfirmacao();
    ctx.currentTime = 0.5;
    som.tocarConfirmacao();

    assert.equal(fontes.length, 2, 'o segundo clique não tocou');
    assert.equal(fontes[0].parado, 0.55, 'o clique anterior ficou tocando por cima do novo');
    assert.equal(fontes[1].parado, null, 'o clique novo já nasceu parado');
  });
});

test('arquivo faltando não vira erro no console', async () => {
  /*
   * Se alguém renomear o mp3, o certo é a live seguir sem clique — e não a
   * tela do OBS, que não tem onde escrever log, encher o console de erro
   * vermelho que ninguém vai ler.
   */
  const { ctx, fontes } = audioFalso();
  await comArquivo(async () => {
    const som = criarSom({ Contexto: function () { return ctx; } });
    await assentar();
    assert.doesNotThrow(() => som.tocarConfirmacao());
    assert.equal(fontes.length, 0, 'tocou um arquivo que não existe');
  }, { ok: false });
});

test('calado, o CONFIRMA também cala', async () => {
  const { ctx, fontes } = audioFalso();
  await comArquivo(async () => {
    const som = criarSom({ Contexto: function () { return ctx; } });
    await assentar();
    som.calar();
    som.tocarConfirmacao();
    assert.equal(fontes.length, 0, 'tocou com a mesa calada');
  });
});
