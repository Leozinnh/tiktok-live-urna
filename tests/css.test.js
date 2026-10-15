import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DIR_CSS = fileURLToPath(new URL('../public/css/', import.meta.url));
const DIR_PUBLICO = fileURLToPath(new URL('../public/', import.meta.url));

/** Remove comentários para não contar chaves dentro deles. */
function semComentarios(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Conta chaves ignorando as que estão dentro de strings. Uma chave a mais
 * ou a menos não dá erro em lugar nenhum: o navegador descarta tudo o que
 * vem depois e a tela fica pela metade, sem nenhuma mensagem.
 */
export function chavesBalanceadas(css) {
  const texto = semComentarios(css);
  let profundidade = 0;
  let emString = null;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (emString) {
      if (c === '\\') { i++; continue; }
      if (c === emString) emString = null;
      continue;
    }
    if (c === '"' || c === "'") { emString = c; continue; }
    if (c === '{') profundidade++;
    else if (c === '}') profundidade--;
    if (profundidade < 0) return false;
  }
  return profundidade === 0;
}

test('todo arquivo CSS tem chaves balanceadas', async () => {
  const arquivos = (await readdir(DIR_CSS)).filter((f) => f.endsWith('.css'));
  assert.ok(arquivos.length > 0, 'nenhum CSS encontrado');
  for (const nome of arquivos) {
    const css = await readFile(DIR_CSS + nome, 'utf8');
    assert.ok(chavesBalanceadas(css), `${nome} tem chaves desbalanceadas`);
  }
});

test('o detector de chaves pega um arquivo quebrado de verdade', () => {
  // Sem isto, o teste acima passaria para sempre mesmo que o detector
  // estivesse cego — que é o modo de falha clássico de um guarda.
  assert.equal(chavesBalanceadas('.a { color: red; }'), true);
  assert.equal(chavesBalanceadas('.a { color: red; '), false, 'faltando fechar');
  assert.equal(chavesBalanceadas('.a { } } .b { }'), false, 'chave sobrando');
  assert.equal(chavesBalanceadas('.a { content: "}"; }'), true, 'chave dentro de string');
  assert.equal(chavesBalanceadas('/* { } */ .a { }'), true, 'chave dentro de comentário');
  assert.equal(chavesBalanceadas('.a { content: "\\"" ; }'), true, 'aspas escapadas');
});

test('todo CSS e JS referenciado pelo HTML existe no disco', async () => {
  // Um link quebrado não quebra o carregamento da página: o navegador
  // simplesmente segue em frente e a cena aparece sem estilo ou sem
  // comportamento. Só se descobre olhando a tela ao vivo.
  const html = await readFile(DIR_PUBLICO + 'broadcast.html', 'utf8');
  const refs = [
    ...[...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]),
  ];
  assert.ok(refs.length >= 5, `poucas referências encontradas: ${refs.length}`);
  for (const ref of refs) {
    assert.ok(ref.startsWith('/'), `referência ${ref} não é absoluta a partir da raiz`);
    await readFile(DIR_PUBLICO + ref.slice(1), 'utf8');
  }
});

test('o palco se centra sem depender do alinhamento do container', async () => {
  /*
   * O palco é MAIOR que a janela (1080x1920 contra qualquer monitor), e um
   * grid ou flex não centra filho que transborda: a linha do grid cresce
   * para baixo e o item encosta no topo dela. Com `place-items: center` e
   * `transform-origin: center center`, a escala então gira em torno de um
   * centro que está abaixo do centro da tela.
   *
   * Medido no navegador antes desta correção, com o palco a 1080x1920:
   *
   *   janela      | escala | topo do palco | faixa em cima | cortado embaixo
   *   1080x1920   | 1.000  | 0             | 0             | 0
   *   1920x1080   | 0.563  | 420           | 420           | 420
   *   1536x730    | 0.380  | 595           | 595           | 595
   *   1280x800    | 0.417  | 560           | 560           | 560
   *
   * Ou seja: só o formato exato do OBS ficava certo. Em qualquer outro, uma
   * faixa morta em cima e o rodapé da cena fora da tela.
   *
   * A ancoragem tem que ser no centro da janela, e a escala em torno desse
   * mesmo ponto.
   */
  const cena = semComentarios(await readFile(DIR_CSS + 'scene.css', 'utf8'));
  const regra = (seletor) => {
    const alvo = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // `String.raw` não é enfeite: dentro de um template literal comum, `\s`
    // vira `s` e `\{` vira `{`, e o padrão deixa de casar com o espaço antes
    // da chave — o teste então falha dizendo "regra não encontrada" para uma
    // regra que está bem ali na frente.
    // A âncora é o começo da linha, e não um espaço qualquer. Com `(?:^|\s)`
    // o alvo `.palco` casava também com o fim de `.cena--zoom .palco`, que
    // vem antes no arquivo — o teste então media a regra de conferência no
    // lugar da regra de verdade, e reprovava um palco que estava certo.
    const m = new RegExp(String.raw`(?:^|\n)\s*${alvo}\s*\{([^}]*)\}`).exec(cena);
    assert.ok(m, `regra não encontrada: ${seletor}`);
    return m[1];
  };

  const palco = regra('.palco');
  assert.match(palco, /position:\s*absolute/,
    'o palco precisa sair do fluxo do grid: um filho maior que a janela não é centrado por ele');
  assert.match(palco, /left:\s*50%/,
    'o palco não está ancorado no centro horizontal da janela');
  assert.match(palco, /top:\s*50%/,
    'o palco não está ancorado no centro vertical da janela');
  assert.match(palco.replace(/\s+/g, ' '), /translate\(\s*-50%\s*,\s*-50%\s*\)/,
    'falta o translate que põe o CENTRO do palco no centro da janela antes de escalar');
  assert.match(palco, /transform-origin:\s*center/,
    'a escala precisa girar em torno do centro, que agora é o centro da janela');
});

test('a contagem e a palavra VOTOS ficam na mesma linha de base', async () => {
  /*
   * O cartão tem 400px de altura e a contagem ocupa a sobra, que são uns
   * 230px. Com o número centralizado e a palavra ancorada embaixo
   * (`align-self: flex-end`, que era o que estava aqui), o "0" ficava no
   * meio de um vão vazio e o "VOTOS" encostava na barra, 200px abaixo —
   * os dois pareciam pertencer a cartões diferentes. Medido na captura do
   * OBS: o número terminava em y=330 e a palavra começava em y=445.
   *
   * Na mesma linha de base eles voltam a ser um dado só: "0 VOTOS".
   */
  const css = semComentarios(await readFile(DIR_CSS + 'placar.css', 'utf8'));
  const bloco = (seletor) => {
    const alvo = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(String.raw`(?:^|\n)\s*${alvo}\s*\{([^}]*)\}`).exec(css);
    assert.ok(m, `regra não encontrada: ${seletor}`);
    return m[1];
  };

  assert.match(bloco('.cartao__contagem'), /align-items:\s*baseline/,
    'a contagem precisa alinhar número e unidade pela linha de base');
  assert.doesNotMatch(bloco('.cartao__unidade'), /align-self:\s*flex-end/,
    'a unidade não pode ser empurrada para o rodapé do bloco da contagem');
});

test('as duas bases do teclado alinham as colunas', async () => {
  /*
   * O teclado da urna e um recesso escuro so, com as nove teclas numericas
   * em cima e as tres de acao embaixo. Eram dois recessos com paddings e
   * vaos diferentes, e o resultado aparecia na captura: as colunas de
   * BRANCO/CORRIGE/CONFIRMA nao caiam debaixo das colunas de 1/2/3 — os
   * dois blocos ficavam visivelmente tortos um em relacao ao outro.
   *
   * A conta e a mesma dos dois lados: a largura de dentro menos os dois
   * paddings, dividida em tres colunas separadas por dois vaos. Se padding
   * ou vao diferem, as colunas nao batem.
   */
  const css = semComentarios(await readFile(DIR_CSS + 'urna.css', 'utf8'));
  /*
   * Junta TODAS as regras que atingem o seletor, e não só a primeira.
   *
   * O recesso é declarado em duas: uma regra compartilhada
   * (`.teclado__grade, .teclado__acoes { padding... }`) e uma específica de
   * cada um (que traz o `gap`). Procurar por `.teclado__grade {` não acha
   * nada — o seletor está numa lista com vírgula — e o teste reprovava por
   * "regra não encontrada", que não é o defeito que ele existe para pegar.
   */
  const bloco = (seletor) => {
    const alvo = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const todas = new RegExp(
      String.raw`(?:^|\n)\s*([^{}\n][^{}]*?)\{([^}]*)\}`, 'g',
    );
    const partes = [];
    for (const m of css.matchAll(todas)) {
      const seletores = m[1].split(',').map((s) => s.trim());
      if (seletores.includes(seletor)) partes.push(m[2]);
    }
    assert.ok(partes.length > 0, `regra não encontrada: ${seletor}`);
    return partes.join(';');
  };
  /*
   * A ÚLTIMA declaração da propriedade, e não a primeira: quando o mesmo
   * seletor aparece em duas regras, quem vale é a de baixo. Pegar a de cima
   * faria o teste comparar um valor que o navegador nunca aplica — foi o
   * que aconteceu aqui, com o `padding: 8px` compartilhado escondendo o
   * `padding: 7px 6px` que de fato valia.
   */
  const declaracao = (texto, prop) => {
    const todas = new RegExp(String.raw`(?:^|;)\s*${prop}\s*:\s*([^;]+)`, 'g');
    let ultimo = null;
    for (const m of texto.matchAll(todas)) ultimo = m[1].trim();
    return ultimo;
  };
  /** Padding horizontal em px, aceitando a forma curta de 1 a 4 valores. */
  const paddingLateral = (texto) => {
    const bruto = declaracao(texto, 'padding');
    assert.ok(bruto, 'o recesso precisa declarar padding');
    const partes = bruto.split(/\s+/).map((v) => parseFloat(v));
    const px = (i) => partes[i] ?? partes[1] ?? partes[0];
    // 1 valor: todos iguais. 2: vertical, horizontal. 3: topo, lateral, base.
    return partes.length === 1 ? partes[0] : px(1);
  };
  const vao = (texto) => {
    const bruto = declaracao(texto, 'gap') ?? declaracao(texto, 'column-gap');
    assert.ok(bruto, 'o recesso precisa declarar o vão entre as colunas');
    return parseFloat(bruto);
  };

  const grade = bloco('.teclado__grade');
  const acoes = bloco('.teclado__acoes');

  assert.equal(paddingLateral(acoes), paddingLateral(grade),
    'os dois recessos precisam do mesmo padding lateral');
  assert.equal(vao(acoes), vao(grade),
    'os dois recessos precisam do mesmo vão entre colunas');
  assert.equal(declaracao(grade, 'grid-template-columns'),
    declaracao(acoes, 'grid-template-columns'),
    'as duas grades precisam declarar as mesmas colunas');
});
