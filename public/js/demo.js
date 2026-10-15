/**
 * Ponto de entrada da página de demonstração.
 *
 * Monta o cenário, as duas urnas e a mão, e liga os controles que
 * enfileiram votos — o mesmo caminho que um presente real vai percorrer
 * na Etapa 7. O que muda é só a origem do evento.
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
import { carregarConfig, aplicarConfig, aplicarConfigDoPlacar } from './config.js';

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
 * A vitrine: os dois presentes embaixo da mesa, um por urna.
 *
 * A cor e o número de cada etiqueta saem da configuração da urna — a
 * vitrine não sabe que o 22 é azul, ela sabe perguntar. Trocar a cor de uma
 * urna no CONFIG_URNAS acima repinta a urna, o cartão do placar e a
 * etiqueta do presente de uma vez, sem nenhum lugar a mais para lembrar.
 */
const presentes = PRESENTES_PADRAO.map((p) => {
  const cfg = CONFIG_URNAS.find((c) => c.id === p.urnaId);
  return { ...p, numero: cfg.numero, cor: cfg.corPrimaria };
});
criarPresentes(camadaEfeitos, presentes);

/*
 * O som da disputa.
 *
 * Criado aqui e não lá dentro do placar: o placar não deve saber que existe
 * áudio, e o som não deve saber contar voto. Quem liga os dois é esta linha
 * de `aoVirarLideranca`.
 */
const som = criarSom();
const MENSAGENS = aplicarConfigDoPlacar(configDoUsuario);

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
 * O cronômetro conta o tempo real da rodada — o mesmo
 * `rodada.duracaoSegundos` da configuração — e, quando ele chega a zero, a
 * rodada FECHA: os presentes que chegarem depois são recusados. É de
 * propósito que o relógio não seja só enfeite: um número grande contando
 * para baixo sem nada por trás seria um dado inventado na tela, e neste
 * projeto a única coisa pior do que não ter cronômetro é ter um que mente.
 */
const DURACAO_RODADA = 300;
let rodadaAberta = true;

/*
 * O fim da rodada acontece em DOIS tempos, e a diferença entre eles importa.
 *
 * O relógio zerando FECHA a rodada: nenhum voto novo entra a partir daí. O
 * resultado, não — ele espera a fila acabar de passar. A spec é explícita em
 * que nenhum voto se perde por animação em andamento, e quem presenteou no
 * último segundo tem o direito de ver a mão dele depositar a cédula antes de
 * a tela dizer quem ganhou. Enquanto a fila anda, o placar ainda está subindo.
 */
let esperandoResultado = false;

const cronometro = criarCronometro(camadaPlacar, {
  duracao: DURACAO_RODADA,
  aoTerminar: () => {
    rodadaAberta = false;
    esperandoResultado = true;
  },
});
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
 */
const equipe = criarEquipeDeMaos({
  camada: camadaMao,
  quantidade: 2,
  opcoes: {
    aoContarVoto: ({ urnaId, votos }) => {
      contagem[urnaId] = (contagem[urnaId] ?? 0) + votos;
      atualizarPlacar();
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
 * Quem já presenteou, e quanto.
 *
 * Separado da `contagem` de propósito: lá são VOTOS por urna, aqui são
 * PRESENTES por pessoa. Hoje dá no mesmo, um presente vale um voto, mas o dia
 * em que uma rosa valer cinco o ranking não pode virar "quem mandou o presente
 * mais caro" — o que a lista promete é quem mais mandou, e é isso que ela
 * conta.
 *
 * Conta na CHEGADA do presente, e não quando o voto é apurado: são os mesmos
 * sete segundos de diferença que a fila existe para cobrir. Quem acabou de
 * mandar quer ver o nome subir na hora, e o voto dele é certo — já está na
 * fila, e a fila não recusa.
 */
const presenteados = new Map();

function registrarPresente(usuario) {
  const atual = presenteados.get(usuario);
  if (atual) atual.presentes += 1;
  else presenteados.set(usuario, { nome: usuario, presentes: 1 });
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
  const ranking = [...presenteados.values()];
  const assinatura = fila.map((i) => i.id).join(',')
    + '|' + ranking.map((p) => `${p.nome}:${p.presentes}`).join(',');

  if (assinatura === assinaturaDoPainel) return;
  assinaturaDoPainel = assinatura;
  painel.atualizar({ fila, ranking });
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
 * O segundo tempo do fim da rodada: quando é que a fila acabou de passar.
 *
 * No ticker da mão, junto com o painel, e não num `setInterval` próprio: é o
 * mesmo laço que esvazia a fila que decide que ela esvaziou, então não existe
 * o quadro em que a fila está vazia e o vigia ainda não sabe.
 */
function verificarFimDaRodada() {
  if (!esperandoResultado) return;
  if (ator.fila.pendentes > 0 || ator.fila.ocupada) return;

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
  for (const cfg of CONFIG_URNAS) contagem[cfg.id] = 0;
  atualizarPlacar();
  resultado.esconder();
  rodadaAberta = true;
  esperandoResultado = false;
  cronometro.comecar(DURACAO_RODADA);
}

// ---- Controles de demonstração ----------------------------------------
// Substituídos pelo modo de teste real na Etapa 6. Servem para validar
// visualmente as Etapas 1-3 antes de construir o motor de votação.
//
// TODOS os presentes contra TODAS as urnas, e não um presente casado com uma
// urna. O par "esta rosa vale um voto no 22" é uma sugestão da vitrine para
// quem está chegando no meio da live — não é uma regra do sistema. Quem
// manda o presente escolhe onde ele vale, e um mesmo presente pode estar
// valendo nas duas urnas ao mesmo tempo.
const PRESENTES_DEMO = presentes.flatMap((p) =>
  CONFIG_URNAS.map((c) => ({ presente: p.nome, urnaId: c.id, numero: c.numero })));

const barra = document.createElement('div');
barra.className = 'demo-barra';
barra.innerHTML = PRESENTES_DEMO
  .map((p) => `<button data-presente="${p.presente}" data-votar="${p.urnaId}">${p.presente} → ${p.numero}</button>`)
  .join('')
  + '<button data-rajada="1">Rajada de 12</button>'
  /*
   * A urna desenhada em 1080x1920 não cabe inteira numa janela deitada: ela
   * cai para 38% e o texto miúdo do visor vira borrão. Este botão desenha o
   * palco no tamanho real e deixa a página rolar, para conferir de perto o
   * que o OBS vai capturar — a transmissão em si continua capturando a
   * página inteira, sem zoom nenhum.
   */
  + '<button data-nova-rodada="1">Nova rodada</button>'
  + '<button data-zoom="1">Ver no tamanho real</button>';

/*
 * O erro de configuração aparece AQUI, e não no palco.
 *
 * A barra é invisível para o OBS — ela só surge quando alguém mexe o mouse —,
 * então o aviso chega a quem está operando e não entra no enquadramento. Um
 * aviso desenhado no palco seria uma interface administrativa ocupando a tela
 * principal, que é exatamente o que não pode haver.
 *
 * `textContent`, e não `innerHTML`: a mensagem é a de um JSON quebrado e cita
 * o que o navegador disse, com aspas e chaves dentro. Como texto, não há o que
 * escapar nem como a mensagem virar marcação.
 */
if (erroDaConfig) {
  const aviso = document.createElement('span');
  aviso.className = 'demo-barra__erro';
  aviso.textContent = erroDaConfig;
  barra.append(aviso);
}

document.body.append(barra);

/*
 * A barra fica invisível até alguém mexer o mouse.
 *
 * O OBS captura a página sem enviar evento nenhum de ponteiro, então a
 * barra simplesmente não aparece na transmissão — que é o que o requisito
 * de "nenhum controle administrativo no enquadramento" pede. Ela some
 * sozinha depois de três segundos parada, para não ficar no quadro quando
 * você estiver operando a live na mesma máquina.
 */
const mostrarBarra = () => {
  document.body.classList.add('mostrando-demo');
  clearTimeout(mostrarBarra._timer);
  mostrarBarra._timer = setTimeout(() => document.body.classList.remove('mostrando-demo'), 3000);
};
window.addEventListener('mousemove', mostrarBarra, { passive: true });

let contador = 0;

/*
 * Nomes de quem presenteia, no simulador.
 *
 * Um punhado de gente que volta, e não um nome novo a cada voto: com doze
 * espectadores diferentes mandando um presente cada, o ranking mostraria
 * doze linhas de "1" e não provaria nada. "Espectador N" e não um nome de
 * pessoa: isto é simulação, e um apelido realista na tela seria a única
 * coisa aqui capaz de fazer alguém acreditar que há um espectador de
 * verdade do outro lado.
 */
const PRESENTEADORES_DEMO = 5;

function enfileirar(urnaId, presente) {
  // Rodada fechada recusa voto. Recusar em silêncio, e não enfileirar e
  // ignorar depois: um voto que entra na fila e não é contado é pior do que
  // um voto que nunca entrou.
  if (!rodadaAberta) return false;
  const u = urnas[urnaId];
  contador += 1;
  const usuario = `Espectador ${1 + (contador % PRESENTEADORES_DEMO)}`;
  ator.fila.enfileirar({
    id: `demo-${contador}`,
    urna: u,
    urnaId,
    numero: u.config.numero,
    votos: 1,
    usuario,
    presente,
    prioridade: 0,
  });
  registrarPresente(usuario);
  return true;
}

barra.addEventListener('click', (evento) => {
  const btn = evento.target.closest('button');
  if (!btn) return;
  if (btn.dataset.zoom) {
    const ligado = cenario.alternarZoom();
    btn.textContent = ligado ? 'Voltar ao enquadramento' : 'Ver no tamanho real';
    btn.classList.toggle('demo-barra__botao--ativo', ligado);
    mostrarBarra();
    return;
  }
  if (btn.dataset.novaRodada) {
    novaRodada();
    return;
  }
  if (btn.dataset.rajada) {
    for (let i = 0; i < 12; i++) {
      setTimeout(() => enfileirar(i % 2 ? 'u1' : 'u2', i % 2 ? 'Rosa' : 'Heart Me'), i * 90);
    }
    return;
  }
  /*
   * `data-votar`, e não `data-urna`: o cartão do placar já responde por
   * `data-urna`, e ele vem antes da barra no documento — então um
   * `document.querySelector('[data-urna="u1"]')`, que é como qualquer script
   * de fora pede um voto, acertava o CARTÃO e morria em silêncio. Ver
   * tests/ganchos.test.js.
   */
  enfileirar(btn.dataset.votar, btn.dataset.presente);
});

/*
 * O placar e o cronômetro saem daqui junto com o resto.
 *
 * Não é API do site: é o mesmo motivo pelo qual `urnas` e `ator` já saíam —
 * a sonda do navegador precisa alcançar o placar que está NO AR, e não uma
 * cópia montada só para o teste. Dirigir o de verdade é a diferença entre
 * conferir que os cartões trocam de lugar e conferir que os cartões DESTA
 * página trocam de lugar.
 */
export { urnas, mao, ator, equipe, enfileirar, placar, cronometro, resultado, novaRodada };
