/*
 * Cada gancho do DOM tem um dono só.
 *
 * O defeito que este teste prende, medido no navegador: a mão ficava parada
 * para sempre quando um voto era pedido por
 *
 *     document.querySelector('[data-urna="u1"]').click()
 *
 * e a causa não era o motor de votação — era o SELETOR. Dois elementos
 * respondiam por `data-urna="u1"`:
 *
 *   - o cartão do placar (placar.js), que vem ANTES no documento e não tem
 *     ouvinte de clique nenhum;
 *   - o botão de voto da barra de demonstração, que tinha.
 *
 * O `querySelector` para no primeiro, então o clique morria no cartão: nenhum
 * voto entrava na fila, nenhuma exceção aparecia no console, e a mão ficava em
 * `recolher()` — fora de cena — indefinidamente. Um clique manual no botão
 * sempre funcionou; só quem selecionava por seletor via o defeito, e por isso
 * ele sobreviveu tanto tempo.
 *
 * Dois elementos respondendo pelo mesmo nome não é um deles que erra: é o
 * nome que deixou de significar uma coisa só.
 *
 * A barra de demonstração já não existe — a Etapa 4 a substituiu pelo painel,
 * em outra rota —, e a regra ficou mais forte por isso: a página do ar não
 * tem controle de operação NENHUM, e o nome `data-urna` continua tendo um
 * dono só. O que era um teste sobre dois botões virou um teste sobre a
 * ausência de botões, que é o que a seção 5 sempre pediu.
 *
 * Os arquivos são lidos como TEXTO, e não importados: `demo.js` monta a cena
 * no `document` ao ser carregado, então importá-lo fora do navegador não
 * funciona. É o mesmo recurso que tests/urna-visual.test.js usa.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const raiz = new URL('../public/js/', import.meta.url);
const ler = (nome) => readFileSync(new URL(nome, raiz), 'utf8');

const PLACAR = ler('placar.js');

/**
 * Tira os comentários antes de procurar atributos.
 *
 * Sem isto o teste reprova por PROSA: um comentário que cite
 * `[data-urna="u1"]` para explicar justamente este defeito conta como um
 * dono do gancho, e o teste acusa dois donos onde há um. Aconteceu na
 * primeira versão deste arquivo, no comentário do próprio demo.js.
 *
 * Um tokenizador de verdade não vale o preço aqui: os arquivos têm regex
 * como `/[&<>"']/g`, com aspas dentro, e distinguir regex de divisão exige
 * saber o token anterior. Comentar por cima é o caso que importa — e só
 * ele. O risco que sobra é o de um comentário de FIM DE LINHA citando o
 * atributo, que reprova à toa; o contrário, um dono de verdade passar
 * batido, não acontece, porque tirar comentário nunca esconde código.
 *
 * Nenhum `/*` aparece dentro de string em public/js, e nenhum `//` aparece
 * no fim de uma linha de código — conferido antes de escrever isto.
 */
function semComentarios(js) {
  return js
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

/** Todo atributo `data-algo="..."` escrito num arquivo, com o arquivo. */
function atributos(nome, texto) {
  // `data-urna-id` viraria `urna-id`: comparar o nome INTEIRO é o que separa
  // os dois atributos, que são diferentes.
  return [...semComentarios(texto).matchAll(/\bdata-([a-z-]+)\s*=/g)]
    .map((m) => ({ arquivo: nome, gancho: m[1] }));
}

test('só o cartão do placar responde por data-urna', () => {
  /*
   * A varredura é sobre TODOS os módulos, e não só sobre o demo.js: o valor
   * do teste está em ele falhar quando alguém, em qualquer arquivo novo,
   * batizar um gancho com um nome que já tem dono.
   */
  const donos = [];
  for (const arquivo of readdirSync(raiz, { recursive: true })) {
    if (!String(arquivo).endsWith('.js')) continue;
    const texto = readFileSync(new URL(String(arquivo), raiz), 'utf8');
    for (const a of atributos(String(arquivo), texto)) {
      if (a.gancho === 'urna') donos.push(a.arquivo);
    }
  }

  assert.deepEqual(donos, ['placar.js'],
    `data-urna tem ${donos.length} donos (${donos.join(', ')}): `
    + 'o dono é o cartão do placar, e mais ninguém');
});

test('nenhum controle de operação vive na página que o OBS captura', () => {
  /*
   * A barra de demonstração saiu daqui na Etapa 4, quando o motor de votos
   * passou a existir: quem dispara presente de teste, abre e fecha rodada e
   * edita a configuração é o painel, em /admin, numa aba separada. A tela do
   * ar não desenha botão nenhum.
   *
   * O teste varre TODOS os módulos que a página do ar carrega, e não só o
   * ponto de entrada: um controle administrativo nasce com a mesma
   * facilidade dentro de um módulo de conveniência, e é justamente aí que
   * ninguém procura.
   *
   * `?clean=1` não esconde nada porque não há o que esconder — e é isso que
   * este teste prende. Um projeto em que a limpeza da captura depende de um
   * parâmetro na URL é um projeto em que esquecer o parâmetro põe um botão no
   * ar.
   */
  const GANCHOS_DE_OPERACAO = ['data-votar', 'data-presente', 'data-rajada',
    'data-nova-rodada', 'data-zoom', 'data-sim', 'data-admin'];
  const achados = [];

  for (const arquivo of readdirSync(raiz, { recursive: true })) {
    if (!String(arquivo).endsWith('.js')) continue;
    const nome = String(arquivo).replace(/\\/g, '/');
    // O painel é o outro lado: ele É a interface administrativa, e mora em
    // outra rota, fora do enquadramento.
    if (nome.startsWith('admin/') || nome === 'admin.js') continue;
    const texto = semComentarios(readFileSync(new URL(nome, raiz), 'utf8'));
    for (const gancho of GANCHOS_DE_OPERACAO) {
      if (texto.includes(gancho)) achados.push(`${nome}: ${gancho}`);
    }
  }

  assert.deepEqual(achados, [],
    `a página do ar ganhou controle de operação: ${achados.join(', ')}`);
});

test('o cartão do placar continua com o gancho que o placar usa', () => {
  // A guarda contra o "conserto" errado: tirar `data-urna` do CARTÃO faria os
  // seletores antigos voltarem a funcionar por acidente, e quebraria o que o
  // placar já publica. O dono antigo fica.
  assert.match(PLACAR, /data-urna="\$\{/,
    'o cartão do placar perdeu o data-urna, que é o gancho dele');
});
