/**
 * O modo simulador — seção 4.7 da especificação.
 *
 * Não é um brinquedo de demonstração. É o modo em que o sistema roda
 * enquanto o adaptador real não existe, e é o que permite entregar e validar
 * todo o resto antes: o painel dispara presentes daqui, e daqui para frente
 * o caminho é exatamente o mesmo que a TikTok vai percorrer na Etapa 7.
 *
 * Ele passa pela MESMA normalização, de propósito. Um simulador que
 * montasse o evento à mão já pronto seria um simulador que concorda consigo
 * mesmo — e o dia da virada para o adaptador real seria o dia do primeiro
 * teste de verdade, no meio de uma live.
 *
 * Dois jeitos de presentear, e os dois existem na vida real:
 *
 *   - `enviar({ combo })` — um evento que vale N votos. É o presente que a
 *     fonte entrega agregado: N votos e UMA mão digitando;
 *   - `rajada({ quantidade })` — N eventos de um voto cada. É a fila de
 *     toques, uma mão por toque, que é o que faz a tela parecer uma votação
 *     acontecendo.
 */

import { criarFonte, normalizarEvento } from './base.js';

export function criarSimulador() {
  /*
   * O contador de combo por remetente e por presente.
   *
   * Ele é monótono enquanto a fonte viver, e não reinicia a cada rajada: o
   * `comboIndex` está na chave de deduplicação justamente para distinguir
   * dois presentes que chegaram no mesmo milissegundo, e um contador que
   * voltasse a zero faria a rajada seguinte colidir com a anterior.
   */
  const contadores = new Map();

  const proximoIndice = (userId, giftId) => {
    const chave = `${userId}:${giftId}`;
    const n = contadores.get(chave) ?? 0;
    contadores.set(chave, n + 1);
    return n;
  };

  const fonte = criarFonte({
    modo: 'simulador',
    detalhe: 'aguardando presentes do painel',
    iniciar: (f) => {
      f.definirConectada(true, 'aguardando presentes do painel');
    },
    parar: (f) => {
      f.definirConectada(false, 'parado');
    },
  });

  return {
    ...fonte,

    /**
     * Um presente do painel. `combo` é quantos votos ele vale — um só, por
     * padrão — e pede UMA animação, como manda a seção 4.5.
     */
    enviar({ giftId, userId = 'painel', userName = 'Painel', combo = 1, em } = {}) {
      if (!fonte.conectada) return false;
      return fonte.emitir(normalizarEvento({
        giftId, userId, userName, combo,
        comboIndex: proximoIndice(userId, String(giftId)),
        em,
      }, 'simulador'));
    },

    /**
     * Um evento social do painel: seguiu, curtiu, entrou, compartilhou,
     * assinou. É o que faz o narrador falar sem ninguém precisar seguir de
     * verdade no meio da live.
     *
     * Ele passa pela MESMA normalização que o `enviar`, e pelo mesmo motivo
     * de sempre: um caminho de teste que montasse o evento pronto estaria
     * concordando consigo mesmo. E é a normalização que garante o que
     * interessa aqui — sem `giftId`, um evento social não tem como virar
     * voto, então este botão é seguro de apertar com a live no ar.
     */
    social({ tipo, userId = 'painel', userName = 'Painel', quantidade, em } = {}) {
      if (!fonte.conectada) return false;
      return fonte.emitir(normalizarEvento({
        tipo, userId, userName, quantidade, em,
      }, 'simulador'));
    },

    /**
     * N toques seguidos, todos no mesmo instante.
     *
     * O `em` igual para todos não é preguiça: é o que uma rajada de verdade
     * faz. Se a rajada espaçasse os horários, ela estaria testando um mundo
     * mais fácil do que aquele em que o sistema vai rodar.
     */
    rajada({ giftId, userId = 'painel', userName = 'Painel', quantidade = 1 } = {}) {
      if (!fonte.conectada) return 0;
      const em = Date.now();
      let emitidos = 0;
      for (let i = 0; i < Math.max(1, Math.floor(quantidade)); i++) {
        if (fonte.emitir(normalizarEvento({
          giftId, userId, userName, combo: 1,
          comboIndex: proximoIndice(userId, String(giftId)),
          em,
        }, 'simulador'))) emitidos++;
      }
      return emitidos;
    },
  };
}
