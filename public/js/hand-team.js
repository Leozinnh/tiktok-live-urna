/**
 * A equipe de mãos.
 *
 * Com uma mão só, dois presentes que chegam no mesmo segundo viram uma fila
 * de espera: o segundo espectador assiste ao voto do primeiro antes de o
 * dele começar, e numa live movimentada isso é uma fila que cresce mais
 * rápido do que anda. Duas mãos resolvem o caso que realmente acontece —
 * duas pessoas mandando presente ao mesmo tempo, cada uma com o seu voto
 * sendo depositado na frente dela.
 *
 * O que é COMPARTILHADO e o que é de cada mão:
 *
 *   - a fila é uma só. Duas filas dariam duas contagens de "quantos faltam",
 *     e a tela mostraria uma ao lado da outra discordando;
 *   - o ticker é um só. Um `requestAnimationFrame` por mão dessincronizaria
 *     as duas animações no mesmo quadro, que é justamente o que o projeto
 *     evita desde o começo (ver o comentário do `iniciar` em hand-actor.js);
 *   - a posição, a pose e o "estou ocupada" são de cada mão. É isso que
 *     permite as duas estarem em pontos diferentes do palco ao mesmo tempo.
 *
 * Quem faz a fila andar é a EQUIPE, e não cada ator: o watchdog da fila
 * conta tempo virtual, e dois atores chamando `tick` no mesmo quadro
 * contariam em dobro — a fila destravaria na metade do prazo e um voto
 * ainda em animação seria dado por concluído.
 */

import { Ticker } from './anim/timeline.js';
import { FilaDeAnimacao } from './anim/queue.js';
import { AtorDaMao } from './hand-actor.js';
import { criarMaoSvg } from './hand/hand-svg.js';

/**
 * Duas mãos: uma por urna.
 *
 * É a conta do projeto — são duas urnas —, mas não é uma regra: uma terceira
 * urna pediria uma terceira mão, e o resto do arquivo já funciona com
 * qualquer número.
 */
export const MAOS_PADRAO = 2;

export function criarEquipeDeMaos({
  camada,
  quantidade = MAOS_PADRAO,
  opcoes = {},
  // Injetável pelo mesmo motivo que o ticker do ator é: sem isto a equipe só
  // existiria dentro de um navegador, e a parte que realmente pode travar
  // uma live — duas mãos disputando a mesma fila — ficaria sem teste.
  criarRenderizador = criarMaoSvg,
}) {
  const ticker = opcoes.ticker ?? new Ticker();
  const fila = new FilaDeAnimacao({ maxSimultaneas: quantidade, ...(opcoes.fila ?? {}) });

  const atores = [];
  for (let i = 0; i < quantidade; i++) {
    atores.push(new AtorDaMao({
      renderizador: criarRenderizador(),
      camada,
      opcoes: {
        ...opcoes,
        ticker,
        fila,
        // A fila é uma só; quem a faz andar é a equipe, logo abaixo.
        tickDaFila: false,
      },
    }));
  }

  ticker.registrarPasso((delta) => fila.tick(delta));

  let iniciada = false;

  return {
    fila,
    ticker,
    atores,

    get maos() { return atores.length; },
    get ocupadas() { return atores.filter((a) => a.ocupado).length; },

    iniciar() {
      // Idempotente: `iniciar` duas vezes registraria duas vezes o passo de
      // cada ator no ticker, e cada mão andaria dois quadros por quadro.
      if (iniciada) return;
      iniciada = true;
      for (const ator of atores) ator.iniciar();
    },

    enfileirar(item) { return fila.enfileirar(item); },
  };
}
