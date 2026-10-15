import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POSES, interpolarPose, poseParaTransformacoes, JUNTAS } from '../public/js/hand/poses.js';
import { PIVOS, PONTAS } from '../public/js/hand/esqueleto.js';

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

// ---------------------------------------------------------------------
// Encurtamento por flexão.
//
// Uma falange que dobra para longe do observador não gira no plano: ela
// encurta. Sem isso, uma junta fletida 90° gira 90° e o dedo atravessa a
// palma — foi assim que os quatro dedos viraram uma massa de pastilhas.
// O modelo abaixo é o de projeção: o que sobra do comprimento é cos(f).
// ---------------------------------------------------------------------

/** Lê o scaleY de um transform gerado por poseParaTransformacoes. */
const escalaYDe = (t) => Number(/scaleY\((-?\d+(?:\.\d+)?)\)/.exec(t)?.[1]);
/** Lê o ângulo (em graus) de um transform gerado por poseParaTransformacoes. */
const giroDe = (t) => Number(/rotate\((-?\d+(?:\.\d+)?)deg\)/.exec(t)?.[1]);

test('a junta em repouso não gira nem encurta', () => {
  const t = poseParaTransformacoes({ pulso: { x: 0, y: 0, rot: 0 },
    juntas: Object.fromEntries(JUNTAS.map((j) => [j, 0])) });
  for (const junta of JUNTAS) {
    assert.equal(giroDe(t[junta]), 0, `${junta} girou sem flexão`);
    assert.equal(escalaYDe(t[junta]), 1, `${junta} encurtou sem flexão`);
  }
});

test('quanto mais fletida a junta, mais curta ela fica', () => {
  const graus = [0, -20, -45, -70, -95];
  const escalas = graus.map((g) => escalaYDe(poseParaTransformacoes(
    { pulso: { x: 0, y: 0, rot: 0 }, juntas: Object.fromEntries(JUNTAS.map((j) => [j, g])) }
  ).pipIndicador));

  for (let i = 1; i < escalas.length; i++) {
    assert.ok(escalas[i] < escalas[i - 1],
      `${graus[i]}° deveria encurtar mais que ${graus[i - 1]}°: ${escalas[i]} vs ${escalas[i - 1]}`);
  }
  assert.ok(escalas[0] <= 1 && escalas[0] > 0.99, 'sem flexão a falange tem o comprimento cheio');
});

test('a falange nunca some nem cresce além do comprimento', () => {
  // O piso evita que o dedo vire um ponto quando dobra fundo: uma
  // articulação que desaparece lê como erro de desenho, não como punho.
  for (const g of [-180, -150, -110, -90, -60, -30, 0, 30, 60, 120, 180]) {
    const e = escalaYDe(poseParaTransformacoes(
      { pulso: { x: 0, y: 0, rot: 0 }, juntas: Object.fromEntries(JUNTAS.map((j) => [j, g])) }
    ).pipIndicador);
    assert.ok(e >= 0.3, `flexão ${g}° sumiu com a falange (escala ${e})`);
    assert.ok(e <= 1.0001, `flexão ${g}° esticou a falange (escala ${e})`);
  }
});

test('a rotação que chega ao DOM é relativa ao pai, não absoluta', () => {
  /*
   * As juntas são grupos aninhados: girar o nó move tudo o que está
   * dentro, e o transform de cada filho é aplicado no referencial já
   * girado do pai. Somar os deltas ao longo da cadeia tem que devolver
   * o giro absoluto da ponta — se devolver o dobro, o dedo fecha no ar.
   */
  const t = poseParaTransformacoes(POSES.pressionando);
  const cadeia = ['mcpIndicador', 'pipIndicador', 'dipIndicador'];
  const giroAbsoluto = Math.abs(POSES.pressionando.juntas.dipIndicador) * 0.5;

  const soma = cadeia.reduce((s, j) => s + giroDe(t[j]), 0);
  assert.ok(Math.abs(soma - giroAbsoluto) < 0.01,
    `a cadeia soma ${soma}° mas a ponta deveria girar ${giroAbsoluto}°`);

  // E o contraste: com giro absoluto em cada grupo, a mesma cadeia
  // somaria o triplo. É esse o defeito que o delta evita.
  const comoAbsoluto = cadeia.reduce((s, j) => s + Math.abs(giroAbsoluto), 0);
  assert.ok(Math.abs(soma - comoAbsoluto) > 1,
    'a cadeia parece estar recebendo o giro absoluto em cada junta');
});

/** Gira um ponto em torno de um pivô, no plano. */
function girar(p, pivo, graus) {
  const r = (graus * Math.PI) / 180;
  const dx = p.x - pivo.x;
  const dy = p.y - pivo.y;
  return {
    x: pivo.x + dx * Math.cos(r) - dy * Math.sin(r),
    y: pivo.y + dx * Math.sin(r) + dy * Math.cos(r),
  };
}

test('fechar a pinça traz a ponta do polegar para dentro da mão', () => {
  /*
   * É o requisito da pose `segurando`: o polegar tem que encostar no
   * indicador, senão a cédula aparece flutuando entre os dedos. A
   * checagem é geométrica e usa só os transforms que o renderizador
   * recebe — a ponta do polegar, girada pelos ângulos emitidos, precisa
   * terminar mais perto da linha central da mão do que em repouso.
   *
   * A ordem importa: o grupo do polegar é pai do grupo da falange
   * distal, então a ponta sofre os DOIS giros, e o do pai é em torno do
   * pivô do pai — não em torno do pivô do filho já deslocado.
   */
  const centro = (PIVOS.mcpIndicador.x + PIVOS.mcpMindinho.x) / 2;

  const pontaEm = (pose) => {
    const t = poseParaTransformacoes(pose);
    const local = girar(PONTAS.Polegar, PIVOS.ipPolegar, giroDe(t.ipPolegar));
    return girar(local, PIVOS.mcpPolegar, giroDe(t.mcpPolegar));
  };

  const repouso = pontaEm(POSES.repouso);
  const pinca = pontaEm(POSES.segurando);
  assert.ok(Math.abs(pinca.x - centro) < Math.abs(repouso.x - centro),
    `a ponta do polegar foi de x=${repouso.x} para x=${pinca.x}, longe do centro ${centro}`);
});
