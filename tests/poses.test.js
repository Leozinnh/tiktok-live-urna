import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POSES, interpolarPose, poseParaTransformacoes, JUNTAS } from '../public/js/hand/poses.js';

test('existem as seis poses que a coreografia usa', () => {
  for (const nome of ['repouso', 'apontando', 'pressionando', 'segurando', 'inserindo', 'retraindo']) {
    assert.ok(POSES[nome], `falta a pose "${nome}"`);
  }
});

test('toda pose declara todas as juntas conhecidas', () => {
  for (const [nome, pose] of Object.entries(POSES)) {
    for (const junta of JUNTAS) {
      assert.ok(typeof pose.juntas[junta] === 'number', `${nome} não define a junta ${junta}`);
    }
  }
});

test('toda pose declara posição do pulso', () => {
  for (const [nome, pose] of Object.entries(POSES)) {
    assert.ok('x' in pose.pulso && 'y' in pose.pulso && 'rot' in pose.pulso, `${nome} não define o pulso`);
  }
});

test('interpolar no início devolve a pose A', () => {
  const p = interpolarPose(POSES.repouso, POSES.pressionando, 0);
  assert.deepEqual(p.juntas, POSES.repouso.juntas);
});

test('interpolar no fim devolve a pose B', () => {
  const p = interpolarPose(POSES.repouso, POSES.pressionando, 1);
  for (const junta of JUNTAS) {
    assert.equal(p.juntas[junta], POSES.pressionando.juntas[junta]);
  }
});

test('interpolar no meio devolve a média das juntas', () => {
  const a = POSES.repouso;
  const b = POSES.pressionando;
  const p = interpolarPose(a, b, 0.5);
  for (const junta of JUNTAS) {
    const esperado = (a.juntas[junta] + b.juntas[junta]) / 2;
    assert.ok(Math.abs(p.juntas[junta] - esperado) < 1e-9, `junta ${junta}`);
  }
});

test('o indicador flete mais ao pressionar do que ao apontar', () => {
  // O médio, o anelar e o mindinho ficam recolhidos na palma nas duas
  // poses — comparar o indicador com eles não diz nada. O contraste que
  // lê como "pressão" é o indicador contra ele mesmo.
  assert.ok(POSES.pressionando.juntas.pipIndicador < POSES.apontando.juntas.pipIndicador,
    'o indicador deveria estar mais fletido na pressão que no apontar');
  assert.ok(POSES.pressionando.juntas.mcpIndicador < POSES.apontando.juntas.mcpIndicador);
  assert.ok(POSES.pressionando.pulso.y > POSES.apontando.pulso.y,
    'na pressão o pulso afunda');
});

test('na pose de apontar, o indicador é o dedo estendido', () => {
  const j = POSES.apontando.juntas;
  assert.ok(j.pipIndicador > j.pipMedio, 'o indicador deveria ser o menos fletido');
  assert.ok(j.pipIndicador > j.pipAnel);
  assert.ok(j.pipIndicador > j.pipMindinho);
});

test('na pose de segurar, o polegar fecha contra o indicador', () => {
  // É a pinça que segura a cédula: sem o polegar fechando, a cédula
  // aparece flutuando entre os dedos.
  assert.ok(POSES.segurando.juntas.mcpPolegar > POSES.repouso.juntas.mcpPolegar);
  assert.ok(POSES.segurando.juntas.mcpIndicador < POSES.apontando.juntas.mcpIndicador);
});

test('poseParaTransformacoes gera um transform por junta', () => {
  const t = poseParaTransformacoes(POSES.pressionando);
  assert.match(t.pipIndicador, /rotate\(-?\d+(\.\d+)?deg\)/);
  assert.equal(Object.keys(t).length, JUNTAS.length);
});

test('interpolar com t fora de 0..1 é limitado', () => {
  const p = interpolarPose(POSES.repouso, POSES.pressionando, 2.5);
  for (const junta of JUNTAS) {
    assert.equal(p.juntas[junta], POSES.pressionando.juntas[junta]);
  }
});

test('POSE é imutável — interpolar não corrompe a pose original', () => {
  const antes = { ...POSES.repouso.juntas };
  interpolarPose(POSES.repouso, POSES.pressionando, 0.7);
  assert.deepEqual(POSES.repouso.juntas, antes);
});
