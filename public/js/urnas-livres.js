/**
 * Qual urna recebe o voto.
 *
 * A urna deste projeto é uma MÁQUINA, e não um candidato. Quem manda o
 * presente do 13 está votando no candidato do 13, e a máquina em que a mão
 * digita o número é a que estiver livre — como na vida real, em que qualquer
 * urna serve para qualquer candidato e ninguém escolhe a cabine pelo voto.
 *
 * Enquanto a urna vinha dentro do item da fila, quem escolhia era quem
 * ENFILEIRAVA, e a escolha era feita no escuro: no instante em que o segundo
 * presente do 13 entrava, a urna do Lula ainda não estava ocupada, então os
 * dois votos recebiam a mesma máquina. As duas mãos iam para a mesma urna e
 * a outra ficava parada — o defeito que o Leonardo viu na live.
 *
 * Aqui a escolha é feita na hora de TRABALHAR, quando já se sabe o que está
 * ocupado. É este arquivo, e não o ator, que guarda o que está ocupado: duas
 * mãos perguntando ao mesmo tempo precisam de uma resposta só.
 *
 * Puro: não toca no DOM, não conhece o ator e não conhece o palco.
 */

/**
 * A urna que deve receber este voto, entre as livres.
 *
 * A preferência é pela urna do PRÓPRIO candidato — a que tem o número dele
 * no gabinete. Não é uma regra de contagem (o voto conta para o candidato de
 * qualquer jeito, ver `destino` no ator); é o que mantém a cena legível: o
 * 13 costuma sair na urna vermelha, e só sai na azul quando a vermelha está
 * ocupada.
 *
 * Devolve `null` quando não há nenhuma livre. Quem chama NÃO deve usar uma
 * urna ocupada no lugar: duas mãos na mesma tecla é pior do que uma mão
 * esperando o próximo quadro.
 */
export function escolherUrna(numero, livres) {
  const alvo = String(numero ?? '');
  return livres.find((u) => String(u.config?.numero ?? '') === alvo) ?? livres[0] ?? null;
}

/**
 * As máquinas livres, e por quanto tempo.
 *
 * Uma reserva, e não uma lista: `pegar` marca a urna como ocupada no mesmo
 * instante em que a entrega, e é isso que impede duas mãos de receberem a
 * mesma máquina no mesmo quadro. A lista de urnas é guardada inteira, na
 * ordem em que o cenário as montou — é ela que decide o desempate.
 */
export function criarReservaDeUrnas(urnas) {
  const todas = [...urnas];
  const ocupadas = new Set();

  const livres = () => todas.filter((u) => !ocupadas.has(u));

  return {
    livres,
    /** Reserva e devolve a urna deste voto, ou null se não houver nenhuma. */
    pegar(item) {
      const urna = escolherUrna(item?.numero, livres());
      if (urna) ocupadas.add(urna);
      return urna;
    },
    /**
     * Devolve a urna ao fim do voto.
     *
     * Idempotente de propósito: o fim do voto passa pelo `finally` do ator e
     * pode passar de novo pelo do watchdog, e uma segunda devolução não pode
     * abrir uma vaga que não existe — uma terceira mão entraria numa urna
     * com gente dentro.
     */
    devolver(urna) {
      ocupadas.delete(urna);
    },
  };
}
