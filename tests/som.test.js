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
  };
  return { ctx, osciladores, ganhos, retomadas: () => retomadas };
}

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
