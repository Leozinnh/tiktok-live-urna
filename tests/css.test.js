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

test('a camada do pop-up fica acima de todas as outras', async () => {
  /*
   * O defeito que este teste prende foi visto numa FOTO, e não aqui.
   *
   * O pop-up do presente nasceu dentro da camada de efeitos (z 50). O placar
   * é z 60 — e o nome do presente, que é a primeira coisa do cartão, cai bem
   * na faixa dele. O resultado na tela de transmissão foi um cartão SEM NOME,
   * com o "de Painel" e o "vai pra Lulinha" logo abaixo do nada, e o véu sem
   * apagar o cronômetro. Nada disso dá erro: o CSS aplica, o DOM fica certo,
   * e a única pista é olhar.
   *
   * São duas coisas que precisam valer juntas, e é por isso que elas estão no
   * mesmo teste: o token mais alto tem que ser o do pop-up, E o pop-up tem que
   * ser montado na camada que usa esse token. Só a primeira não impede alguém
   * de pendurar o cartão na camada errada — que foi exatamente o que
   * aconteceu —, e só a segunda não impede alguém de acrescentar um
   * `--z-aviso: 90` acima dele.
   */
  const tokens = semComentarios(await readFile(DIR_CSS + 'tokens.css', 'utf8'));
  const zs = [...tokens.matchAll(/--z-([a-z-]+):\s*(\d+)/g)]
    .map((m) => ({ nome: m[1], valor: Number(m[2]) }));
  assert.ok(zs.length >= 5, `poucos tokens de camada encontrados: ${zs.length}`);

  const popup = zs.find((z) => z.nome === 'popup');
  assert.ok(popup, 'não existe --z-popup em tokens.css');
  for (const z of zs) {
    assert.ok(z.nome === 'popup' || z.valor < popup.valor,
      `--z-${z.nome} vale ${z.valor} e --z-popup vale ${popup.valor}: `
      + 'há camada desenhada por cima do pop-up, e o cartão sai atrás dela');
  }

  const cena = semComentarios(await readFile(DIR_CSS + 'scene.css', 'utf8'));
  assert.match(cena, /\.camada--popup\s*\{[^}]*z-index:\s*var\(--z-popup\)/,
    'a camada do pop-up não usa --z-popup');

  /*
   * E o outro lado do fio: quem MONTA o pop-up tem que apontá-lo para essa
   * camada. É a metade que faltava — o token estava certo desde que a camada
   * nasceu, e o cartão foi pendurado na camada de efeitos assim mesmo.
   */
  const aoVivo = await readFile(fileURLToPath(new URL('../public/js/ao-vivo.js', import.meta.url)), 'utf8');
  assert.match(aoVivo, /criarPopupPresente\(\s*cenario\.camadaPopup\s*\)/,
    'o pop-up não é montado na camada de pop-up: ele volta a ficar atrás do placar');
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

test('a contagem do cartão é grande e branca sobre um corpo escuro', async () => {
  /*
   * O cartão é lido de longe, num celular, no meio de uma live. A queixa
   * que originou este teste foi literal: "está horrível de ler os números".
   *
   * O que fazia os números sumirem não era só o tamanho: o cartão era
   * inteiramente da cor da urna, e número branco sobre azul médio tem menos
   * contraste do que parece. Na referência o miolo é escuro e a cor da urna
   * fica na moldura e no cabeçalho — é essa separação que dá o contraste.
   */
  const css = semComentarios(await readFile(DIR_CSS + 'placar.css', 'utf8'));
  const bloco = (seletor) => {
    const alvo = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(String.raw`(?:^|\n)\s*${alvo}\s*\{([^}]*)\}`).exec(css);
    assert.ok(m, `regra não encontrada: ${seletor}`);
    return m[1];
  };

  const votos = bloco('.cartao__votos');
  const tamanho = parseFloat(/font-size:\s*([\d.]+)px/.exec(votos)?.[1] ?? '0');
  assert.ok(tamanho >= 120,
    `a contagem está com ${tamanho}px: é o maior número da cena e precisa dominar o cartão`);

  /*
   * A luminância do fundo do corpo, medida de verdade.
   *
   * Escrever `assert.match(corpo, /#131b2e/)` seria um teste sobre o texto
   * do CSS, não sobre o que aparece na tela: trocar o valor por outro escuro
   * qualquer quebraria o teste sem nenhum defeito. O que importa é ser
   * escuro, então é isso que ele mede.
   */
  const corpo = bloco('.cartao__corpo');
  const cores = [...corpo.matchAll(/#([0-9a-f]{6})\b/gi)].map((m) => m[1]);
  assert.ok(cores.length > 0, 'o corpo do cartão não declara nenhuma cor de fundo');
  const luminancia = (hex) => {
    const canal = (i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
  };
  const maisClara = Math.max(...cores.map(luminancia));
  assert.ok(maisClara < 0.10,
    `o corpo do cartão não é escuro o bastante (luminância ${maisClara.toFixed(3)}): a contagem branca some`);

  // E a cor da urna continua vindo da configuração, no cabeçalho.
  assert.match(bloco('.cartao__topo'), /var\(--cor-urna/,
    'o cabeçalho do cartão perdeu a cor que vem da urna');
});

test('o placar começa abaixo do fim do cronômetro', async () => {
  /*
   * Cronômetro e placar são dois blocos posicionados em medidas fixas do
   * palco, cada um no seu arquivo. Nada no CSS impede que se sobreponham: se
   * o painel do cronômetro crescer, ou o placar subir, o número grande
   * simplesmente passa a ser desenhado por cima dos cartões — e numa
   * transmissão isso aparece como um borrão que ninguém sabe de onde veio.
   *
   * A conta é a mais simples que existe: topo do placar >= base do
   * cronômetro. É pouco, mas é exatamente o que quebra.
   */
  const ler = async (arquivo) => semComentarios(await readFile(DIR_CSS + arquivo, 'utf8'));
  const px = (texto, prop) => {
    const m = new RegExp(String.raw`(?:^|[;{\s])${prop}:\s*(-?[\d.]+)px`).exec(texto);
    assert.ok(m, `não achei ${prop}`);
    return parseFloat(m[1]);
  };
  const regra = (css, seletor) => {
    const alvo = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(String.raw`(?:^|\n)\s*${alvo}\s*\{([^}]*)\}`).exec(css);
    assert.ok(m, `regra não encontrada: ${seletor}`);
    return m[1];
  };

  const relogio = regra(await ler('cronometro.css'), '.cronometro');
  const placar = regra(await ler('placar.css'), '.placar');

  const baseDoRelogio = px(relogio, 'top') + px(relogio, 'height');
  const topoDoPlacar = px(placar, 'top');
  assert.ok(topoDoPlacar >= baseDoRelogio,
    `o placar começa em ${topoDoPlacar}px e o cronômetro só termina em ${baseDoRelogio}px: `
    + 'os dois se sobrepõem');
});

test('o placar e a cena da mesa não se sobrepõem', async () => {
  /*
   * O placar ocupa o alto do palco e a mesa começa logo abaixo. Se o placar
   * descer demais, os cartões passam a cobrir as urnas — que é justamente o
   * que a composição da referência evita: o placar informa, a mesa é onde a
   * votação acontece, e as duas coisas precisam caber ao mesmo tempo.
   */
  const placar = semComentarios(await readFile(DIR_CSS + 'placar.css', 'utf8'));
  const m = /(?:^|\n)\s*\.placar\s*\{([^}]*)\}/.exec(placar);
  assert.ok(m, 'regra não encontrada: .placar');
  const px = (texto, prop) => {
    const v = new RegExp(String.raw`(?:^|[;{\s])${prop}:\s*(-?[\d.]+)px`).exec(texto);
    assert.ok(v, `não achei ${prop}`);
    return parseFloat(v[1]);
  };
  const baseDoPlacar = px(m[1], 'top') + px(m[1], 'height');

  // O tampo da mesa é medido em % da altura do palco, que é 1920px.
  const tokens = semComentarios(await readFile(DIR_CSS + 'tokens.css', 'utf8'));
  const altura = px(tokens, '--palco-altura');
  const topoDaMesa = parseFloat(/(--mesa-topo:\s*)([\d.]+)%/.exec(tokens)[2]) / 100 * altura;

  assert.ok(baseDoPlacar <= topoDaMesa,
    `o placar termina em ${baseDoPlacar}px, depois do tampo da mesa (${topoDaMesa}px): `
    + 'os cartões estão cobrindo as urnas');
});

test('a vitrine fica abaixo do tampo e com os dois lados espelhados', async () => {
  /*
   * A vitrine é a legenda da votação: o Heart Me ligado ao 22 e a rosa ligada
   * ao 13. Duas coisas podem dar errado sem que nada acuse.
   *
   * A primeira é ela subir. As urnas ocupam a faixa logo acima do tampo, e
   * uma vitrine que começa antes do tampo passa a ser desenhada por cima do
   * teclado — justamente o que a mão precisa acertar.
   *
   * A segunda é ela sair de eixo. As duas posições são espelhadas por
   * construção, e é o que mantém a composição equilibrada; um ajuste de um
   * lado só desalinha a cena inteira e é o tipo de coisa que passa batido,
   * porque cada lado, sozinho, parece certo.
   */
  const css = semComentarios(await readFile(DIR_CSS + 'presentes.css', 'utf8'));
  const tokens = semComentarios(await readFile(DIR_CSS + 'tokens.css', 'utf8'));
  const px = (texto, prop) => {
    const m = new RegExp(String.raw`(?:^|[;{\s])${prop}:\s*(-?[\d.]+)px`).exec(texto);
    assert.ok(m, `não achei ${prop}`);
    return parseFloat(m[1]);
  };
  const regra = (seletor) => {
    const alvo = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(String.raw`(?:^|\n)\s*${alvo}\s*\{([^}]*)\}`).exec(css);
    assert.ok(m, `regra não encontrada: ${seletor}`);
    return m[1];
  };

  const altura = px(tokens, '--palco-altura');
  const topoDaMesa = parseFloat(/(--mesa-topo:\s*)([\d.]+)%/.exec(tokens)[2]) / 100 * altura;
  const vitrine = regra('.vitrine');
  const topo = px(vitrine, 'top');

  assert.ok(topo >= topoDaMesa,
    `a vitrine começa em ${topo}px, antes do tampo da mesa (${topoDaMesa}px): `
    + 'os presentes estão cobrindo o teclado das urnas');
  assert.ok(topo + px(vitrine, 'height') <= altura,
    'a vitrine passa do fim do palco: o rodapé dela fica fora do enquadramento');

  // Espelhamento: o mesmo recuo dos dois lados.
  assert.equal(px(regra('.vitrine__posicao--esq'), 'left'),
    px(regra('.vitrine__posicao--dir'), 'right'),
    'os dois presentes estão a distâncias diferentes da borda');

  /*
   * A etiqueta tem que ser lida de longe — num celular, com a live a 38% de
   * escala. O número é a metade que importa: é ele que diz em qual urna o
   * presente vota, e é ele que sai aceso na cor da urna.
   */
  const numero = regra('.presente__numero');
  assert.ok(parseFloat(/font-size:\s*([\d.]+)px/.exec(numero)[1]) >= 30,
    'o número da etiqueta está pequeno demais para ser lido no celular');
  assert.match(numero, /var\(--cor-urna/,
    'o número perdeu a cor da urna: a legenda deixa de ligar presente e urna');
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

test('todo tipo de aviso da faixa tem estilo próprio no narrador.css', async () => {
  /*
   * O defeito que este teste prende, escrito por quem o viu: o Leonardo olhou
   * a live e disse que o aviso "Chegou Rosa de..." estava "muito simples e
   * pouco chamativo".
   *
   * A causa não era um estilo feio — era a AUSÊNCIA de um. O tipo `presente`
   * não estava na lista da faixa, caía na classe neutra cinza, e o aviso do
   * presente que alguém pagou para acontecer saía com a mesma cara de "alguém
   * entrou". Um tipo sem regra no CSS não dá erro em lugar nenhum: só fica
   * apagado, e quem descobre é o olho de quem está no ar.
   */
  const { TIPOS_DA_FAIXA } = await import('../public/js/narrador.js');
  const css = await readFile(`${DIR_CSS}narrador.css`, 'utf8');
  for (const tipo of TIPOS_DA_FAIXA) {
    assert.match(css, new RegExp(`\\.narrador--${tipo}\\b`),
      `o tipo "${tipo}" não tem regra no narrador.css — ele sai na cor neutra`);
  }
  assert.match(css, /\.narrador--social\b/, 'falta a classe neutra dos outros tipos');
});

test('a figura do presente na faixa tem estilo, e sabe ficar escondida', async () => {
  /*
   * O elemento da figura existe desde o boot e é reaproveitado a vida inteira
   * da tela: ele fica escondido até chegar um presente com desenho, e volta a
   * se esconder no aviso seguinte. Duas coisas, então, e as duas sem erro
   * visível quando faltam:
   *
   *   - sem a regra do `[hidden]`, o `flex: 0 0 auto` do vizinho deixaria um
   *     buraco de 96px na faixa de TODO aviso social, a noite inteira;
   *   - sem medida nenhuma, a figura sairia no tamanho natural do arquivo —
   *     centenas de pixels, cobrindo meia tela de transmissão.
   */
  const css = await readFile(`${DIR_CSS}narrador.css`, 'utf8');
  assert.match(css, /\.narrador__desenho\b/, 'a figura do presente não tem estilo');
  assert.match(css, /\.narrador__desenho\[hidden\]\s*\{[^}]*display:\s*none/,
    'a figura escondida continuaria ocupando lugar na faixa');
  assert.match(css, /\.narrador__desenho\s*\{[^}]*width:\s*\d+px/,
    'a figura sairia no tamanho natural do arquivo');
});

test('o painel do rodapé é um aparelho na cena, e não um cartão por cima dela', async () => {
  /*
   * A queixa foi curta: "o painel-area está ruim demais".
   *
   * Ele era um retângulo navy de cantos bem redondos com linhas igualmente
   * redondas e translúcidas dentro — a única peça de interface numa cena que
   * já era feita de objetos. E a 6% de transparência o ladrilho rosa aparecia
   * por dentro dele: um painel que deixa o chão atravessar não está apoiado
   * no chão, está impresso nele.
   *
   * Agora ele é o terceiro aparelho do estúdio, junto das duas TVs e do
   * relógio: carcaça opaca, tela recuada pelo MESMO bezel dos outros dois, e
   * a cor da urna acesa em cada linha. Três coisas disso quebram em silêncio,
   * e são as três que este teste prende.
   */
  const css = semComentarios(await readFile(DIR_CSS + 'painel.css', 'utf8'));
  const bloco = (seletor) => {
    const alvo = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(String.raw`(?:^|\n)\s*${alvo}\s*\{([^}]*)\}`).exec(css);
    assert.ok(m, `regra não encontrada: ${seletor}`);
    return m[1];
  };
  const declaracao = (texto, prop) => {
    const m = new RegExp(String.raw`(?:^|;)\s*${prop}\s*:\s*([^;]+)`, 's').exec(texto);
    return m ? m[1].trim() : null;
  };
  /* topo/direita/base/esquerda, aceitando a forma curta de 1 a 4 valores. */
  const lados = (texto) => {
    const v = texto.split(/\s+/).map((n) => parseFloat(n));
    return [v[0], v[1] ?? v[0], v[2] ?? v[0], v[1] ?? v[0]];
  };

  /*
   * A carcaça é opaca e escura.
   *
   * O `rgba(22, 32, 58, 0.94)` que estava aqui deixava o ladrilho passar; o
   * que se cobra agora é a ÚLTIMA camada do fundo — a que forra a carcaça —
   * seja opaca. As de cima podem ser translúcidas: uma camada preta a 78%
   * sobre um fundo opaco escurece, e escurecer é o que se quer.
   *
   * E a luminância é a mesma conta do miolo dos cartões, com o mesmo limiar,
   * porque o problema é o mesmo: nome branco em cima.
   */
  const carcaça = bloco('.painel');
  const fundo = declaracao(carcaça, 'background');
  assert.ok(fundo, 'a carcaça do painel não declara fundo');
  /* As camadas do fundo, separadas pelas vírgulas de fora dos parênteses. */
  const camadasDoFundo = (texto) => {
    const partes = [];
    let nivel = 0;
    let atual = '';
    for (const c of texto) {
      if (c === '(') nivel += 1;
      else if (c === ')') nivel -= 1;
      else if (c === ',' && nivel === 0) { partes.push(atual.trim()); atual = ''; continue; }
      atual += c;
    }
    partes.push(atual.trim());
    return partes;
  };
  const forro = camadasDoFundo(fundo).pop();
  assert.equal(/rgba\(/.test(forro), false,
    `a camada que forra a carcaça é translúcida: o ladrilho aparece por dentro dela — ${forro}`);
  const cores = [...fundo.matchAll(/#([0-9a-f]{6})\b/gi)].map((m) => m[1]);
  assert.ok(cores.length >= 2, 'a carcaça não tem o degradê de alumínio das TVs');
  const luminancia = (hex) => {
    const canal = (i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
  };
  assert.ok(Math.max(...cores.map(luminancia)) < 0.10,
    `a carcaça não é escura o bastante: o nome branco das linhas some`);

  /*
   * E a tela tem que ser recuada EXATAMENTE pelo padding da carcaça.
   *
   * O queixo é mais grosso que os outros três lados, então a moldura é
   * padding e não borda — e o vidro, que é `inset`, tem que repetir os
   * quatro números à mão. Engrossar o bezel sem mexer no `inset` não dá erro
   * nenhum: o vidro escorrega para fora da tela e passa a cobrir a marca do
   * queixo, ou a tela vaza por baixo da carcaça.
   */
  const recuo = lados(declaracao(carcaça, 'padding'));
  for (const camada of ['.painel::before', '.painel::after']) {
    assert.deepEqual(lados(declaracao(bloco(camada), 'inset') ?? ''), recuo,
      `${camada} não repete o padding da carcaça: a tela e o vidro saem de lugar`);
  }

  /*
   * E a tarja de cada linha continua sendo a cor da urna daquele voto. É ela
   * que liga a linha ao objeto na tela sem precisar ler o número, e numa
   * tela a cor sai de um LED aceso — não de uma borda pintada.
   */
  assert.match(bloco('.painel__item::before'), /var\(--cor-urna/,
    'a tarja da linha perdeu a cor da urna: a linha deixa de apontar para a urna');
});

/*
 * O acabamento em 3D das três faces do gabinete.
 *
 * O topo, a lateral e o pé ganharam camada de luz própria, POR CIMA das
 * declarações do Leonardo — o padrão que o próprio arquivo já documenta:
 * nada dele é reescrito, o que entra é `::before`/`::after`.
 *
 * O que este teste prende não é o valor de cada camada (isso é gosto, e muda
 * com a foto). São as três coisas que, faltando, viram defeito de verdade:
 *
 *   1. a camada não pode participar do LAYOUT — `position: absolute` com
 *      `inset: 0`, senão o gabinete cresce e a urna sai de cima da mesa;
 *   2. a camada não pode pegar o CLIQUE — `pointer-events: none`, senão ela
 *      vira um vidro na frente do que está embaixo;
 *   3. a LUZ TEM QUE TER DIREÇÃO. A lateral era um degradê só na horizontal:
 *      de cima a baixo ela tinha o mesmo valor, e face de valor constante lê
 *      como adesivo colado no corpo. É a queda da luz do teto e o afundamento
 *      no pé que dizem que aquilo é uma superfície em pé.
 */
test('as faces do gabinete ganham luz por cima, sem sair do lugar', async () => {
  const css = semComentarios(await readFile(DIR_CSS + 'urna.css', 'utf8'));
  const bruto = await readFile(DIR_CSS + 'urna.css', 'utf8');

  const bloco = (seletor) => {
    const alvo = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(String.raw`(?:^|\n)\s*${alvo}\s*\{([^}]*)\}`).exec(css);
    assert.ok(m, `regra não encontrada: ${seletor}`);
    return m[1];
  };

  const camadas = ['.urna__topo::after', '.urna__lado::before', '.urna__base::before'];
  for (const camada of camadas) {
    const texto = bloco(camada);
    assert.match(texto, /content:\s*''/, `${camada} sem content: a camada não existe`);
    assert.match(texto, /position:\s*absolute/, `${camada} participa do layout`);
    assert.match(texto, /inset:\s*0/, `${camada} não cobre a face inteira`);
    assert.match(texto, /pointer-events:\s*none/, `${camada} pega o clique`);
  }

  /*
   * E a luz da lateral tem de cair de ALTO para baixo, e o pé afundar na
   * mesa. Sem o par, a face é chapada na vertical — que é o defeito que a
   * camada existe para consertar, e o único jeito de o teste saber a
   * diferença é a direção do degradê.
   */
  const lado = bloco('.urna__lado::before');
  assert.match(lado, /linear-gradient\(180deg/, 'a lateral perdeu a luz do teto caindo pela altura');
  assert.match(lado, /linear-gradient\(0deg/, 'a lateral perdeu o afundamento no pé');

  /*
   * E as declarações de face do Leonardo continuam inteiras. A camada é por
   * CIMA do fundo dele: quem trocar o degradê de lugar em vez de somar por
   * cima apaga o ajuste dele, e o teste avisa antes de chegar na transmissão.
   */
  for (const cor of ['#fdfdfb', '#b3b0a8', '#74716b', '#55524c', '#2e2c28']) {
    assert.ok(bruto.includes(cor), `o fundo ${cor} de uma face foi apagado`);
  }
});
