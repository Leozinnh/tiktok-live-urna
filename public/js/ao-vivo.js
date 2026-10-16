/**
 * A página do ar — a que o OBS captura e manda para a live.
 *
 * Monta o cenário, as duas urnas, as duas mãos e o placar, e obedece ao
 * servidor: um `vote.animate` põe uma mão para digitar, um `tally.update`
 * move o placar, e um `round.finished` encerra a disputa. Nada aqui decide
 * quantos votos alguém tem — quem conta é o servidor, que é o único que
 * sobrevive a um recarregamento desta página.
 *
 * Chamava-se `demo.js` enquanto era uma demonstração sem motor por trás. O
 * nome ficou pequeno para o que o arquivo é hoje, e um nome que promete menos
 * do que a coisa é faz o próximo a ler tratar como descartável o que está no
 * ar.
 *
 * Não há um botão nesta página. Disparar presente de teste, abrir e fechar
 * rodada e editar a configuração é tudo em /admin, numa aba separada — a
 * seção 5 não admite interface administrativa no enquadramento, e a maneira
 * de garantir isso não é esconder: é não ter.
 */

import { montarCenario } from './scene.js';
import { criarUrna } from './urna.js';
import { criarPlacar } from './placar.js';
import { criarPainel } from './painel.js';
import { criarSom } from './som.js';
import { criarResultado, resultadoDaRodada } from './resultado.js';
import { criarCronometro } from './cronometro.js';
import { criarPresentes, PRESENTES_PADRAO } from './presentes.js';
import { criarEquipeDeMaos } from './hand-team.js';
import { criarReservaDeUrnas } from './urnas-livres.js';
import { criarNarrador, falaDoServidor } from './narrador.js';
import { criarPopupPresente } from './popup-presente.js';
import { carregarConfig, aplicarConfig, aplicarConfigDoPlacar, duracaoDaRodada } from './config.js';
import { criarRede } from './net.js';

const cenario = montarCenario(document.getElementById('cena'));
const { camadaUrnas, camadaMao, camadaPlacar, camadaEfeitos } = cenario;

/*
 * A contagem — a única fonte da verdade sobre quantos votos cada urna tem.
 *
 * A urna consulta este número para escrever a própria tela e o placar o
 * consulta para desenhar as barras. Guardar a contagem dentro da urna, ou
 * dentro do placar, daria dois números possíveis para o mesmo fato; o dia
 * em que divergissem, a tela e o placar mostrariam totais diferentes e
 * ninguém saberia qual está certo.
 */
const contagem = Object.create(null);

/*
 * As duas urnas: onde ficam no palco, e quem são.
 *
 * Posições em coordenadas do palco (1080x1920). As urnas convergem levemente
 * para o centro, o que reforça a perspectiva da cena.
 *
 * Isto aqui é o PADRÃO, não o que vai ao ar. Quem manda é o arquivo
 * `config/local.json`, que entra por cima campo a campo — trocar o
 * candidato, a foto ou a cor de uma urna NÃO se faz neste arquivo, e sim
 * lá, sem mexer em código. Ver public/js/config.js para o formato.
 *
 * O padrão existe para a cena abrir de pé antes de qualquer configuração:
 * uma urna sem candidato, sem cargo e com o número em branco apareceria no
 * ar do jeito que ela está no código, e não do jeito que a live precisa.
 */
const URNAS_PADRAO = [
  { id: 'u1', x: 24,  y: 38, rot: -6, nome: 'URNA 1', numero: '22',
    corPrimaria: '#1a5fd0', corSecundaria: '#0d3a8f',
    cargo: 'DEPUTADO FEDERAL',
    candidato: { nome: 'Ana Prado', partido: 'PARTIDO A' } },
  { id: 'u2', x: 556, y: 38, rot:  6, nome: 'URNA 2', numero: '13',
    corPrimaria: '#e02020', corSecundaria: '#8f0d0d',
    cargo: 'DEPUTADO FEDERAL',
    candidato: { nome: 'Bruno Tavares', partido: 'PARTIDO B' } },
];

/*
 * A configuração do Leonardo por cima do padrão.
 *
 * `await` no topo do módulo, e não uma promessa tratada depois, porque as
 * urnas são montadas logo abaixo e não podem nascer com o candidato errado
 * para serem corrigidas depois: isso seria um piscar do nome de exemplo na
 * tela, no ar. `carregarConfig` nunca rejeita — arquivo ausente é o caso
 * normal, e a cena segue com os padrões.
 *
 * O erro NÃO interrompe nada. Um JSON quebrado deixa a cena de pé com os
 * padrões e vira um aviso na barra: melhor uma live com o candidato de
 * exemplo e um aviso visível do que uma tela preta sem explicação.
 */
const { dados: configDoUsuario, erro: erroDaConfig } = await carregarConfig();
const CONFIG_URNAS = aplicarConfig(URNAS_PADRAO, configDoUsuario);

const urnas = {};
for (const cfg of CONFIG_URNAS) {
  contagem[cfg.id] = 0;
  const u = criarUrna({ ...cfg, contagem: () => contagem[cfg.id] });
  u.definirTela({ tipo: 'ocioso' });
  camadaUrnas.append(u.el);
  urnas[cfg.id] = u;
}

/*
 * O som da disputa.
 *
 * Criado aqui e não lá dentro do placar: o placar não deve saber que existe
 * áudio, e o som não deve saber contar voto. Quem liga os dois é esta linha
 * de `aoVirarLideranca`.
 */
const som = criarSom();
let MENSAGENS = aplicarConfigDoPlacar(configDoUsuario);

/*
 * A vitrine: os dois presentes embaixo da mesa, um por urna.
 *
 * A cor e o número de cada etiqueta saem da configuração da urna — a vitrine
 * não sabe que o 22 é azul, ela sabe perguntar. Trocar a cor de uma urna
 * repinta a urna, o cartão do placar e a etiqueta do presente de uma vez, sem
 * nenhum lugar a mais para lembrar.
 *
 * Remontada inteira quando a configuração muda, e não remendada no lugar: ela
 * é pouca coisa — duas etiquetas —, e um segundo caminho para desenhar a
 * mesma coisa é como os dois divergem.
 */
let vitrine = null;

function montarVitrine() {
  const lista = PRESENTES_PADRAO.map((p) => {
    const alvo = CONFIG_URNAS.find((c) => c.id === p.urnaId) ?? CONFIG_URNAS[0];
    return { ...p, numero: alvo.numero, cor: alvo.corPrimaria };
  });
  vitrine?.el.remove();
  vitrine = criarPresentes(camadaEfeitos, lista);
}

montarVitrine();

const placar = criarPlacar(camadaPlacar, CONFIG_URNAS.map((c) => ({
  id: c.id, nome: c.nome, numero: c.numero, votos: 0, cor: c.corPrimaria,
})), {
  modelos: MENSAGENS,
  aoVirarLideranca: ({ tipo }) => {
    if (tipo === 'empate') som.tocarEmpate();
    else som.tocarVirada();
  },
});

/*
 * A rodada.
 *
 * O cronômetro conta para baixo a partir do mesmo `rodada.duracaoSegundos`
 * da configuração, e o número que ele mostra é o do SERVIDOR: cada
 * `round.update` traz quanto falta, e o relógio se acerta por ele. É de
 * propósito que o relógio não seja só enfeite: um número grande contando
 * para baixo sem nada por trás seria um dado inventado na tela, e neste
 * projeto a única coisa pior do que não ter cronômetro é ter um que mente.
 *
 * Quem FECHA a rodada é o servidor, e não este relógio. A diferença aparece
 * no dia em que a página dorme — uma fonte de navegador do OBS que o Windows
 * suspendeu, um quadro perdido —, e o relógio local chega a zero alguns
 * segundos fora do relógio do servidor. Se a tela decidisse por conta
 * própria, ela encerraria a votação antes da hora ou ficaria esperando um
 * resultado que ninguém mandou; quem conta os votos é quem sabe quando
 * parar de contar.
 */
const DURACAO_RODADA = duracaoDaRodada(configDoUsuario);

/*
 * O fim da rodada acontece em DOIS tempos, e a diferença entre eles importa.
 *
 * O `round.finished` do servidor FECHA a rodada: nenhum voto novo é contado a
 * partir daí. O resultado, não — ele espera a fila acabar de passar. A spec é
 * explícita em que nenhum voto se perde por animação em andamento, e quem
 * presenteou no último segundo tem o direito de ver a mão dele depositar a
 * cédula antes de a tela dizer quem ganhou. Enquanto a fila anda, o placar
 * ainda está subindo.
 */
let esperandoResultado = false;

const cronometro = criarCronometro(camadaPlacar, { duracao: DURACAO_RODADA });
cronometro.comecar();

function atualizarPlacar() {
  placar.atualizar(CONFIG_URNAS.map((c) => ({
    id: c.id, nome: c.nome, numero: c.numero, votos: contagem[c.id], cor: c.corPrimaria,
  })));
}

/*
 * DUAS mãos, e não uma.
 *
 * Com uma só, dois presentes no mesmo segundo viram espera: o segundo
 * espectador assiste ao voto do primeiro antes de o dele começar. Numa live
 * com movimento isso é uma fila que cresce mais rápido do que anda — e o
 * problema não é a espera em si, é que quem mandou o presente olha para a
 * tela naquele instante e não vê nada acontecer com o nome dele.
 *
 * Cada voto sai na mão que estiver livre, e os dois podem estar no ar ao
 * mesmo tempo, uma em cada urna, sem um esperar pelo outro.
 *
 * A reserva de urnas é quem decide ONDE cada voto vai. Sem ela, os dois
 * votos do 13 no mesmo segundo escolhiam a mesma urna — a do candidato —, e
 * a segunda mão ficava sem ter onde digitar enquanto a urna vizinha assistia
 * parada. Ver urnas-livres.js.
 */
const equipe = criarEquipeDeMaos({
  camada: camadaMao,
  quantidade: 2,
  opcoes: {
    reservaDeUrnas: criarReservaDeUrnas(CONFIG_URNAS.map((c) => urnas[c.id])),
    aoContarVoto: ({ urnaId, numero, votos, usuario }) => {
      contagem[urnaId] = (contagem[urnaId] ?? 0) + votos;
      atualizarPlacar();
      registrarVoto({ usuario, numero, urnaId });
      /*
       * E o clique da tecla verde — este aviso sai no toque do CONFIRMA, que
       * é exatamente o instante em que a urna de verdade apita. Pedido do
       * Leonardo, e baixo: ver o volume em som.js.
       */
      som.tocarConfirmacao();
    },
  },
});
equipe.iniciar();

/*
 * `ator` continua sendo a PRIMEIRA mão, e não uma abstração da equipe.
 *
 * É por onde o painel, o relógio e as sondas alcançam a fila e o ticker — que
 * são compartilhados — sem precisarem saber que existem duas mãos. Quem
 * precisa das duas olha para `equipe.atores`.
 */
const ator = equipe.atores[0];
const mao = ator.render;

// ---- O painel do rodapé: a fila e o ranking ---------------------------

const painel = criarPainel(camadaPlacar);

/*
 * O ranking de quem mais presenteou, direto do servidor.
 *
 * Era um `Map` local, alimentado a cada presente, e o `Map` tinha dois
 * defeitos que só aparecem numa live de verdade: ele morria com a página —
 * quem tivesse mandado presente antes de o OBS recarregar a fonte sumia da
 * lista —, e ele contava uma coisa enquanto o banco contava outra, sem
 * ninguém para dizer qual estava certa.
 *
 * O servidor conta PRESENTES, e não votos: hoje dá no mesmo, um presente vale
 * um voto, mas o dia em que uma rosa valer cinco o ranking não pode virar
 * "quem mandou o presente mais caro" — o que a lista promete é quem mais
 * mandou, e é isso que ela conta.
 *
 * Atualiza na CHEGADA do voto, e não quando a mão termina: são os mesmos
 * segundos de diferença que a fila existe para cobrir. Quem acabou de mandar
 * quer ver o nome subir na hora.
 */
let rankingDoServidor = [];

/*
 * Os últimos votos que passaram, do mais novo para o mais velho.
 *
 * A lista vive aqui, e não no painel, pela mesma razão que a fila vive no
 * ator: o painel é a tela, e a tela não guarda estado — ela desenha o que
 * lhe derem. Quem guarda é quem tem o fato.
 *
 * A janela é curta de propósito. Ela é do tamanho do que cabe na tela e mais
 * nada: quatro linhas, e o voto seguinte empurra o mais velho para fora. Um
 * histórico de mil votos na memória de uma página que fica doze horas no ar
 * é memória crescendo por nada, e nada além das quatro primeiras linhas
 * chega a ser desenhado.
 */
const ULTIMOS_GUARDADOS = 4;
let ultimosVotos = [];

/**
 * Um voto contado entra na janela dos últimos votos.
 *
 * A cor vem da urna do CANDIDATO — a mesma cor que o placar dele usa —, e é
 * ela que faz a linha do painel apontar para o aparelho na tela sem ninguém
 * precisar ler o número. Voto de uma urna que não está na cena (número
 * digitado à mão numa sonda) entra sem cor, e a linha cai no cinza padrão em
 * vez de não aparecer.
 */
function registrarVoto({ usuario, numero, urnaId }) {
  const cor = CONFIG_URNAS.find((c) => c.id === urnaId)?.corPrimaria;
  // Sem nome não há o que escrever na linha: um voto anônimo entraria como
  // uma linha vazia, e uma linha vazia no painel é um defeito visível.
  if (!usuario) return;
  ultimosVotos.unshift({ usuario, numero, cor });
  if (ultimosVotos.length > ULTIMOS_GUARDADOS) ultimosVotos.length = ULTIMOS_GUARDADOS;
}

function definirRanking(apoiadores) {
  if (!Array.isArray(apoiadores)) return;
  // `usuario` no banco, `nome` no painel: a tradução é aqui, e não lá, porque
  // é o painel que desenha e o banco que guarda — nenhum dos dois precisa
  // saber o vocabulário do outro.
  rankingDoServidor = apoiadores.map((a) => ({ nome: a.usuario, presentes: a.presentes }));
}

/*
 * A assinatura é o que evita redesenhar a cada quadro.
 *
 * O painel precisa acompanhar a fila, e a fila anda sozinha — quem tira o
 * próximo é o laço da mão, não um evento. Sem esta comparação, o `innerHTML`
 * do painel seria reescrito sessenta vezes por segundo para desenhar
 * exatamente o mesmo texto.
 */
let assinaturaDoPainel = null;

function atualizarPainel() {
  const fila = ator.fila.esperando();
  const ranking = rankingDoServidor;
  const assinatura = fila.map((i) => i.id).join(',')
    + '|' + ranking.map((p) => `${p.nome}:${p.presentes}`).join(',')
    + '|' + ultimosVotos.map((v) => `${v.usuario}:${v.numero}`).join(',');

  if (assinatura === assinaturaDoPainel) return;
  assinaturaDoPainel = assinatura;
  painel.atualizar({ fila, ranking, ultimos: ultimosVotos });
}

/*
 * No ticker da mão, e não num `setInterval` próprio: um segundo laço de
 * quadro para desenhar texto brigaria com o único RAF do projeto e deixaria
 * a fila um quadro atrás da mão. Ver o comentário do `iniciar` em
 * hand-actor.js.
 */
ator.ticker.registrarPasso(atualizarPainel);
atualizarPainel();

// ---- O desfecho da rodada ---------------------------------------------

const resultado = criarResultado(cenario.camadaResultado);

/*
 * A faixa de quem chegou.
 *
 * Na camada de efeitos, que é onde mora tudo o que passa por cima da cena sem
 * ser urna nem mão. O som vem pronto do servidor — o OBS não tem motor de fala
 * —, e a faixa aparece mesmo quando ele não vem: perder a fala é um detalhe,
 * perder as boas-vindas é a tela parecer morta para quem acabou de seguir.
 */
/*
 * A fala que a tela não conseguiu dizer volta para o servidor.
 *
 * O `rede` só existe daqui a duzentas linhas, e isso não é problema: o
 * ouvinte é chamado quando uma fala falha, muito depois de o módulo ter
 * terminado de carregar. Quem decide o que fazer com o aviso é o hub, e é de
 * propósito — a tela do OBS não tem para onde escrever log, e o Leonardo lê a
 * noite pelo console do servidor.
 */
const narrador = criarNarrador(cenario.camadaEfeitos, {
  aoPerder: (fala, motivo) => rede.enviar({ tipo: 'narracao.perdida', texto: fala?.texto, motivo }),
});
narrador.definirVolume(configDoUsuario?.narracao?.volume ?? 1);

/*
 * O pop-up do presente — a tela tomada por alguns segundos.
 *
 * Ele é irmão da faixa, e não uma parte dela: a faixa é uma linha no rodapé,
 * do tamanho de um aviso, e some no meio de tudo o que já está na cena. Para
 * quem PAGOU o presente, isso não é resposta — o pedido do Leonardo foi
 * literal: "não quero só um badge falando, quero um pop-up na tela com a
 * imagem do presente; se não tiver a imagem, falar o nome e tal".
 *
 * Fica na camada de pop-up, e não na de efeitos, porque ele TOMA a tela. Na
 * camada de efeitos (z 50) ele ficava abaixo do placar (z 60): a sonda flagrou
 * o nome do presente desenhado atrás do placar, e o véu sem apagar o
 * cronômetro. A camada própria é a mesma solução que a tela de fim de rodada
 * já tinha usado, pela mesma razão.
 */
const popup = criarPopupPresente(cenario.camadaPopup);

/*
 * O segundo tempo do fim da rodada: quando é que a fila acabou de passar.
 *
 * No ticker da mão, junto com o painel, e não num `setInterval` próprio: é o
 * mesmo laço que esvazia a fila que decide que ela esvaziou, então não existe
 * o quadro em que a fila está vazia e o vigia ainda não sabe.
 */
function verificarFimDaRodada() {
  if (!esperandoResultado) return;
  // O placar se acerta com o servidor ANTES de virar manchete. Sem esta
  // linha, o resultado sai do número que a tela estava mostrando — que é o
  // certo —, mas por sorte: quem garante é esta chamada, e não a ordem em
  // que os passos foram registrados no ticker.
  sincronizarContagem();
  if (ator.fila.emVoo) return;

  esperandoResultado = false;
  resultado.mostrar(resultadoDaRodada(placar.estado, { modelos: MENSAGENS }));
  som.tocarVitoria();
}

ator.ticker.registrarPasso(verificarFimDaRodada);

/**
 * Começa uma rodada nova: zera o placar, esconde o resultado e reabre.
 *
 * O ranking de quem mais presenteou NÃO é zerado junto, de propósito. Ele é
 * da live inteira, e não da rodada: a pessoa que mandou presente na primeira
 * rodada não deixa de ter mandado porque a segunda começou, e é justamente
 * por atravessar a live toda que ele faz alguém voltar no dia seguinte.
 *
 * A ordem importa: o placar é zerado ANTES de a tela sair do ar, para que os
 * cartões voltando ao lugar aconteçam atrás dela. Zerar com a tela já fora
 * faria a audiência ver os dois cartões deslizando de volta para a esquerda
 * sem motivo aparente.
 */
function novaRodada() {
  for (const cfg of CONFIG_URNAS) {
    contagem[cfg.id] = 0;
    verdade[cfg.id] = 0;
  }
  esperandoResultado = false;
  resultado.esconder();
  atualizarPlacar();
}


// ---- O canal com o servidor -------------------------------------------

/*
 * A página parou de decidir.
 *
 * Até aqui, quem mandava um voto era o botão da barra de demonstração, e o
 * placar subia porque a própria mão avisava que tinha contado. Agora quem
 * conta é o servidor, e esta página desenha o que ele manda: o `vote.animate`
 * põe a mão para trabalhar, o `tally.update` traz o número de verdade, e o
 * `round.finished` diz quando a votação acabou.
 *
 * A regra que organiza o resto é esta: **a `contagem` daqui é o que já
 * apareceu na tela, e a `verdade` é o que o servidor conta.** As duas não são
 * a mesma coisa durante o voto, e não podem ser — a mão leva uns sete
 * segundos digitando, e o número não pode subir antes de a cédula cair. A
 * `verdade` alcança a `contagem` quando a fila esvazia, e é isso que conserta
 * qualquer desencontro: um voto que o servidor contou e esta página nunca
 * animou, ou um `tally.update` que se perdeu no caminho.
 */
const verdade = Object.create(null);
for (const cfg of CONFIG_URNAS) verdade[cfg.id] = 0;

/**
 * A `contagem` alcança a `verdade`, mas só com a fila vazia.
 *
 * Enquanto há mão digitando, quem manda é a animação: igualar aqui faria o
 * número pular na frente das mãos que ainda vão depositar a cédula, e o
 * salto seria somado de novo quando elas chegassem.
 */
function sincronizarContagem() {
  // `emVoo`, e não `ocupada`: com duas mãos, uma trabalhando e a outra livre
  // daria "fila cheia = não" e o número subiria na frente da mão que ainda
  // está digitando. Foi medido.
  if (ator.fila.emVoo) {
    assinaturaDaSincronia = null;
    return;
  }
  const assinatura = CONFIG_URNAS.map((c) => verdade[c.id] ?? 0).join(',');
  if (assinatura === assinaturaDaSincronia) return;
  assinaturaDaSincronia = assinatura;

  let mudou = false;
  for (const cfg of CONFIG_URNAS) {
    const alvo = verdade[cfg.id] ?? 0;
    if (contagem[cfg.id] !== alvo) {
      contagem[cfg.id] = alvo;
      mudou = true;
    }
  }
  if (mudou) atualizarPlacar();
}

let assinaturaDaSincronia = null;

/*
 * No ticker da mão, e ANTES do fim da rodada: quando a fila esvazia, o
 * resultado precisa ser desenhado com o número já corrigido. É a ordem de
 * registro destas duas linhas que garante isso.
 */
ator.ticker.registrarPasso(sincronizarContagem);

/** Quantos votos o servidor diz que cada urna tem. */
function guardarVerdade(placarDoServidor) {
  if (!Array.isArray(placarDoServidor?.urnas)) return;
  for (const u of placarDoServidor.urnas) verdade[u.id] = Number(u.votos) || 0;
  definirRanking(placarDoServidor.apoiadores);
}

/*
 * A urna adota a configuração nova.
 *
 * `CONFIG_URNAS` é mutado no lugar em vez de trocado: `aplicarConfig` nunca
 * acrescenta nem remove urna, então a lista tem sempre os mesmos ids na mesma
 * ordem — e o placar, a reserva de urnas e a vitrine já guardaram referências
 * a estes objetos.
 */
function aplicarConfigNova(nova) {
  if (!nova || typeof nova !== 'object') return;
  const novas = aplicarConfig(URNAS_PADRAO, nova);
  novas.forEach((cfg, i) => {
    const alvo = { ...cfg, contagem: () => contagem[cfg.id] };
    CONFIG_URNAS[i] = alvo;
    if (!(cfg.id in verdade)) verdade[cfg.id] = 0;
    urnas[cfg.id]?.adotarConfig?.(alvo);
  });

  MENSAGENS = aplicarConfigDoPlacar(nova, MENSAGENS);
  // O volume acompanha o painel: ele mexe no controle e ouve a diferença na
  // fala seguinte, sem recarregar a fonte do OBS.
  if (nova.narracao) narrador.definirVolume(nova.narracao.volume);
  cronometro.comecar(duracaoDaRodada(nova));
  atualizarPlacar();
  montarVitrine();
}

/** O que o servidor mandou, e o que a página faz com isso. */
function tratarMensagem({ tipo, payload }) {
  switch (tipo) {
    case 'state.full': return aplicarRetrato(payload);
    case 'tally.update': return guardarVerdade(payload);
    case 'vote.animate': return enfileirarDoServidor(payload);
    case 'round.update': return aplicarRodada(payload);
    case 'round.finished': return encerrarRodada(payload);
    case 'config.changed': return aplicarConfigNova(payload?.config);
    /*
     * O presente abre o pop-up, e a fala entra na fila.
     *
     * A mesma mensagem alimenta os dois, e ela é repartida aqui — o único
     * ponto do caminho em que as duas telas se encontram.
     *
     * O pop-up NÃO entra na fila, e a assimetria é de propósito: a fila existe
     * porque duas VOZES sobrepostas viram uma terceira coisa que não é nenhuma
     * das duas. O pop-up não tem esse problema — ele não fala, ele mostra —, e
     * um presente esperando a vez atrás de três seguidores chegaria à tela
     * quando a live já fosse outra.
     *
     * E ele recebe a fala já PENEIRADA, e não o `payload` cru. O `desenho` que
     * chega da rede vira endereço de imagem por concatenação
     * (`/img/` + desenho + `.webp`), e quem aplica a expressão que barra barra,
     * ponto e maiúscula é o `falaDoServidor`. O pop-up copia o campo adiante
     * confiando nessa peneira — e é isto que sustenta essa confiança. Passar o
     * payload cru deixaria o pop-up montando endereço a partir de texto que
     * ninguém conferiu.
     */
    case 'narrate': {
      const fala = falaDoServidor(payload);
      if (fala) popup.mostrar(fala);
      // O narrador recebe o `payload`, e não a fala: o `esperou` dele sai de
      // `em` e `ts`, campos que a peneira acima não devolve.
      return narrador.narrar(payload);
    }
    default:
      // Tipo desconhecido é ignorado, e não erro: uma versão mais nova do
      // servidor pode mandar mensagem que esta página ainda não conhece, e a
      // transmissão não pode parar por causa disso.
  }
}

/**
 * O retrato que chega ao abrir a página e a cada reconexão.
 *
 * É por aqui que uma página que voltou no meio da rodada se acerta: o
 * servidor manda a configuração, a contagem e a rodada, e a `contagem` local
 * vira a verdade na hora — não há animação em voo numa página que acabou de
 * carregar.
 */
function aplicarRetrato(p) {
  if (!p || typeof p !== 'object') return;
  if (p.config) aplicarConfigNova(p.config);
  if (p.tally) guardarVerdade(p.tally);
  guardarRodada(p.rodada ?? p.tally?.rodada);
  sincronizarContagem();
}

/*
 * O id da rodada em cena.
 *
 * É o que separa "a rodada continua" de "começou outra" — o resto do
 * `round.update` é igual nos dois casos. Sem esta comparação, a tela zeraria
 * o placar a cada segundo de relógio andando.
 */
let rodadaEmCena = null;

function guardarRodada(rodada) {
  const id = rodada?.id ?? null;
  if (id === rodadaEmCena) return;
  const primeira = rodadaEmCena === null;
  rodadaEmCena = id;
  // A primeira rodada que esta página vê não é uma rodada nova: uma tela que
  // abre no meio da disputa não pode zerar o placar que já está no ar.
  if (primeira || id === null) return;
  novaRodada();
}

/** Anuncia o tempo e o estado da rodada. */
function aplicarRodada(r) {
  if (!r || typeof r !== 'object') return;
  if (r.tally) guardarVerdade(r.tally);
  guardarRodada(r.rodada);

  if (r.estado === 'encerrada') {
    cronometro.parar();
    return;
  }
  /*
   * O relógio se acerta pelo do servidor a cada anúncio, e não conta sozinho
   * do começo ao fim: o temporizador do navegador atrasa, e uma página que
   * dormiu acordaria com o número errado. `restante` zero com a rodada aberta
   * quer dizer que esta rodada não tem prazo — aí o relógio PARA onde está,
   * em vez de começar uma contagem de zero que diria "acabou".
   */
  if (Number.isFinite(r.restante) && r.restante > 0) {
    cronometro.comecar(Math.ceil(r.restante / 1000));
  } else {
    cronometro.parar();
  }
}

/**
 * A rodada acabou — e o resultado, não.
 *
 * O resultado espera a fila passar (ver `verificarFimDaRodada`). O que chega
 * aqui é só o aviso de que não entra mais voto.
 */
function encerrarRodada(p) {
  if (p?.tally) guardarVerdade(p.tally);
  esperandoResultado = true;
}

/**
 * Põe na fila o voto que o servidor mandou animar.
 *
 * Não há conferência de rodada aberta aqui, e não é esquecimento: quem decide
 * se o voto vale é o servidor, e ele já decidiu antes de mandar. Recusar um
 * `vote.animate` que chegou um milissegundo depois do `round.finished` seria
 * perder a animação de um voto que JÁ está contado — e a spec é explícita em
 * que a fila visual é drenada até o fim antes de o resultado aparecer.
 *
 * O que a página NÃO deduz da configuração é o número: ele viaja com o voto,
 * para que uma edição no painel entre o voto e a animação não faça a mão
 * digitar o número errado.
 */
function enfileirarDoServidor(p) {
  if (!p || typeof p !== 'object') return false;
  const destino = urnas[p.urnaId];
  if (!destino) return false;
  ator.fila.enfileirar({
    id: p.id,
    destino,
    numero: p.numero,
    votos: Number(p.votos) || 1,
    usuario: p.usuario ?? '',
    presente: p.presente ?? '',
    /*
     * De onde veio o voto, e com que cara ele chega.
     *
     * Os dois viajam JUNTOS e daqui até a etiqueta da mão: `origem` diz se
     * alguém mandou um presente ou escreveu no chat, e `desenho` é a figura
     * do presente que chegou. Sem eles a etiqueta mostraria a figura de um
     * presente para quem não mandou nada — ou procuraria o desenho de um
     * presente chamado "Voto no chat", que não existe.
     */
    origem: p.origem ?? 'presente',
    desenho: p.desenho ?? '',
    prioridade: Number(p.prioridade) || 0,
  });
  return true;
}

/*
 * O canal.
 *
 * Uma queda não vira aviso na tela: um "sem conexão" desenhado aqui iria para
 * a transmissão, e a seção 5 é explícita em que nenhum elemento de operação
 * entra no enquadramento. Quem mostra o estado da conexão é o painel, que
 * fica na outra aba. Aqui fica o console, que é onde um problema técnico
 * ajuda quem está operando sem aparecer para a audiência.
 */
const rede = criarRede({
  papel: 'broadcast',
  aoMensagem: tratarMensagem,
  aoStatus: ({ conectado, tentativas }) => {
    if (conectado) console.info('[ao vivo] conectado ao servidor');
    else console.warn(`[ao vivo] sem servidor; tentativa ${tentativas}`);
  },
});

rede.abrir();

/*
 * `?clean=1` não precisa esconder nada.
 *
 * A spec pede que a captura do OBS não tenha elemento administrativo nenhum,
 * e a resposta deste projeto não é esconder: é não ter. Toda a operação —
 * disparar presente de teste, abrir e fechar rodada, editar a configuração —
 * mora em /admin, numa aba separada. Esta página não desenha um botão que
 * seja, e o parâmetro continua aceito para que a URL documentada nos guias
 * funcione igual.
 */

/*
 * O que sai daqui é o que a sonda do navegador precisa alcançar.
 *
 * Não é API do site: `urnas`, `ator` e `placar` já saíam antes pelo mesmo
 * motivo — a sonda precisa dirigir o placar que está NO AR, e não uma cópia
 * montada só para o teste. `rede` e `verdade` entram agora porque a única
 * maneira de conferir que a tela obedece ao servidor é olhar os dois.
 */
export { urnas, mao, ator, equipe, rede, placar, cronometro, resultado, verdade, narrador };
