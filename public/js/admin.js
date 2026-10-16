/*
 * O painel: a única interface administrativa do projeto.
 *
 * Ele mora numa rota separada e não compartilha uma linha com a página do ar.
 * Não é organização: é a garantia de que nada que se clica aqui pode aparecer
 * no enquadramento do OBS. A tela do ar não tem botão nenhum, e o teste
 * `tests/ganchos.test.js` varre os módulos dela para prender isso.
 *
 * O painel é um cliente do mesmo hub que a tela do ar — mesmo protocolo, mesmo
 * canal —, com o papel `admin`, que é o que o autoriza a mandar em vez de só
 * receber. Ele não conta voto, não decide rodada e não guarda estado que
 * importe: é uma vista sobre o que o servidor diz, e um formulário que manda
 * remendos de volta. Fechar esta aba no meio da live não muda nada no ar.
 *
 * O que este arquivo faz e o que ele delega:
 *
 *   - montar a tela (abas, grupos, campos) a partir de `admin/abas.js`;
 *   - ler o formulário e virar remendo — `admin/campos.js`, que é puro e
 *     testado sem navegador;
 *   - falar com o servidor — `net.js`, o mesmo canal da página do ar.
 */
import { criarRede, urlDoSocket } from './net.js';
import { montarCampos, patchDe, pendenciasDe, escapar } from './admin/campos.js';
import { ABAS, acharAba, gruposDaAba, camposDaAba, ACOES_SOCIAIS, giftIdSemUrna, numeroDeTeste } from './admin/abas.js';
import { medidores, markupMedidores } from './admin/medidores.js';

const el = (id) => document.getElementById(id);
const abasEl = el('abas');
const secoesEl = el('secoes');
const ajudaEl = el('ajuda');
const barraEl = el('barra');
const recadoEl = el('recado');
const salvarEl = el('salvar');
const medidoresEl = el('medidores');
const estadoEl = el('estado');
const estadoTextoEl = el('estado-texto');

/** A configuração que está valendo AGORA no servidor. */
let config = null;
/** A aba aberta. */
let abaAtual = 'urnas';
/** O log da aba Integração. */
const log = [];
/** Quantos testes de narração já saíram — cada um é uma pessoa diferente. */
let pessoasDeTeste = 0;
/*
 * O último retrato de cada coisa, para os medidores do topo.
 *
 * Eles chegam em mensagens diferentes — o placar a cada voto, a fonte quando
 * ela muda, a rodada a cada segundo —, e o topo mostra os três juntos. Guardar
 * cada um é o que permite redesenhar a faixa inteira sem apagar o que a
 * mensagem de agora não trouxe.
 */
let ultimoPlacar = null;
let ultimaFonte = null;
let ultimaRodada = null;
/** Quantos votos e quantos presentes já passaram por esta sessão do painel. */
const contagem = { votos: 0, presentes: 0 };

/* --------------------------------------------------------------- recados */

/**
 * O recado da barra.
 *
 * O tom existe para o operador ver de longe se o que aconteceu foi bom: no
 * meio de uma live ninguém lê a frase inteira, mas todo mundo vê a cor.
 */
function recado(texto, tom = '') {
  recadoEl.textContent = texto;
  recadoEl.dataset.tom = tom;
}

function anotar(texto, tipo = '') {
  const agora = new Date();
  const hora = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}:${String(agora.getSeconds()).padStart(2, '0')}`;
  log.unshift({ hora, texto, tipo });
  // Cinquenta linhas: a lista rola, e o que o operador quer é poder voltar
  // um pouco para conferir o que ACABOU de chegar. Auditar a live é o banco.
  if (log.length > 50) log.length = 50;
  if (abaAtual === 'integracao') desenharLog();
}

/* ------------------------------------------------------------- a conexão */

const rede = criarRede({
  url: urlDoSocket(location.origin, 'admin'),
  papel: 'admin',
  aoMensagem: tratar,
  aoStatus: ({ conectado, tentativas }) => {
    estadoEl.dataset.estado = conectado ? 'conectado' : 'off';
    estadoTextoEl.textContent = conectado
      ? 'conectado'
      : `sem servidor — tentativa ${tentativas}`;
    if (!conectado) anotar('perdi o servidor', 'erro');
  },
});

function tratar({ tipo, payload }) {
  switch (tipo) {
    case 'state.full':
      if (payload?.config) aplicarConfig(payload.config);
      if (payload?.rodada) atualizarRodada(payload.rodada);
      if (payload?.tally) atualizarPlacar(payload.tally);
      if (payload?.fonte) atualizarFonte(payload.fonte);
      anotar('retrato do servidor recebido');
      break;
    case 'source.status':
      atualizarFonte(payload);
      anotar(`fonte: ${payload?.detalhe ?? payload?.modo ?? '?'}`, 'fonte');
      break;
    case 'config.changed':
      if (payload?.config) aplicarConfig(payload.config);
      anotar('configuração do servidor atualizada');
      // O aviso do servidor é o que transforma uma recusa em algo visível: a
      // seção 7 manda cair para o padrão e AVISAR, e sem mostrar aqui o
      // operador veria "salvo" para uma gravação que não aconteceu.
      if (payload?.avisos?.length) {
        recado(payload.avisos.map((a) => a.texto).join(' · '), 'alerta');
        for (const a of payload.avisos) anotar(`aviso: ${a.texto}`, 'aviso');
      }
      break;
    case 'tally.update':
      atualizarPlacar(payload);
      break;
    case 'vote.counted':
      contagem.votos += 1;
      contagem.presentes += 1;
      atualizarContagem();
      anotar(`voto de ${payload?.usuario ?? '?'} (${payload?.presente ?? '?'}) → ${payload?.urnaId ?? '?'}`, 'voto');
      break;
    case 'round.update':
      atualizarRodada(payload);
      break;
    case 'round.finished':
      atualizarRodada({ ...payload, estado: 'encerrada' });
      anotar(`rodada encerrada (${payload?.motivo ?? '?'})`, 'aviso');
      break;
    case 'vote.animate':
      anotar(`animação na fila: ${payload?.usuario ?? '?'} → ${payload?.urnaId ?? '?'}`, 'animacao');
      break;
    default:
  }
}

/**
 * Os quatro números do topo, redesenhados juntos.
 *
 * A faixa inteira é redesenhada a cada mensagem em vez de cada número ser
 * atualizado no seu lugar: são quatro caixas sem campo de digitação dentro, e
 * uma volta só é mais barata de ler do que quatro caminhos que precisam
 * concordar. Quem sabe montar cada um é o `admin/medidores.js`, que é puro e
 * tem teste.
 */
function desenharMedidores() {
  medidoresEl.innerHTML = markupMedidores(medidores({
    tally: ultimoPlacar,
    fonte: ultimaFonte,
    rodada: ultimaRodada,
  }));
}

function atualizarPlacar(t) {
  if (!t) return;
  ultimoPlacar = t;
  desenharMedidores();
}

function aplicarConfig(nova) {
  config = nova;
  // Só redesenha quando a aba aberta depende da configuração. Redesenhar
  // sempre apagaria o que o operador está digitando no momento em que um
  // voto de outra pessoa chegasse — e no meio de uma live isso é constante.
  if (abaAtual !== 'teste') desenhar();
}

/**
 * De onde os eventos estão vindo, e o que está acontecendo com a fonte.
 *
 * Isto fica no topo, junto do estado da conexão, porque é a mesma pergunta: o
 * operador olha uma vez e sabe se o sistema está de pé. Sem ele, a fonte da
 * live pode estar caída há dez minutos com o painel inteiro verde — e a única
 * pista seria a ausência de votos, que é indistinguível de uma live parada.
 *
 * O detalhe é o que o servidor mandou, escrito por quem sabe: "não existe
 * usuário @fulano no TikTok", "a live está offline", "conectando…". Inventar
 * um texto aqui seria trocar a única informação útil por uma palavra bonita.
 */
function atualizarFonte(f) {
  if (!f) return;
  ultimaFonte = f;
  desenharMedidores();
}

function atualizarRodada(r) {
  if (!r) return;
  // A mensagem de rodada traz o placar junto (`atualizacaoDeRodada` no hub),
  // e é por isso que ela também mexe nos números de voto.
  if (r.tally) ultimoPlacar = r.tally;
  ultimaRodada = r;
  desenharMedidores();
}

/** A contagem do cabeçalho do console: o que passou desde que o painel abriu. */
function atualizarContagem() {
  const alvo = el('log-contagem');
  if (!alvo) return;
  alvo.textContent = `🎁 ${contagem.presentes} presentes · 🗳️ ${contagem.votos} votos`;
}

/* --------------------------------------------------------- desenhar a tela */

function desenharAbas() {
  abasEl.innerHTML = ABAS.map((a) => '<button type="button" class="aba" role="tab"'
    + ` data-aba="${escapar(a.id)}" aria-selected="${a.id === abaAtual}">`
    + `${escapar(a.rotulo)}</button>`).join('');
}

/** Um grupo de campos: o título e a grade. */
function markupGrupo(grupo) {
  const ocultos = (grupo.oculto ?? []).map((o) => '<input type="hidden"'
    + ` data-campo="${escapar(o.caminho)}" value="${escapar(o.valor)}">`).join('');
  const grade = grupo.campos?.length
    ? `<div class="grade">${montarCampos(grupo.campos, config)}</div>`
    : '';
  return `<section class="grupo" data-grupo="${escapar(grupo.chave ?? '')}">`
    + (grupo.titulo ? `<h2 class="grupo__titulo">${escapar(grupo.titulo)}</h2>` : '')
    + ocultos + grade + '</section>';
}

/**
 * Os botões de operação de uma aba.
 *
 * Eles NÃO salvam: disparar um presente de teste ou abrir a rodada não é
 * editar a configuração. Um botão que gravasse junto mudaria a live inteira
 * por causa de um teste.
 */
function markupAcoes() {
  const presentes = (config?.presentes ?? []).filter((p) => p?.ativo !== false);
  const urnas = Object.entries(config?.urnas ?? {})
    .map(([id, u]) => `<option value="${escapar(id)}">${escapar(u?.nome ?? id)}</option>`).join('');

  const botoes = presentes.length
    ? presentes.map((p) => `<button type="button" class="botao botao--ouro" data-disparar="${escapar(p.giftId)}">`
      + `🎁 ${escapar(p.nome ?? p.giftId)}</button>`).join('')
    : '<p class="ajuda">Nenhum presente ativo para disparar. Cadastre um na aba Presentes.</p>';

  return '<section class="grupo"><h2 class="grupo__titulo">🎁 Disparar presente</h2>'
    + '<div class="acoes">'
    + '<label class="campo"><span class="campo__rotulo">Quem presenteia</span>'
    + '<input type="text" id="quem" value="Painel"></label>'
    + '<label class="campo"><span class="campo__rotulo">Votos por disparo</span>'
    + '<input type="number" id="combo" min="1" max="99" value="1"></label>'
    + '</div>'
    + `<div class="acoes" style="margin-top:12px">${botoes}</div>`
    + '</section>'
    + markupChat()
    + markupNarracao()
    + '<section class="grupo"><h2 class="grupo__titulo">⏱️ Rodada</h2><div class="acoes">'
    + '<button type="button" class="botao botao--verde" data-round="start">▶ Iniciar rodada</button>'
    + '<button type="button" class="botao" data-round="stop">⏹ Encerrar</button>'
    + '<button type="button" class="botao botao--perigo" data-round="reset">🧨 Zerar e reabrir</button>'
    + '<button type="button" class="botao botao--ouro" data-rajada>🔥 Rajada de 12</button>'
    + `<label class="campo"><span class="campo__rotulo">Urna da rajada</span>`
    + `<select id="urna-rajada">${urnas}</select></label>`
    + '</div></section>';
}

/**
 * O teste do voto pelo chat.
 *
 * É o caminho do presente que o painel não mapeia: ele chega, não acha urna, e
 * fica esperando o número que a pessoa escreve no chat. Sem estes dois botões,
 * a única maneira de exercitá-lo seria alguém mandar um presente de verdade na
 * live e escrever o número — e descobrir no ar que ele não funcionava.
 *
 * Os dois usam o MESMO "quem presenteia": é o `userId` que liga o comentário
 * ao presente, e um comentário de outra pessoa não resgata nada. É de
 * propósito que os dois campos fiquem na mesma caixa, um embaixo do outro.
 */
function markupChat() {
  const presente = giftIdSemUrna(config?.presentes);
  const numero = numeroDeTeste(config?.urnas);
  return '<section class="grupo"><h2 class="grupo__titulo">🗳️ Testar o voto pelo chat</h2>'
    + '<p class="ajuda">O presente que não está na aba Presentes não conta sozinho: '
    + 'ele espera o número no chat e, se ninguém escrever, a voz cobra. Um presente '
    + 'de teste e depois o número — nesta ordem, com o mesmo "quem presenteia".</p>'
    + '<div class="acoes">'
    + '<label class="campo"><span class="campo__rotulo">Presente desconhecido</span>'
    + `<input type="text" id="gift-orfao" value="${escapar(presente)}"></label>`
    + '<button type="button" class="botao botao--ouro" data-orfao>🎁 Mandar presente sem urna</button>'
    + '</div>'
    + '<div class="acoes" style="margin-top:12px">'
    + '<label class="campo"><span class="campo__rotulo">Número escrito no chat</span>'
    + `<input type="text" id="numero-chat" value="${escapar(numero)}"></label>`
    + '<button type="button" class="botao botao--verde" data-comentar>💬 Escrever o número</button>'
    + '</div></section>';
}

/**
 * Os botões que fazem o narrador falar sem esperar a live.
 *
 * Eles existem porque a voz é a parte mais frágil do sistema e a única que não
 * dá para conferir olhando o painel: um processo externo, um arquivo em disco,
 * um elemento de áudio do outro lado. Sem estes botões, o Leonardo descobriria
 * que ela não funciona quando alguém seguisse de verdade, no ar.
 *
 * O que eles mandam é um evento social de verdade, pela mesma porta que a
 * TikTok vai usar — não um atalho que chamasse a voz direto. O que se ouve
 * aqui é o que vai acontecer lá, com o mesmo tempo e o mesmo arquivo.
 */
function markupNarracao() {
  const botoes = ACOES_SOCIAIS.map((a) => '<button type="button" class="botao botao--verde"'
    + ` data-social="${escapar(a.tipo)}">${escapar(a.rotulo)}</button>`).join('');
  return '<section class="grupo"><h2 class="grupo__titulo">🔊 Testar a narração</h2>'
    + '<p class="ajuda">Fala e mostra na tela o que um evento desses faria agora, '
    + 'com o nome do campo "quem presenteia" acima. A voz sai no computador, não '
    + 'na página — se ela não tocar, o problema está no Windows ou no volume, e '
    + 'não na live.</p>'
    + `<div class="acoes">${botoes}</div>`
    + '</section>';
}

/** Uma linha do console. O `data-tipo` é o que o CSS pinta. */
function markupLinha(l) {
  return `<li${l.tipo ? ` data-tipo="${escapar(l.tipo)}"` : ''}>`
    + `<span class="log__hora">${escapar(l.hora)}</span>${escapar(l.texto)}</li>`;
}

/** O log ao vivo da aba Integração. */
function markupIntegracao() {
  const itens = log.map(markupLinha).join('');
  const total = `🎁 ${contagem.presentes} presentes · 🗳️ ${contagem.votos} votos`;
  return '<section class="grupo"><h2 class="grupo__titulo">📜 Eventos ao vivo'
    + `<span class="grupo__contagem" id="log-contagem">${escapar(total)}</span></h2>`
    + `<ul class="log" id="log">${itens || '<li data-tipo="nada">nada ainda</li>'}</ul></section>`;
}

function desenharLog() {
  const lista = el('log');
  if (lista) {
    lista.innerHTML = log.map(markupLinha).join('') || '<li data-tipo="nada">nada ainda</li>';
  }
  atualizarContagem();
}

function desenhar() {
  const aba = acharAba(abaAtual);
  ajudaEl.textContent = aba?.ajuda ?? '';
  desenharAbas();

  const grupos = gruposDaAba(abaAtual, config);
  const corpo = grupos.length
    ? grupos.map(markupGrupo).join('')
    : '<section class="grupo"><p class="ajuda">Esta aba não tem campos.</p></section>';

  secoesEl.innerHTML = corpo + (aba?.acoes ? markupAcoes() : '')
    + (abaAtual === 'integracao' ? markupIntegracao() : '');

  // A barra de salvar não faz sentido numa aba de botões: não há o que salvar.
  barraEl.hidden = Boolean(aba?.acoes);
  recado('');
}

/* -------------------------------------------------------------- ler e salvar */

/**
 * Lê o formulário para um mapa caminho → valor.
 *
 * O DOM só devolve texto, e é `patchDe` que devolve o tipo — de propósito.
 * Converter aqui espalharia a regra de tipo por dois lugares, e o dia em que
 * os dois discordassem o número subiria como string e o servidor o recusaria
 * em silêncio.
 */
function lerValores() {
  const valores = {};
  for (const campo of secoesEl.querySelectorAll('[data-campo]')) {
    const caminho = campo.dataset.campo;
    if (campo.type === 'checkbox') valores[caminho] = campo.checked;
    else if (campo.type === 'hidden') valores[caminho] = campo.value;
    else valores[caminho] = campo.value;
  }
  return valores;
}

function marcarPendencias(pendencias) {
  for (const campo of secoesEl.querySelectorAll('.campo[data-pendente]')) delete campo.dataset.pendente;
  for (const p of pendencias) {
    const input = secoesEl.querySelector(`[data-campo="${CSS.escape(p.caminho)}"]`);
    input?.closest('.campo')?.setAttribute('data-pendente', p.motivo);
  }
}

salvarEl.addEventListener('click', () => {
  const campos = camposDaAba(abaAtual, config);
  const valores = lerValores();
  const pendencias = pendenciasDe(campos, valores);

  if (pendencias.length) {
    marcarPendencias(pendencias);
    recado(pendencias.map((p) => `${p.rotulo} ${p.motivo}`).join(' · '), 'erro');
    return;
  }
  marcarPendencias([]);
  rede.enviar({ tipo: 'config.update', config: patchDe(campos, valores) });
  // "Enviado" e não "salvo": quem confirma é o servidor, com o
  // `config.changed`. Dizer "salvo" aqui seria a tela afirmando algo que ela
  // ainda não sabe.
  recado('enviado — esperando o servidor confirmar…');
});

el('recarregar').addEventListener('click', () => {
  rede.enviar({ tipo: 'state.request' });
  recado('pedindo o retrato ao servidor…');
});

/* ---------------------------------------------------------------- as abas */

abasEl.addEventListener('click', (ev) => {
  const botao = ev.target.closest('[data-aba]');
  if (!botao) return;
  abaAtual = botao.dataset.aba;
  desenhar();
});

/* ------------------------------------------------------------- as ações */

secoesEl.addEventListener('click', (ev) => {
  const disparar = ev.target.closest('[data-disparar]');
  if (disparar) {
    const combo = Math.max(1, Number(el('combo')?.value) || 1);
    rede.enviar({
      tipo: 'sim.gift',
      giftId: disparar.dataset.disparar,
      /*
       * Cada aperto é uma PESSOA NOVA, pelo mesmo motivo do botão social
       * abaixo: desde que o presente contado virou fala, o narrador anuncia
       * cada pessoa uma vez a cada trinta segundos. Com o `userId` fixo, o
       * segundo aperto sairia mudo — e um botão de teste mudo é indistinguível
       * de uma voz quebrada, que é justamente o que ele existe para descobrir.
       *
       * O nome mostrado continua sendo o do campo "quem": quem muda é só a
       * identidade que o cooldown usa.
       */
      userId: `teste-${++pessoasDeTeste}`,
      userName: el('quem')?.value || 'Painel',
      combo,
    });
    anotar(`disparei ${disparar.textContent.trim()} (${combo}x)`);
    return;
  }

  const round = ev.target.closest('[data-round]');
  if (round) {
    rede.enviar({ tipo: `round.${round.dataset.round}` });
    anotar(`pedi round.${round.dataset.round}`);
    return;
  }

  const social = ev.target.closest('[data-social]');
  if (social) {
    const acao = ACOES_SOCIAIS.find((a) => a.tipo === social.dataset.social);
    if (!acao) return;
    /*
     * Cada aperto é uma PESSOA NOVA, e o contador é o que faz isso.
     *
     * O narrador anuncia cada pessoa uma vez por minuto, e é assim que tem que
     * ser no ar — mas um botão de teste que ficasse mudo no segundo aperto
     * seria indistinguível de uma voz quebrada, que é justamente o que ele
     * existe para descobrir. O cooldown se confere com a live de verdade.
     *
     * A quantidade vai junto pelo mesmo motivo: sem ela o botão de curtida
     * mandaria um toque só, e um toque não é gesto — o narrador ficaria
     * quieto.
     */
    rede.enviar({
      tipo: 'sim.social',
      social: acao.tipo,
      quantidade: acao.quantidade,
      userId: `teste-${++pessoasDeTeste}`,
      userName: el('quem')?.value || 'Painel',
    });
    anotar(`testei a narração: ${acao.rotulo.toLowerCase()}`);
    return;
  }

  if (ev.target.closest('[data-orfao]')) {
    /*
     * O presente que o painel não conhece. Ele NÃO conta voto: ele abre a
     * espera pelo número, que é o que este botão existe para exercitar.
     *
     * O `userId` é o mesmo do botão de escrever o número, e é ele — e só ele —
     * que liga as duas coisas: o comentário resgata o presente do próprio
     * autor, e um comentário de outra pessoa não resgata nada.
     */
    const giftId = el('gift-orfao')?.value?.trim();
    if (!giftId) {
      recado('escreva o id de um presente que não esteja na aba Presentes', 'erro');
      return;
    }
    rede.enviar({
      tipo: 'sim.gift',
      giftId,
      userId: 'painel',
      userName: el('quem')?.value || 'Painel',
      combo: 1,
    });
    anotar(`mandei um presente sem urna (${giftId}) — agora escreva o número`);
    return;
  }

  if (ev.target.closest('[data-comentar]')) {
    const texto = el('numero-chat')?.value?.trim();
    if (!texto) {
      recado('escreva o número da urna que o chat vai mandar', 'erro');
      return;
    }
    rede.enviar({
      tipo: 'sim.comment',
      userId: 'painel',
      userName: el('quem')?.value || 'Painel',
      texto,
    });
    anotar(`escrevi "${texto}" no chat`);
    return;
  }

  if (ev.target.closest('[data-rajada]')) {
    const quantidade = 12;
    const quem = el('quem')?.value || 'Painel';
    const urnaId = el('urna-rajada')?.value;
    // A rajada é N eventos de um voto, e não um evento de N votos: é a fila
    // de toques, uma mão por toque, que faz a tela parecer uma votação. O
    // `combo` do presente agregado é o outro caminho, e existe na aba também.
    const presente = (config?.presentes ?? []).find((p) => p.urnaId === urnaId) ?? config?.presentes?.[0];
    if (!presente) {
      recado('não há presente cadastrado para a rajada', 'erro');
      return;
    }
    for (let i = 0; i < quantidade; i++) {
      rede.enviar({
        tipo: 'sim.gift',
        giftId: presente.giftId,
        userId: `rajada-${i}`,
        userName: `${quem} ${i + 1}`,
        combo: 1,
      });
    }
    anotar(`rajada de ${quantidade} para ${presente.nome ?? presente.giftId}`);
  }
});

/*
 * AQUI FICAVA O CONTROLE RÁPIDO DE VELOCIDADE.
 *
 * Era um `change` no campo `animacao.velocidade` que mandava `anim.speed` sem
 * passar pelo salvar — mudava a mão agora e não gravava nada. O campo era o
 * único da aba Animação, e a aba saiu em 2026-10-15; sem campo, o listener
 * ficou inalcançável e saiu junto.
 *
 * A velocidade da mão agora vem de `animacao.velocidade` no
 * `config/local.json`, lida na subida. O `anim.speed` continua existindo no
 * protocolo e no `hub.js` — é a mensagem que o próximo controle, se houver,
 * vai usar; o que não existe mais é quem a mande.
 */

desenhar();
// Os medidores nascem desenhados, com os zeros: o painel que abre com a faixa
// do topo vazia parece quebrado, e é justamente enquanto o servidor não
// respondeu que o operador mais olha para ela.
desenharMedidores();
rede.abrir();
