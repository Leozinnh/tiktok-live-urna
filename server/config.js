/**
 * A configuração do servidor.
 *
 * O navegador tem a dele — public/js/config.js — e continua sendo quem
 * desenha a cena. Esta aqui existe porque o MOTOR DE VOTOS precisa saber,
 * sem navegador nenhum, quais urnas existem, qual o número de cada uma e
 * quanto vale cada presente: é com isso que ele conta.
 *
 * São duas leituras do MESMO arquivo, e é de propósito. O que não pode haver
 * é duas verdades sobre a contagem, e por isso `pontosDoPresente` — quanto
 * vale um presente — mora aqui, num lugar só, e é a regra que a especificação
 * descreve na seção 6.1.
 *
 * Os PADRÕES moram neste arquivo, e não num `config/default.json`.
 * A especificação lista um arquivo de padrões na árvore de arquivos; ele
 * sairia pior do que isto por um motivo só: a seção 7 pede que configuração
 * corrompida caia no padrão sem derrubar a live, e um padrão que mora num
 * arquivo que pode sumir não serve para isso. Aqui ele é validado pelo
 * mesmo caminho que o do usuário e não tem como faltar.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** A mesma expressão de public/js/urna.js: o que o CSS aceita como cor. */
export const COR_VALIDA = /^#[0-9a-f]{3}$|^#[0-9a-f]{6}$|^#[0-9a-f]{8}$/i;

/**
 * O número que a urna sabe desenhar: de um a cinco dígitos.
 *
 * Dois é o caso comum, três é senador, cinco é vereador. Oito dígitos não
 * são um número de urna — são um telefone digitado por engano no arquivo.
 */
const NUMERO_VALIDO = /^\d{1,5}$/;

/** As três políticas de fim de rodada da especificação, seção 6.3. */
export const POLITICAS_DE_ENCERRAMENTO = ['processar-recebidos', 'corte-exato', 'tolerancia-2s'];

/** Os dois lados possíveis da integração. `tiktok` chega na Etapa 7. */
export const MODOS_DE_INTEGRACAO = ['simulador', 'tiktok'];

const texto = (v) => (typeof v === 'string' ? v.trim() : '');
const ehObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const numeroFinito = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Os padrões do projeto.
 *
 * As duas urnas são as mesmas de public/js/demo.js — as posições no palco
 * ficam lá, porque o servidor não desenha nada, e a identidade fica aqui,
 * porque é ela que o motor de votos precisa para contar.
 */
export const PADRAO = Object.freeze({
  urnas: Object.freeze({
    u1: Object.freeze({
      id: 'u1', nome: 'URNA 1', numero: '22', cargo: 'DEPUTADO FEDERAL',
      corPrimaria: '#1a5fd0', corSecundaria: '#0d3a8f', corTexto: '#ffffff',
      cargoEmDisputa: 'DEPUTADO FEDERAL',
      ativo: true, ordem: 0, multiplicador: 1,
      candidato: Object.freeze({ nome: 'Ana Prado', partido: 'PARTIDO A', foto: '' }),
    }),
    u2: Object.freeze({
      id: 'u2', nome: 'URNA 2', numero: '13', cargo: 'DEPUTADO FEDERAL',
      corPrimaria: '#e02020', corSecundaria: '#8f0d0d', corTexto: '#ffffff',
      cargoEmDisputa: 'DEPUTADO FEDERAL',
      ativo: true, ordem: 1, multiplicador: 1,
      candidato: Object.freeze({ nome: 'Bruno Tavares', partido: 'PARTIDO B', foto: '' }),
    }),
  }),
  presentes: Object.freeze([
    Object.freeze({
      id: 'p1', nome: 'Joinha', giftId: '1', moedas: 1, urnaId: 'u1', votos: 1,
      ativo: true, efeito: 'faisca', prioridade: 0, cooldownMs: 0,
    }),
    Object.freeze({
      id: 'p2', nome: 'Rosa', giftId: '2', moedas: 1, urnaId: 'u2', votos: 1,
      ativo: true, efeito: 'faisca', prioridade: 0, cooldownMs: 0,
    }),
  ]),
  rodada: Object.freeze({
    duracaoSegundos: 300, politica: 'processar-recebidos', toleranciaMs: 2000,
  }),
  animacao: Object.freeze({ velocidade: 1 }),
  placar: Object.freeze({
    mensagemLideranca: '{urna} ASSUMIU A LIDERANÇA!',
    mensagemVitoria: '{urna} VENCEU!',
    mensagemEmpate: 'EMPATE NA DISPUTA!',
  }),
  integracao: Object.freeze({ modo: 'simulador', usuario: '' }),
});

/**
 * Remendo recursivo: o que veio por cima vence campo a campo.
 *
 * Objetos descem; LISTAS SUBSTITUEM. Remendar lista por índice é o caminho
 * mais curto para o presente 3 do usuário virar o presente 3 do padrão sem
 * ninguém entender por quê — quem manda a lista, manda a lista inteira.
 *
 * Nunca escreve na base: os padrões são um módulo congelado, e um remendo
 * que escrevesse neles envenenaria todas as leituras seguintes do processo.
 */
export function mesclar(base, remendo) {
  if (!ehObjeto(remendo)) return base;
  const saida = { ...base };
  for (const [chave, valor] of Object.entries(remendo)) {
    saida[chave] = ehObjeto(valor) && ehObjeto(base?.[chave])
      ? mesclar(base[chave], valor)
      : valor;
  }
  return saida;
}

/**
 * A lista de urnas, aceita nas duas formas.
 *
 * A especificação escreve `urnas` como LISTA com `id` dentro; o projeto usa
 * OBJETO indexado por id, que é melhor para remendar um campo só. Duas
 * verdades que discordam é pior do que qualquer uma das duas, então as duas
 * entram — e saem sempre como objeto, que é a forma canônica.
 */
function comoObjetoDeUrnas(bruto) {
  if (Array.isArray(bruto)) {
    const saida = {};
    for (const u of bruto) {
      if (ehObjeto(u) && texto(u.id)) saida[u.id] = u;
    }
    return saida;
  }
  return ehObjeto(bruto) ? bruto : {};
}

/** Uma urna conferida, com o motivo de cada troca registrado. */
function conferirUrna(id, bruto, padrao, avisos) {
  const p = padrao ?? {
    id, nome: id, numero: '', cargo: '', corPrimaria: '#8a8f98',
    corSecundaria: '#8a8f98', corTexto: '#ffffff',
    ativo: true, ordem: 0, multiplicador: 1,
    candidato: { nome: '', partido: '', foto: '' },
  };
  const diz = (campo) => `urnas.${id}.${campo}`;
  const u = { ...p, ...bruto, id };

  if (!NUMERO_VALIDO.test(texto(u.numero))) {
    avisos.push(`${diz('numero')}: "${u.numero}" não é um número de urna; usei "${p.numero}"`);
    u.numero = p.numero;
  }
  for (const campo of ['corPrimaria', 'corSecundaria', 'corTexto']) {
    if (u[campo] != null && !COR_VALIDA.test(String(u[campo]))) {
      avisos.push(`${diz(campo)}: "${u[campo]}" não é uma cor; usei "${p[campo]}"`);
      u[campo] = p[campo];
    }
  }
  /*
   * Multiplicador zero não passa. Ele não é "esta urna não vale nada" — é
   * uma urna que recebe votos e mostra zero no placar, que é a pior coisa
   * que este projeto pode fazer na frente de quem presenteou.
   */
  if (!numeroFinito(u.multiplicador) || u.multiplicador <= 0) {
    avisos.push(`${diz('multiplicador')}: "${u.multiplicador}" tem que ser maior que zero; usei 1`);
    u.multiplicador = 1;
  }
  if (typeof u.ativo !== 'boolean') u.ativo = p.ativo;
  if (!numeroFinito(u.ordem)) u.ordem = p.ordem;
  u.nome = texto(u.nome) || p.nome;

  const c = ehObjeto(bruto.candidato) ? bruto.candidato : {};
  u.candidato = {
    nome: texto(c.nome) || p.candidato?.nome || '',
    partido: texto(c.partido) || p.candidato?.partido || '',
    foto: texto(c.foto) || p.candidato?.foto || '',
  };
  return u;
}

/** Um presente conferido. Presente sem id é recusado inteiro. */
function conferirPresente(bruto, idsDeUrna, avisos, indice) {
  const id = texto(bruto.id);
  if (!id) {
    avisos.push(`presentes[${indice}]: sem id, recusado — sem nome pelo qual ser mapeado`);
    return null;
  }
  const p = {
    id, nome: id, giftId: id, moedas: 0, urnaId: null, votos: 1,
    ativo: true, efeito: '', prioridade: 0, cooldownMs: 0,
  };
  const g = { ...p, ...bruto, id };
  g.nome = texto(g.nome) || id;
  g.giftId = texto(g.giftId) || id;
  if (!numeroFinito(g.votos) || g.votos < 0) {
    avisos.push(`presentes.${id}.votos: "${g.votos}" não é uma contagem; usei 1`);
    g.votos = 1;
  }
  for (const campo of ['moedas', 'prioridade', 'cooldownMs']) {
    if (!numeroFinito(g[campo]) || g[campo] < 0) g[campo] = 0;
  }
  if (typeof g.ativo !== 'boolean') g.ativo = true;
  g.efeito = texto(g.efeito);

  const alvo = texto(g.urnaId);
  if (alvo && !idsDeUrna.has(alvo)) {
    /*
     * Presente órfão: aponta para uma urna que não existe. Vira presente SEM
     * urna, e não presente com a urna errada — a especificação manda
     * registrar no log e não contar voto, e contar para a urna errada seria
     * pior do que não contar.
     */
    avisos.push(`presentes.${id}.urnaId: "${alvo}" não existe; o presente não conta`);
    g.urnaId = null;
  } else {
    g.urnaId = alvo || null;
  }
  return g;
}

/** Uma escolha dentro de uma lista fechada, ou o padrão com aviso. */
function conferirEscolha(valor, permitidos, padrao, rotulo, avisos) {
  if (valor == null) return padrao;
  if (permitidos.includes(valor)) return valor;
  avisos.push(`${rotulo}: "${valor}" não é uma das opções (${permitidos.join(', ')}); usei "${padrao}"`);
  return padrao;
}

/**
 * Confere a configuração e devolve `{ config, avisos }`.
 *
 * Nunca lança. A regra é a da seção 7 da especificação: configuração
 * corrompida não derruba a live — o campo ruim vira o padrão, e o motivo
 * sai em `avisos` para o painel mostrar. Engolir em silêncio deixaria o
 * Leonardo procurando na tela por que a urna dele ficou azul.
 */
export function normalizar(bruto = {}) {
  const avisos = [];
  const fonte = ehObjeto(bruto) ? bruto : {};
  const base = { ...PADRAO, ...fonte };

  const urnasBrutas = comoObjetoDeUrnas(base.urnas);
  const urnas = {};
  const ids = new Set(Object.keys(PADRAO.urnas));
  for (const id of Object.keys(urnasBrutas)) ids.add(id);
  for (const id of ids) {
    const padrao = PADRAO.urnas[id];
    const veio = urnasBrutas[id];
    if (!veio && !padrao) continue;
    urnas[id] = conferirUrna(id, ehObjeto(veio) ? veio : {}, padrao, avisos);
  }

  const listaDePresentes = Array.isArray(base.presentes) ? base.presentes : PADRAO.presentes;
  const presentes = listaDePresentes
    .map((p, i) => (ehObjeto(p) ? conferirPresente(p, ids, avisos, i) : null))
    .filter(Boolean);

  const rodada = {
    duracaoSegundos: numeroFinito(base.rodada?.duracaoSegundos) && base.rodada.duracaoSegundos > 0
      ? base.rodada.duracaoSegundos : PADRAO.rodada.duracaoSegundos,
    politica: conferirEscolha(base.rodada?.politica, POLITICAS_DE_ENCERRAMENTO,
      PADRAO.rodada.politica, 'rodada.politica', avisos),
    toleranciaMs: numeroFinito(base.rodada?.toleranciaMs) && base.rodada.toleranciaMs >= 0
      ? base.rodada.toleranciaMs : PADRAO.rodada.toleranciaMs,
  };

  const velocidade = base.animacao?.velocidade;
  const animacao = {
    velocidade: numeroFinito(velocidade) && velocidade > 0 ? velocidade : PADRAO.animacao.velocidade,
  };

  const placar = {
    mensagemLideranca: texto(base.placar?.mensagemLideranca) || PADRAO.placar.mensagemLideranca,
    mensagemVitoria: texto(base.placar?.mensagemVitoria) || PADRAO.placar.mensagemVitoria,
    mensagemEmpate: texto(base.placar?.mensagemEmpate) || PADRAO.placar.mensagemEmpate,
  };

  const integracao = {
    modo: conferirEscolha(base.integracao?.modo, MODOS_DE_INTEGRACAO,
      PADRAO.integracao.modo, 'integracao.modo', avisos),
    usuario: texto(base.integracao?.usuario),
  };

  return { config: { urnas, presentes, rodada, animacao, placar, integracao }, avisos };
}

/**
 * Quanto vale este presente nesta urna.
 *
 * A conta da seção 6.1: `votos × multiplicador da urna × combo`. O combo é o
 * contador que a TikTok manda quando alguém manda o mesmo presente várias
 * vezes seguidas — mandar cinco rosas de uma vez é um evento com combo 5, e
 * não cinco eventos.
 *
 * Devolve 0 quando o presente não tem urna: presente órfão não conta, e zero
 * é a resposta honesta para "quanto ele vale".
 */
export function pontosDoPresente(presente, urna, combo = 1) {
  if (!presente || !urna) return 0;
  if (presente.ativo === false || urna.ativo === false) return 0;
  const votos = numeroFinito(presente.votos) ? presente.votos : 1;
  const multiplicador = numeroFinito(urna.multiplicador) && urna.multiplicador > 0 ? urna.multiplicador : 1;
  const vezes = numeroFinito(combo) && combo > 0 ? Math.floor(combo) : 1;
  return votos * multiplicador * vezes;
}

/**
 * Lê `config/local.json` e devolve `{ config, avisos, erro }`.
 *
 * Nunca rejeita. Arquivo ausente é o caso normal — é assim que o projeto
 * nasce — e JSON quebrado tem que dar uma cena de pé com os padrões e um
 * aviso visível, não uma tela preta.
 */
export async function carregar(caminhoLocal) {
  let bruto = {};
  let erro = null;
  try {
    bruto = JSON.parse(await readFile(caminhoLocal, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') erro = `${caminhoLocal}: ${e.message}`;
  }
  const { config, avisos } = normalizar(bruto);
  return { config, avisos, erro, bruto: ehObjeto(bruto) ? bruto : {} };
}

/**
 * Grava o remendo do painel em `config/local.json`.
 *
 * Grava o ARQUIVO INTEIRO — o que já estava lá mais o remendo —, e não só o
 * que mudou: o painel manda um campo de cada vez, e um arquivo que guardasse
 * apenas o último campo mexido perderia a foto configurada na semana
 * passada.
 *
 * Devolve `{ config, avisos }` como `carregar`, para quem gravou já saber
 * como o motor ficou.
 */
export async function salvar(caminhoLocal, remendo) {
  const { bruto } = await carregar(caminhoLocal);
  const novo = mesclar(bruto, remendo);
  await mkdir(dirname(caminhoLocal), { recursive: true });
  await writeFile(caminhoLocal, `${JSON.stringify(novo, null, 2)}\n`, 'utf8');
  const { config, avisos } = normalizar(novo);
  return { config, avisos, bruto: novo };
}

/** O caminho do arquivo do usuário, a partir da raiz do projeto. */
export function caminhoDaConfig(raiz) {
  return join(raiz, 'config', 'local.json');
}
