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
import { criarCronometro } from './cronometro.js';
import { criarPresentes, PRESENTES_PADRAO } from './presentes.js';
import { criarMaoSvg } from './hand/hand-svg.js';
import { AtorDaMao } from './hand-actor.js';
import { carregarConfig, aplicarConfig } from './config.js';

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

const placar = criarPlacar(camadaPlacar, CONFIG_URNAS.map((c) => ({
  id: c.id, nome: c.nome, numero: c.numero, votos: 0, cor: c.corPrimaria,
})));

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

const cronometro = criarCronometro(camadaPlacar, {
  duracao: DURACAO_RODADA,
  aoTerminar: () => { rodadaAberta = false; },
});
cronometro.comecar();

function atualizarPlacar() {
  placar.atualizar(CONFIG_URNAS.map((c) => ({
    id: c.id, nome: c.nome, numero: c.numero, votos: contagem[c.id], cor: c.corPrimaria,
  })));
}

const mao = criarMaoSvg();
const ator = new AtorDaMao({
  renderizador: mao,
  camada: camadaMao,
  opcoes: {
    aoContarVoto: ({ urnaId, votos }) => {
      contagem[urnaId] = (contagem[urnaId] ?? 0) + votos;
      atualizarPlacar();
    },
  },
});
ator.iniciar();

// ---- Controles de demonstração ----------------------------------------
// Substituídos pelo modo de teste real na Etapa 6. Servem para validar
// visualmente as Etapas 1-3 antes de construir o motor de votação.
// Os mesmos dois presentes da vitrine: o que a barra enfileira é o que a
// legenda embaixo da mesa está anunciando.
const PRESENTES_DEMO = presentes.map((p) => ({ nome: p.nome, urnaId: p.urnaId }));

const barra = document.createElement('div');
barra.className = 'demo-barra';
barra.innerHTML = PRESENTES_DEMO
  .map((p) => `<button data-presente="${p.nome}" data-votar="${p.urnaId}">${p.nome} → ${urnas[p.urnaId].config.nome}</button>`)
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

function enfileirar(urnaId, presente) {
  // Rodada fechada recusa voto. Recusar em silêncio, e não enfileirar e
  // ignorar depois: um voto que entra na fila e não é contado é pior do que
  // um voto que nunca entrou.
  if (!rodadaAberta) return false;
  const u = urnas[urnaId];
  contador += 1;
  ator.fila.enfileirar({
    id: `demo-${contador}`,
    urna: u,
    urnaId,
    numero: u.config.numero,
    votos: 1,
    usuario: `Espectador ${contador}`,
    presente,
    prioridade: 0,
  });
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
    rodadaAberta = true;
    cronometro.comecar(DURACAO_RODADA);
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

export { urnas, mao, ator, enfileirar };
