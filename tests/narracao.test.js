import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarNarrador, preencher, FALAS_PADRAO } from '../server/narracao.js';

/*
 * Quem fala o que, e quando fica quieto.
 *
 * Este módulo decide UMA coisa: dada a chegada de um evento social, sai fala
 * ou sai silêncio. Ele não sintetiza, não toca e não conhece o navegador — é
 * puro de propósito, porque é aqui que moram as regras que ninguém consegue
 * conferir de ouvido no meio de uma live.
 *
 * A regra que dá mais trabalho é a do silêncio. Numa live movimentada chegam
 * dezenas de entradas por minuto, e o TikTok repete a entrada de quem sai e
 * volta. Um narrador que fala tudo o que chega vira uma metralhadora de nomes
 * que ninguém entende — e o que era para dar boas-vindas passa a atrapalhar.
 * Por isso há cooldown por pessoa, e por isso ele é testado com relógio
 * injetado: um teste que espera 60 segundos de verdade não roda.
 */

/* ---------------------------------------------------------- o preenchedor */

test('a fala troca o nome de quem chegou', () => {
  assert.equal(preencher('Olha o {nome} aí!', { nome: 'Ana' }), 'Olha o Ana aí!');
});

test('o nome em branco não deixa buraco na frase', () => {
  /*
   * O apelido vem da rede e pode chegar vazio — a TikTok manda `nickname`
   * nulo para conta sem nome definido. "Olha o  aí!" na tela é o tipo de coisa
   * que só aparece na transmissão.
   */
  assert.equal(preencher('Fala, {nome}!', { nome: '' }), 'Fala, Alguém!');
  assert.equal(preencher('Fala, {nome}!', { nome: '   ' }), 'Fala, Alguém!');
  assert.equal(preencher('Fala, {nome}!', {}), 'Fala, Alguém!');
});

test('a mesma frase com dois marcadores troca os dois', () => {
  // `replace` sem `/g` trocaria só o primeiro, e a frase sairia com o segundo
  // `{nome}` cru na tela — visível, feio, e fácil de não notar no teste.
  assert.equal(
    preencher('{nome} mandou {quantidade} e o {nome} é fera', { nome: 'Bia', quantidade: 3 }),
    'Bia mandou 3 e o Bia é fera',
  );
});

/* ------------------------------------------------------------- a escolha */

const TUDO = { seguidor: ['Seguiu: {nome}', 'Mais um: {nome}'] };

/** Narrador com relógio e sorteio na mão: 0 sempre pega o primeiro do saco. */
function montar({ falas = TUDO, aoNarrar = null } = {}) {
  let relogio = 0;
  const narrador = criarNarrador({
    falas,
    sorteio: () => 0,
    agora: () => relogio,
    aoNarrar,
  });
  return { narrador, avancar: (ms) => { relogio += ms; } };
}

const seguidor = (nome, userId = nome) => ({ tipo: 'seguidor', usuario: nome, userId });

test('o seguidor vira uma fala com o nome dele', () => {
  const { narrador } = montar();
  const fala = narrador.narrar(seguidor('Ana'));
  assert.match(fala, /Ana/);
});

test('a mesma frase nunca sai duas vezes seguidas', () => {
  /*
   * Duas pessoas diferentes seguidas, as duas frases no sorteio. Sem esta
   * regra o sorteio pode devolver a mesma duas vezes, e a live ouve "mais um
   * seguidor" duas vezes colado — o que soa como um bug, mesmo sendo sorte.
   *
   * O sorteio devolve 0 sempre, então o saco é quem garante a diferença: ele
   * recarrega sem o último que saiu.
   */
  const { narrador } = montar();
  const primeira = narrador.narrar(seguidor('Ana'));
  const segunda = narrador.narrar(seguidor('Bia'));
  assert.notEqual(primeira, segunda, 'a mesma frase saiu duas vezes seguidas');
  const terceira = narrador.narrar(seguidor('Caio'));
  assert.notEqual(segunda, terceira);
});

test('o baralho dá a volta: todas as frases saem antes de qualquer uma repetir', () => {
  /*
   * O sorteio devolve 0 sempre, então quem escolhe é o saco. Com quatro
   * frases, as quatro primeiras falas têm que ser as quatro diferentes — se
   * o saco for reconstruído a cada fala, ele degenera em alternar entre a
   * primeira e a segunda, e as frases 3 e 4 NUNCA são ditas. Numa live de
   * três horas isso é a mesma frase pela metade da noite, que é exatamente o
   * que a alternância existe para evitar.
   */
  const falas = { seguidor: ['A: {nome}', 'B: {nome}', 'C: {nome}', 'D: {nome}'] };
  const narrador = criarNarrador({ falas, sorteio: () => 0 });
  // Quatro PESSOAS diferentes para o cooldown não calar ninguém, mas com o
  // mesmo nome: assim a única coisa que distingue uma fala da outra é a frase.
  // Com nomes diferentes o teste passaria sempre, comparando nomes.
  const ditas = ['a1', 'a2', 'a3', 'a4'].map((id) => narrador.narrar(seguidor('Ana', id)));
  assert.deepEqual(
    new Set(ditas).size, 4,
    `as quatro frases deviam sair uma vez cada, e saíram: ${JSON.stringify(ditas)}`,
  );
});

test('com uma frase só, ela repete sem drama', () => {
  // A regra do "não repete" não pode virar silêncio quando não há alternativa:
  // quem apagou as frases extras no painel ainda quer ouvir o aviso.
  const { narrador } = montar({ falas: { seguidor: ['Só esta: {nome}'] } });
  assert.equal(narrador.narrar(seguidor('Ana')), 'Só esta: Ana');
  assert.equal(narrador.narrar(seguidor('Bia')), 'Só esta: Bia');
});

/* ----------------------------------------------------------- o cooldown */

test('a mesma pessoa não é anunciada duas vezes seguidas', () => {
  /*
   * O TikTok repete a entrada de quem sai e volta, e a rede entrega o mesmo
   * evento mais de uma vez quando a conexão oscila. Sem cooldown, a live ouve
   * o nome do mesmo sujeito três vezes em cinco segundos.
   */
  const { narrador } = montar({ falas: { entrada: ['Oi, {nome}'] } });
  assert.equal(narrador.narrar({ tipo: 'entrada', usuario: 'Ana', userId: 'ana' }), 'Oi, Ana');
  assert.equal(narrador.narrar({ tipo: 'entrada', usuario: 'Ana', userId: 'ana' }), null);
});

test('passado o cooldown, a mesma pessoa é anunciada de novo', () => {
  // Sair e voltar meia hora depois é uma chegada nova, e merece o oi de novo.
  const { narrador, avancar } = montar({ falas: { entrada: ['Oi, {nome}'] } });
  const ana = { tipo: 'entrada', usuario: 'Ana', userId: 'ana' };
  assert.ok(narrador.narrar(ana));
  avancar(61_000);
  assert.ok(narrador.narrar(ana), 'a Ana voltou depois de um minuto e ninguém falou nada');
});

test('o cooldown é de cada pessoa, e não da live', () => {
  // A versão ingênua — um cooldown só para o tipo — faria a chegada da Ana
  // calar a chegada da Bia, e numa live com gente entrando não se ouviria
  // mais ninguém.
  const { narrador } = montar({ falas: { entrada: ['Oi, {nome}'] } });
  assert.ok(narrador.narrar({ tipo: 'entrada', usuario: 'Ana', userId: 'ana' }));
  assert.equal(narrador.narrar({ tipo: 'entrada', usuario: 'Bia', userId: 'bia' }), 'Oi, Bia');
});

test('o cooldown é de cada tipo, e não da pessoa', () => {
  // Quem entra e logo segue merece as duas falas. Um cooldown por pessoa
  // engoliria o agradecimento do follow, que é o momento mais importante.
  const { narrador } = montar({
    falas: { entrada: ['Oi, {nome}'], seguidor: ['Valeu, {nome}'] },
  });
  assert.ok(narrador.narrar({ tipo: 'entrada', usuario: 'Ana', userId: 'ana' }));
  assert.equal(narrador.narrar({ tipo: 'seguidor', usuario: 'Ana', userId: 'ana' }), 'Valeu, Ana');
});

/* ------------------------------------------------------------- a curtida */

test('uma curtida sozinha não merece fala', () => {
  /*
   * O TikTok manda um evento por toque. Narrar cada um encheria a fila de
   * fala com "valeu pela curtida" centenas de vezes, e o narrador ficaria
   * minutos atrás da live.
   */
  const { narrador } = montar({ falas: { curtida: ['{quantidade} curtidas, {nome}'] } });
  assert.equal(narrador.narrar({ tipo: 'curtida', usuario: 'Ana', userId: 'ana', quantidade: 1 }), null);
  assert.equal(narrador.narrar({ tipo: 'curtida', usuario: 'Ana', userId: 'ana', quantidade: 2 }), null);
});

test('a rajada de curtidas vira UMA fala, com o total junto', () => {
  /*
   * Vinte toques seguidos são um gesto só, e é assim que a live deve ouvir.
   *
   * O número subiu de cinco para vinte em 2026-10-15, para casar com o
   * `tiktok-live-horse`, onde ele foi ajustado ouvindo a live: a cinco, a fala
   * saía em toda rajada pequena e soava como o narrador comemorando qualquer
   * coisa. Quem prende os dois números juntos é o `fonte-tiktok.test.js`.
   */
  const { narrador } = montar({ falas: { curtida: ['{quantidade} curtidas, {nome}'] } });
  const ana = (q) => ({ tipo: 'curtida', usuario: 'Ana', userId: 'ana', quantidade: q });
  assert.equal(narrador.narrar(ana(8)), null);
  assert.equal(narrador.narrar(ana(8)), null);
  assert.equal(narrador.narrar(ana(8)), '24 curtidas, Ana');
  // E a rajada continua depois da fala sem soar de novo na hora.
  assert.equal(narrador.narrar(ana(5)), null);
});

test('a rajada lenta não acumula', () => {
  /*
   * A janela existe para separar gesto de hábito. Se ela não fechasse, quem
   * curtisse uma vez a cada meia hora acabaria ouvindo "24 curtidas" no fim da
   * noite por um gesto que nunca existiu.
   */
  const { narrador, avancar } = montar({ falas: { curtida: ['{quantidade} curtidas, {nome}'] } });
  const ana = { tipo: 'curtida', usuario: 'Ana', userId: 'ana', quantidade: 10 };
  assert.equal(narrador.narrar(ana), null);
  avancar(10_000);
  assert.equal(narrador.narrar(ana), null);
  avancar(10_000);
  assert.equal(narrador.narrar(ana), null, 'a janela não fechou e o total vazou');
});

/* ------------------------------------------------------------- o presente */

test('o presente sem nome de presente não tem o que falar', () => {
  /*
   * O presente que chegou sem catálogo — ou sem urna no mapeamento — não vira
   * voto, e uma frase sobre ele anunciaria um voto que não existiu. Quem fala
   * por esse caso é a cobrança, que pede o número da urna e tem frase própria.
   *
   * A guarda é o que mantém o silêncio verdadeiro: o padrão TEM frases de
   * presente, e sem ela um evento de presente acharia uma — e sairia "Ana
   * mandou !" para a live inteira ouvir.
   *
   * O cooldown também não pode ser gasto por ele: quem manda um presente
   * órfão e depois um mapeado, dez segundos depois, tem que ouvir o mapeado.
   */
  const { narrador } = montar({ falas: { presente: ['{nome} mandou {vezes}{presente}!'] } });
  const semNome = { tipo: 'presente', usuario: 'Ana', userId: 'ana', combo: 1 };
  assert.equal(narrador.narrar(semNome), null, 'falou de um presente que não virou voto');
  assert.equal(
    narrador.narrar({ tipo: 'presente', usuario: 'Ana', userId: 'ana', presente: 'Rosa', combo: 1 }),
    'Ana mandou Rosa!',
    'o presente órfão calou o presente que valeu',
  );
});

test('o presente conta quem mandou, o que mandou, quantos, e pra quem', () => {
  /*
   * O presente é o único evento que a pessoa PAGA para acontecer, e até esta
   * versão ele não era falado: a tela animava e a voz ficava quieta.
   *
   * Os quatro dados são o que a frase precisa para valer a pena. O nome, para
   * quem mandou se ouvir; o presente, para a live saber o que passou na tela;
   * o `5x`, para um combo não soar igual a um presente único; e a urna, porque
   * é o que a pessoa quer saber — o dinheiro dela virou voto de QUEM.
   */
  const { narrador } = montar({ falas: { presente: ['{nome} mandou {vezes}{presente} pra {urna}'] } });
  assert.equal(
    narrador.narrar({
      tipo: 'presente', usuario: 'Ana', userId: 'ana', presente: 'Rosa', combo: 5, urna: 'Lula',
    }),
    'Ana mandou 5x Rosa pra Lula',
  );
});

test('um presente só não vira "1x"', () => {
  /*
   * "mandou 1x Rosa" não é como uma pessoa fala — é "mandou Rosa". O combo 1
   * deixa o marcador vazio, e a frase sai inteira sem ele.
   *
   * É a mesma convenção do `tiktok-live-horse`, de onde as frases vieram, e
   * por isso ela é conferida aqui: um marcador que deixasse "1x" passar
   * apareceria em TODA fala de presente, a noite inteira.
   */
  const { narrador } = montar({ falas: { presente: ['{nome} mandou {vezes}{presente}!'] } });
  const ana = (combo) => ({
    tipo: 'presente', usuario: 'Ana', userId: 'ana', presente: 'Rosa', combo, urna: 'Lula',
  });
  assert.equal(narrador.narrar(ana(1)), 'Ana mandou Rosa!');
});

test('quem manda presente sem parar não vira uma fala por presente', () => {
  /*
   * O presente é o evento mais repetível da live: quem gosta manda dez
   * seguidos. Sem cooldown, são dez falas enfileiradas — a fila inteira
   * parada atrás de uma pessoa, e a chegada de quem entrou depois falada um
   * minuto tarde.
   *
   * O primeiro presente SEMPRE fala: é ele que a pessoa está esperando ouvir.
   * O segundo, trinta segundos depois, fala de novo — o cooldown é curto de
   * propósito, porque calar quem presenteia a noite inteira é perder o evento
   * que paga a live.
   */
  const { narrador, avancar } = montar({ falas: { presente: ['{presente}, {nome}'] } });
  const ana = { tipo: 'presente', usuario: 'Ana', userId: 'ana', presente: 'Rosa', combo: 1, urna: 'Lula' };
  assert.equal(narrador.narrar(ana), 'Rosa, Ana');
  assert.equal(narrador.narrar(ana), null, 'o segundo presente falou na hora');
  avancar(31_000);
  assert.equal(narrador.narrar(ana), 'Rosa, Ana', 'o cooldown do presente é longo demais');
});

test('a mesma pessoa pode presentear e seguir: são falas diferentes', () => {
  /*
   * O cooldown é por TIPO e por pessoa, e não só por pessoa. Quem acabou de
   * seguir e logo manda um presente fez duas coisas, e as duas merecem ser
   * ditas — com uma chave só por pessoa, a segunda ficaria muda e a live
   * pareceria ter ignorado o presente.
   */
  const { narrador } = montar({
    falas: { presente: ['{presente}, {nome}'], seguidor: ['Seguiu, {nome}'] },
  });
  const ana = { usuario: 'Ana', userId: 'ana' };
  assert.equal(narrador.narrar({ ...ana, tipo: 'seguidor' }), 'Seguiu, Ana');
  assert.equal(narrador.narrar({ ...ana, tipo: 'presente', presente: 'Rosa', combo: 1 }), 'Rosa, Ana');
});

/* --------------------------------------------------------- o que se cala */

test('um evento sem tipo conhecido não narra nada', () => {
  const { narrador } = montar();
  assert.equal(narrador.narrar({ tipo: 'dancou', usuario: 'Ana' }), null);
  assert.equal(narrador.narrar({ usuario: 'Ana' }), null);
  assert.equal(narrador.narrar(null), null);
});

test('um tipo sem frase configurada fica em silêncio, e não estoura', () => {
  // O painel deixa apagar a lista inteira. Um `undefined` na tela da live é
  // pior do que não falar.
  const { narrador } = montar({ falas: { seguidor: [] } });
  assert.equal(narrador.narrar(seguidor('Ana')), null);
});

test('sem lista nenhuma no config, valem as frases que vêm no código', () => {
  /*
   * Uma lista vazia no painel é mais provável de ser campo esquecido do que
   * vontade de ficar mudo — para ficar mudo existe o interruptor. Então o
   * padrão do código assume, e o painel mostra ele escrito desde o começo.
   */
  const { narrador } = montar({ falas: {} });
  assert.ok(FALAS_PADRAO.seguidor.length > 0, 'o padrão do seguidor está vazio');
  assert.match(narrador.narrar(seguidor('Ana')), /Ana/);
});

test('o padrão tem frase para todo tipo social', () => {
  // Um tipo que passa pela normalização e não tem frase é um evento que
  // atravessa o sistema inteiro para morrer no fim, em silêncio.
  for (const tipo of ['seguidor', 'curtida', 'entrada', 'compartilhou', 'assinatura', 'presente']) {
    assert.ok(FALAS_PADRAO[tipo]?.length > 0, `falta a frase padrão de ${tipo}`);
  }
});

test('nenhuma frase do padrão se repete dentro da mesma lista', () => {
  /*
   * O baralho existe para TODAS as frases de um tipo serem ditas antes de
   * qualquer uma repetir. Uma frase escrita duas vezes na lista encurta o
   * baralho em silêncio: a mesma fala sai duas vezes na mesma rodada e a live
   * ouve isso como defeito, não como sorte.
   *
   * A lista é escrita à mão, uma linha embaixo da outra, e repetir uma é o
   * erro mais fácil de cometer e o mais difícil de achar relendo.
   */
  for (const [tipo, lista] of Object.entries(FALAS_PADRAO)) {
    const vistas = new Set();
    for (const frase of lista) {
      assert.ok(!vistas.has(frase), `a frase "${frase}" aparece duas vezes em ${tipo}`);
      vistas.add(frase);
    }
  }
});

test('as frases podem vir de uma função, e são lidas na hora de falar', () => {
  /*
   * O painel troca a configuração com a live no ar, e o hub guarda a
   * configuração numa variável que ele troca inteira a cada salvamento. Se o
   * narrador guardasse a lista do momento em que nasceu, a frase editada só
   * valeria depois de reiniciar o servidor — o Leonardo editaria, ouviria a
   * antiga, e não teria como saber por quê.
   */
  let falas = { seguidor: ['Antes: {nome}'] };
  const narrador = criarNarrador({ falas: () => falas, sorteio: () => 0 });
  assert.equal(narrador.narrar(seguidor('Ana')), 'Antes: Ana');
  falas = { seguidor: ['Depois: {nome}'] };
  assert.equal(narrador.narrar(seguidor('Bia', 'bia')), 'Depois: Bia');
});

test('a frase trocada no meio da live entra no sorteio na hora', () => {
  /*
   * A troca não pode valer só para a próxima frase: o baralho guarda o
   * último que saiu para não repetir, e ele precisa perceber que a lista
   * mudou. Sem isso, quem troca as frases no painel ouviria as antigas até o
   * baralho esvaziar — que é justamente quando ele seria reabastecido com a
   * lista velha que ficou guardada.
   */
  let falas = { seguidor: ['Velha A: {nome}', 'Velha B: {nome}'] };
  const narrador = criarNarrador({ falas: () => falas, sorteio: () => 0 });
  assert.equal(narrador.narrar(seguidor('Ana')), 'Velha A: Ana');
  falas = { seguidor: ['Nova: {nome}'] };
  assert.equal(narrador.narrar(seguidor('Bia', 'bia')), 'Nova: Bia');
});

test('a fala pronta é entregue a quem pediu para saber', () => {
  // O hub precisa do texto para mandar à tela junto com o áudio. O narrador
  // avisa — ele não conhece WebSocket nem arquivo.
  const ditas = [];
  const { narrador } = montar({ aoNarrar: (f) => ditas.push(f) });
  const fala = narrador.narrar(seguidor('Ana'));
  assert.deepEqual(ditas, [fala]);
  assert.equal(ditas[0], fala);
});

/* ------------------------------------ o que a voz fala, e não o que a tela escreve */

/*
 * O apelido do TikTok é escrito para ser LIDO, não para ser falado.
 *
 * Ele vem com emoji, com bandeira, com coração, com cifrão — e um sintetizador
 * de voz neural ou tenta ler aquilo (e sai "bandeira do Brasil" no meio do
 * nome de quem chegou) ou trava na pontuação. O nome tem que chegar na voz
 * como uma pessoa diria: só as letras.
 *
 * A limpeza acontece ANTES da frase ser montada, e vale para a tela também.
 * É uma decisão: a faixa que o OBS captura mostra o mesmo texto que a voz
 * fala. Duas versões do mesmo nome — uma escrita e outra falada — divergiriam
 * no dia em que alguém mexesse numa só, e ninguém veria.
 */

test('o emoji do apelido não chega na voz', () => {
  assert.equal(preencher('Fala, {nome}!', { nome: 'caioba🇧🇷✋🏽😛' }), 'Fala, caioba!');
  assert.equal(preencher('Fala, {nome}!', { nome: '🔥Ana🔥' }), 'Fala, Ana!');
});

test('o arroba do apelido não é pronunciado', () => {
  // O @ é o jeito como o TikTok escreve o usuário, e a voz não tem o que
  // fazer com ele: ou vira "arroba" no meio do nome, ou vira uma pausa
  // estranha.
  assert.equal(preencher('Fala, {nome}!', { nome: '@maria.silva' }), 'Fala, maria.silva!');
  assert.equal(preencher('Fala, {nome}!', { nome: '@joao' }), 'Fala, joao!');
});

test('apelido que era só emoji vira Alguém', () => {
  // Sem sobrar letra nenhuma, não há o que falar. "Fala, !" na tela é pior do
  // que "Fala, Alguém!" — e a voz não pode ficar muda para um nome que ela
  // não consegue dizer.
  assert.equal(preencher('Fala, {nome}!', { nome: '👑🔥💎' }), 'Fala, Alguém!');
  assert.equal(preencher('Fala, {nome}!', { nome: '🇧🇷' }), 'Fala, Alguém!');
});

test('o apelido todo em maiúsculas vira nome, e não letras soltas', () => {
  /*
   * Voz neural com palavra curta toda em maiúsculas tende a soletrar: "ANA"
   * sai "á-ene-á". Um apelido de três letras em caixa alta é comuníssimo no
   * TikTok, e o efeito no ar é a voz lendo sigla.
   *
   * A regra é cirúrgica de propósito: só mexe em nome que é TODO maiúsculo.
   * Um "João Pedro" com a caixa certa não pode virar "João pedro" — o nome
   * dele na tela é o nome dele.
   */
  assert.equal(preencher('Fala, {nome}!', { nome: 'ANA' }), 'Fala, Ana!');
  assert.equal(preencher('Fala, {nome}!', { nome: 'JOAO PEDRO' }), 'Fala, Joao Pedro!');
  // Já em caixa normal, o nome passa intacto — inclusive o sobrenome com
  // maiúscula no meio da frase.
  assert.equal(preencher('Fala, {nome}!', { nome: 'João Pedro' }), 'Fala, João Pedro!');
  assert.equal(preencher('Fala, {nome}!', { nome: 'mcCain' }), 'Fala, mcCain!');
});

test('o apelido comprido não perde pedaço na limpeza', () => {
  // A limpeza é sobre símbolo, e não sobre tamanho: o corte de 120 caracteres
  // é da faixa, e acontece depois. Um nome com acento, cedilha e hífen é
  // comum e tem que atravessar inteiro.
  assert.equal(preencher('{nome}!', { nome: 'João Conceição' }), 'João Conceição!');
  assert.equal(preencher('{nome}!', { nome: 'ana-clara_92' }), 'ana-clara_92!');
});

test('apelido que só tem emoji cai no @ da pessoa', () => {
  /*
   * É o que o narrador do `tiktok-live-horse` faz, e por um motivo que se vê
   * na live: quem tem o apelido tomado por emoji reconhece o PRÓPRIO @ falado,
   * e o resto do público também — é o nome que aparece embaixo do presente.
   * "Alguém" não é o nome de ninguém.
   *
   * "Alguém" continua sendo o fim da linha, e não o primeiro degrau: ele só
   * entra quando nem o apelido nem o @ têm uma letra que se possa falar.
   */
  assert.equal(preencher('Fala, {nome}!', { nome: '👑🔥💎', usuario: 'caioba92' }), 'Fala, caioba92!');
  // E o @ passa pela mesma limpeza: ele também vem com emoji de quem o trocou.
  assert.equal(preencher('Fala, {nome}!', { nome: '💎', usuario: '@ana🇧🇷' }), 'Fala, ana!');
  // Só o @, sem apelido nenhum — o caso das contas sem nome definido.
  assert.equal(preencher('Fala, {nome}!', { usuario: 'joao' }), 'Fala, joao!');
  // Nada falável em lugar nenhum.
  assert.equal(preencher('Fala, {nome}!', { nome: '🎁', usuario: '🏳️' }), 'Fala, Alguém!');
});
