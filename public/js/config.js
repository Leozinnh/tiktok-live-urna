/**
 * A configuração do usuário — config/local.json.
 *
 * O arquivo fica FORA de public/ de propósito: ele é do Leonardo, não do
 * site, e o servidor o publica por uma rota própria em vez de servir a pasta
 * inteira. Assim ninguém alcança o resto do projeto por acidente.
 *
 * Este módulo é o lado do navegador: ele busca o arquivo, confere o que veio
 * e aplica por cima dos padrões. As funções puras ficam separadas da busca
 * para poderem ser testadas sem rede, e é nelas que mora toda a decisão.
 */
import { COR_VALIDA } from './urna.js';
import { PLACAR_PADRAO } from './placar.js';

/** Onde o servidor publica o arquivo. Ver server/index.js. */
export const URL_DA_CONFIG = '/config/local.json';

export const PASTA_DE_FOTOS = '/fotos/';

/**
 * Quanto dura uma rodada quando ninguém disse.
 *
 * Cinco minutos, o mesmo padrão da spec. É o tempo de uma disputa curta o
 * bastante para caber num bloco de live e longo o bastante para a audiência
 * se mexer.
 */
export const DURACAO_PADRAO = 300;

/**
 * O teto do que a tela aguenta contar.
 *
 * Vinte e quatro horas: acima disso o cronômetro vira um número que ninguém
 * lê, e um número desses no arquivo é quase sempre um zero a mais digitado.
 * O teto LIMITA, e não recusa — ver `duracaoDaRodada`.
 */
const DURACAO_MAXIMA = 86400;

/**
 * A duração da rodada, em segundos inteiros.
 *
 * Nunca devolve um número que não sirva para contar: a configuração vem de
 * um arquivo que o Leonardo edita à mão e de um painel que grava o que ele
 * digitar, e um `0` gravado por engano deixaria o cronômetro do ar nascendo
 * em "0:00" — que, para quem assiste, quer dizer "a votação acabou" enquanto
 * ela está aberta.
 */
export function duracaoDaRodada(cfg, padrao = DURACAO_PADRAO) {
  const bruto = cfg?.rodada?.duracaoSegundos;
  const n = Math.floor(Number(bruto));
  if (!Number.isFinite(n) || n <= 0 || n > DURACAO_MAXIMA) return padrao;
  return n;
}

/**
 * O número da urna, no formato que a tela sabe desenhar.
 *
 * De um a cinco dígitos: dois é o caso comum (deputado, governador), três é
 * senador, e cinco é vereador — que existe e é o mais longo que a urna
 * brasileira mostra. Oito dígitos não são um número de urna, são um telefone
 * digitado por engano no arquivo.
 */
const NUMERO_VALIDO = /^\d{1,5}$/;

/**
 * Transforma o que o usuário escreveu numa URL que o navegador entende.
 *
 * Três formas, e a regra é só o começo do texto:
 *
 *   ana.jpg              -> /fotos/ana.jpg     (arquivo na pasta do projeto)
 *   /fotos/ana.jpg       -> /fotos/ana.jpg     (o mesmo, escrito por inteiro)
 *   https://site/ana.jpg -> https://site/ana.jpg (link de fora)
 *
 * O nome solto é o caso mais provável — é o que se escreve olhando para a
 * pasta `fotos/`. Sem a regra ele viraria uma URL relativa À PÁGINA, e a
 * foto apareceria ou sumiria conforme o endereço aberto no navegador.
 *
 * Devolve `null` quando não há foto, e `null` não é o mesmo que string vazia:
 * `<img src="">` faz o navegador pedir a PRÓPRIA PÁGINA como se fosse imagem.
 */
export function urlDaFoto(foto) {
  if (typeof foto !== 'string') return null;
  const valor = foto.trim();
  if (valor === '') return null;
  if (/^https?:\/\//i.test(valor)) return valor;
  if (valor.startsWith('/')) return valor;
  return PASTA_DE_FOTOS + valor;
}

/** Cópia rasa, com o candidato copiado junto, para não mexer no padrão. */
function clonar(urna) {
  return {
    ...urna,
    candidato: urna.candidato ? { ...urna.candidato } : urna.candidato,
  };
}

/** Um objeto simples — nem nulo, nem lista, nem texto. */
function ehObjeto(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Texto que tem conteúdo depois de aparado. */
function textoUtil(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * Aplica a configuração do usuário por cima dos padrões.
 *
 * É um REMENDO, campo a campo, e não um substituto. Quem só quer trocar a
 * foto escreve só a foto:
 *
 *     { "urnas": { "u1": { "candidato": { "foto": "ana.jpg" } } } }
 *
 * e número, cargo, partido e cor continuam vindo do padrão. Um arquivo que
 * substituísse tudo obrigaria a reescrever a urna inteira para trocar uma
 * imagem — e o dia em que um campo novo nascesse no padrão, ele sumiria
 * para quem já tinha configurado.
 *
 * O que não serve é IGNORADO, e não aplicado: o arquivo é editado à mão, e
 * um `numero` sem aspas ou um `candidato` como texto solto são esperados.
 * Ignorar deixa o padrão no lugar; aplicar deixaria a urna sem número.
 *
 * Nunca acrescenta nem remove urna. Uma chave a mais no arquivo — um `u3`
 * deixado para depois, ou um erro de digitação — não pode fazer nascer uma
 * terceira urna num palco montado para duas.
 */
export function aplicarConfig(padroes, cfg) {
  const urnas = ehObjeto(cfg) ? cfg.urnas : null;
  if (!ehObjeto(urnas)) return padroes.map(clonar);

  return padroes.map((padrao) => {
    const bruto = urnas[padrao.id];
    if (!ehObjeto(bruto)) return clonar(padrao);

    const novo = clonar(padrao);

    if (textoUtil(bruto.numero) && NUMERO_VALIDO.test(bruto.numero.trim())) {
      novo.numero = bruto.numero.trim();
    }
    if (textoUtil(bruto.cargo)) novo.cargo = bruto.cargo;
    if (textoUtil(bruto.nome)) novo.nome = bruto.nome;
    if (textoUtil(bruto.corPrimaria) && COR_VALIDA.test(bruto.corPrimaria.trim())) {
      novo.corPrimaria = bruto.corPrimaria.trim();
    }

    if (ehObjeto(bruto.candidato)) {
      // Campo a campo: trocar a foto não pode apagar o nome nem o partido.
      novo.candidato = { ...(padrao.candidato ?? {}) };
      for (const campo of ['nome', 'partido']) {
        if (textoUtil(bruto.candidato[campo])) novo.candidato[campo] = bruto.candidato[campo];
      }
      const foto = urlDaFoto(bruto.candidato.foto);
      if (foto) novo.candidato.foto = foto;
    }

    return novo;
  });
}

/**
 * As mensagens da faixa do placar, por cima dos padrões da spec.
 *
 * Separada de `aplicarConfig` porque devolve outra coisa — um objeto de
 * textos, e não a lista de urnas — mas a regra é a mesma: remendo campo a
 * campo, e o que não serve é ignorado em vez de aplicado. Uma mensagem em
 * branco no arquivo apagaria a faixa no ar, e a faixa é onde o momento mais
 * importante da disputa vira palavra.
 */
export function aplicarConfigDoPlacar(cfg, padroes = PLACAR_PADRAO) {
  const novo = { ...padroes };
  const bruto = ehObjeto(cfg) ? cfg.placar : null;
  if (!ehObjeto(bruto)) return novo;

  for (const campo of ['mensagemLideranca', 'mensagemEmpate', 'mensagemVitoria']) {
    if (textoUtil(bruto[campo])) novo[campo] = bruto[campo];
  }
  return novo;
}

/**
 * Busca o arquivo e devolve o que dá para aplicar.
 *
 * Nunca rejeita. Um arquivo ausente é o caso NORMAL — é assim que o projeto
 * começa, antes de o Leonardo configurar nada — e não pode virar erro no
 * console nem tela vazia no ar. Um arquivo quebrado é outra coisa, e vem
 * com `erro` preenchido para quem chamou poder MOSTRAR o problema em vez de
 * seguir com a cara errada no ar sem ninguém saber por quê.
 */
export async function carregarConfig(url = URL_DA_CONFIG) {
  let texto;
  try {
    const resposta = await fetch(url, { cache: 'no-store' });
    if (!resposta.ok) return { dados: null, erro: null };
    texto = await resposta.text();
  } catch {
    // Servidor fora do ar, ou a página aberta por file:// — a cena continua
    // com os padrões, que é o que ela já fazia antes de o arquivo existir.
    return { dados: null, erro: null };
  }

  if (!texto.trim()) return { dados: null, erro: null };

  let dados;
  try {
    dados = JSON.parse(texto);
  } catch (e) {
    return { dados: null, erro: `config/local.json não é um JSON válido: ${e.message}` };
  }

  // O servidor já recusa o que não é objeto, e devolve `{ erro }`; conferir
  // aqui também cobre o arquivo aberto sem passar por ele.
  if (ehObjeto(dados) && typeof dados.erro === 'string') return { dados: null, erro: dados.erro };
  if (!ehObjeto(dados)) {
    return { dados: null, erro: 'config/local.json precisa conter um objeto JSON, começando por { e terminando em }.' };
  }

  return { dados, erro: null };
}
