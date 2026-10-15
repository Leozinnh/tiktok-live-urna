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
    const m = new RegExp(String.raw`(?:^|[}\s])${alvo}\s*\{([^}]*)\}`).exec(cena);
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
