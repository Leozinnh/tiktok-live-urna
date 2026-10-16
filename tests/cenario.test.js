import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/*
 * O CENÁRIO — parede, piso, mesa, postes e a camada de luz.
 *
 * Estes três testes não conferem gosto: nenhum deles diz qual é a cor certa
 * ou onde a sombra fica bonita. Eles prendem as três coisas que já deram
 * errado nesta cena, e que não dão erro nenhum quando dão errado — só
 * aparecem na captura, e só descobrem quem está olhando a tela no ar.
 *
 *   1. uma peça do cenário desenhada por cima das urnas;
 *   2. o piso ou o tampo deixando de ser um plano em perspectiva;
 *   3. uma peça montada pelo `scene.js` e sem estilo nenhum no `scene.css`.
 *
 * O terceiro é o mais silencioso dos três: um `<div>` sem regra não fica
 * torto nem errado, fica INVISÍVEL — e a mesa continua parecendo a mesma
 * mesa, só que sem a quina que alguém acabou de acrescentar.
 */

const DIR_CSS = fileURLToPath(new URL('../public/css/', import.meta.url));
const ler = (nome) => readFile(DIR_CSS + nome, 'utf8');
const semComentarios = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** O corpo da regra de um seletor, sem comentários. */
function regra(css, seletor) {
  const alvo = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(String.raw`(?:^|\n)\s*${alvo}\s*\{([^}]*)\}`).exec(css);
  assert.ok(m, `regra não encontrada: ${seletor}`);
  return m[1];
}

test('nenhuma peça do cenário é desenhada por cima das urnas', async () => {
  /*
   * O cenário inteiro mora ABAIXO das urnas, e essa é a única coisa que o
   * mantém sendo cenário: no dia em que uma peça sobe, ela passa a tapar a
   * urna, a mão ou a cédula — e as três são o espetáculo.
   *
   * É o mesmo defeito que a camada do pop-up já teve nesta casa (ele nasceu
   * dentro da camada de efeitos, e o placar apareceu desenhado por cima do
   * nome do presente). A diferença é o lado do erro: lá faltava subir, aqui
   * é não subir.
   *
   * A conta é feita sobre os TOKENS, e não sobre os números soltos: quem
   * quiser acrescentar uma peça nova tem que escolher um token de camada, e
   * é a escolha do token que este teste confere.
   */
  const tokens = semComentarios(await ler('tokens.css'));
  const camadas = new Map(
    [...tokens.matchAll(/--z-([a-z-]+):\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]),
  );
  const urnas = camadas.get('urna');
  assert.ok(Number.isInteger(urnas), 'não achei --z-urna em tokens.css');

  const cena = semComentarios(await ler('scene.css'));
  let conferidas = 0;
  for (const m of cena.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const seletor = m[1].trim();
    const zIndex = /(?:^|;)\s*z-index:\s*([^;]+)/.exec(m[2]);
    if (!zIndex) continue;

    /*
     * As `.camada--*` ficam de fora: são as camadas de CONTEÚDO, e a ordem
     * delas é outra conversa — quem a prende é o tests/css.test.js, que
     * exige o pop-up no topo de todas.
     */
    if (/\.camada--/.test(seletor)) continue;

    const valor = zIndex[1].trim();
    const token = /var\(--z-([a-z-]+)\)/.exec(valor);
    assert.ok(token, `${seletor} declara z-index "${valor}" sem token de camada`);

    // `calc(var(--z-mesa) + 1)` é o jeito desta casa de dizer "um degrau
    // acima" — o poste e o piso usam, e a soma precisa entrar na conta.
    const soma = /([+-])\s*(\d+)/.exec(valor);
    const altura = camadas.get(token[1]) + (soma ? Number(soma[1] + soma[2]) : 0);

    assert.ok(altura < urnas,
      `${seletor} é desenhado em z ${altura} e as urnas em z ${urnas}: `
      + 'há cenário por cima do espetáculo');
    conferidas++;
  }
  assert.ok(conferidas >= 4, `poucas peças de cenário conferidas: ${conferidas}`);
});

test('o piso e o tampo da mesa continuam planos em perspectiva', async () => {
  /*
   * A profundidade desta cena não vem do degradê: vem de um plano de verdade
   * girado no espaço, com a `perspective` do palco fazendo as juntas
   * convergirem sozinhas.
   *
   * O piso já foi um degradê, e o resultado é o que se vê num rodapé: uma
   * faixa de cor lisa. Trocar o `rotateX` por um degradê mais bonito é a
   * "simplificação" que este teste existe para barrar — o desenho continua
   * parecido num print pequeno e a cena perde o chão.
   *
   * A origem no topo é a outra metade: é ela que faz o plano girar em torno
   * da linha onde ele encontra a parede (no piso) e a quina do tampo (na
   * mesa), em vez de girar em torno do próprio centro e descolar dos dois.
   */
  const cena = semComentarios(await ler('scene.css'));
  for (const seletor of ['.piso', '.mesa__tampo']) {
    const bloco = regra(cena, seletor);
    assert.match(bloco, /transform:\s*rotateX\(/,
      `${seletor} deixou de ser um plano girado: sem isso não há perspectiva`);
    assert.match(bloco, /transform-origin:\s*top center/,
      `${seletor} precisa girar em torno da aresta de cima, e não do próprio centro`);
  }
});

test('toda peça que a cena monta tem estilo no scene.css', async () => {
  /*
   * O `scene.js` monta o cenário como marcação, e o `scene.css` o veste. Não
   * há nada entre os dois: uma classe escrita de um lado e esquecida do
   * outro não avisa ninguém.
   *
   * Do lado de cá o esquecimento é invisível — a peça entra no DOM, ocupa
   * lugar, e não tem uma única propriedade. Do lado de lá é pior: uma regra
   * escrita para uma peça que não existe mais é um ajuste que ninguém vê
   * fazer efeito, e a próxima pessoa a mexer fica procurando onde ele vale.
   *
   * As duas metades são lidas como TEXTO, e não importadas: o `scene.js`
   * monta no `document` ao ser carregado, e importá-lo fora do navegador não
   * funciona. É o mesmo recurso de tests/ganchos.test.js.
   */
  const js = await readFile(fileURLToPath(new URL('../public/js/scene.js', import.meta.url)), 'utf8');
  const marcação = /raiz\.innerHTML\s*=\s*`([\s\S]*?)`;/.exec(js);
  assert.ok(marcação, 'não achei a marcação que o scene.js monta');

  const classes = new Set(
    [...marcação[1].matchAll(/class="([^"]+)"/g)]
      .flatMap((m) => m[1].split(/\s+/))
      .filter(Boolean),
  );
  assert.ok(classes.size >= 8, `poucas peças encontradas na cena: ${classes.size}`);

  const cena = semComentarios(await ler('scene.css'));
  for (const classe of classes) {
    // O `-` no fim do lookahead é o que separa `mesa__pe` de `mesa__pe--esq`:
    // sem ele, ter estilo para o modificador valeria como ter estilo para a
    // peça, e a peça ficaria sem nenhum.
    assert.match(cena, new RegExp(String.raw`\.${classe}(?![\w-])`),
      `a peça "${classe}" é montada pelo scene.js e não tem estilo no scene.css`);
  }
});
