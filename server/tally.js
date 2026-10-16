/**
 * O motor de votos — a contagem autoritativa.
 *
 * A seção 3 da especificação separa "verdade" de "teatro": o placar nunca
 * espera a animação, a fila controla só o espetáculo, e um voto nunca é
 * perdido porque a fila visual está cheia — quem degrada é a ANIMAÇÃO, não o
 * voto. Este arquivo é a verdade.
 *
 * A ordem do processamento é a da seção 4.5, e ela não é negociável:
 *
 *   evento -> normalizar -> deduplicar -> mapear presente em urna ->
 *   gravar no banco -> aplicar na contagem em memória -> conferir liderança
 *
 * As duas consequências que mais importam:
 *
 *   - a gravação no banco vem ANTES da contagem em memória, e nunca lança.
 *     Falha de disco não pode custar um voto (seção 7);
 *   - o motor CONTA e não DESENHA. Ele diz que houve um voto e de quem ele é;
 *     a mão que vai digitar é assunto da página.
 *
 * Puro em relação ao DOM e ao WebSocket: quem fala com o mundo é o hub, em
 * server/index.js.
 */

import { pontosDoPresente, VOTOS_DO_PRESENTE } from './config.js';
import { VOTOS_DO_CHAT } from './chat-voto.js';

/**
 * A chave de deduplicação da especificação: `plataforma:userId:giftId:timestamp:comboIndex`.
 *
 * O `comboIndex` está aí por um motivo que só aparece em live movimentada: o
 * combo manda VÁRIOS eventos com o mesmo instante, um por presente da
 * rajada. Sem ele, a segunda rosa de uma sequência seria descartada como
 * repetição da primeira — o espectador mandaria cinco e o placar subiria um.
 */
export function chaveDoEvento(evento) {
  const partes = [
    evento?.plataforma ?? 'desconhecida',
    evento?.userId ?? '',
    evento?.giftId ?? '',
    evento?.em ?? '',
    evento?.comboIndex ?? 0,
  ];
  return partes.join(':');
}

/** Quantas rodadas ficam guardadas. */
const RODADAS_GUARDADAS = 20;

export function criarTally({ db, config }) {
  let cfg = config;
  let rodada = null;
  let votos = Object.create(null);      // urnaId -> total
  let ultimoVoto = Object.create(null); // urnaId -> { usuario, presente, votos, em }
  let lider = null;                     // urnaId, ou null quando ninguém pontuou
  let empatadas = new Set();
  const avisos = [];
  const recentes = [];
  const LIMITE_DE_AVISOS = 50;
  const LIMITE_DE_RECENTES = 40;

  /*
   * Um aviso é uma linha para o painel, e não um log que cresce a noite
   * inteira: a seção 7 pede memória estável em lives de várias horas, e uma
   * lista sem fim é exatamente o tipo de vazamento que só aparece na sexta
   * hora, quando ninguém está olhando.
   */
  function avisar(texto) {
    avisos.push({ em: Date.now(), texto });
    if (avisos.length > LIMITE_DE_AVISOS) avisos.shift();
  }

  function zerar() {
    votos = Object.create(null);
    ultimoVoto = Object.create(null);
    lider = null;
    empatadas = new Set();
    recentes.length = 0;
    for (const id of Object.keys(cfg.urnas)) votos[id] = 0;
  }

  /** As urnas ativas, na ordem configurada. */
  function urnasAtivas() {
    return Object.values(cfg.urnas)
      .filter((u) => u.ativo !== false)
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  }

  /**
   * Quem está na frente agora, e se houve empate.
   *
   * Empate é um estado de verdade, e não a ausência de líder: com duas urnas
   * empatadas em 12, dizer que a urna 1 lidera é a tela mentindo sobre a
   * disputa — que é justamente o que o placar existe para mostrar.
   */
  function calcularLideranca() {
    let maior = -1;
    let naFrente = [];
    for (const u of urnasAtivas()) {
      const v = votos[u.id] ?? 0;
      if (v > maior) { maior = v; naFrente = [u.id]; } else if (v === maior) naFrente.push(u.id);
    }
    if (maior <= 0) return { lider: null, empatadas: new Set() };
    if (naFrente.length > 1) return { lider: null, empatadas: new Set(naFrente) };
    return { lider: naFrente[0], empatadas: new Set() };
  }

  const tally = {
    get rodadaId() { return rodada?.id ?? null; },
    avisos: () => avisos.slice(),
    recentes: () => recentes.slice(),

    definirConfig(nova) {
      cfg = nova;
      for (const id of Object.keys(cfg.urnas)) if (!(id in votos)) votos[id] = 0;
    },

    /** Abre uma rodada e devolve ela. A contagem começa do zero. */
    abrirRodada({ iniciadaEm = Date.now(), duracaoSegundos } = {}) {
      const segundos = duracaoSegundos ?? cfg.rodada.duracaoSegundos;
      rodada = db.abrirRodada({ iniciadaEm, duracaoSegundos: segundos });
      if (!rodada) {
        /*
         * O banco recusou. A rodada segue em memória com um id negativo, que
         * não colide com nenhum id do banco: perder a rodada inteira por
         * causa do disco é exatamente o que a seção 7 proíbe.
         */
        avisar('o banco recusou a rodada nova; seguindo só em memória');
        rodada = { id: -Date.now(), iniciadaEm, encerradaEm: null, duracaoSegundos: segundos };
      }
      zerar();
      return rodada;
    },

    /**
     * Fecha a rodada. Os votos recebidos ANTES daqui já estão contados — a
     * seção 6.3 manda processar o que chegou, e não descartar por causa do
     * relógio.
     */
    fecharRodada({ em = Date.now(), motivo = 'tempo' } = {}) {
      if (!rodada || rodada.encerradaEm != null) return null;
      const fechada = db.encerrarRodada({ id: rodada.id, encerradaEm: em, motivo }) ?? {
        ...rodada, encerradaEm: em, motivo,
      };
      rodada = fechada;
      db.podar({ manterRodadas: RODADAS_GUARDADAS });
      return fechada;
    },

    get aberta() { return Boolean(rodada) && rodada.encerradaEm == null; },

    /**
     * Processa um evento de presente.
     *
     * Devolve sempre um objeto, nunca lança:
     *
     *   { contado, motivo?, chave, urnaId?, usuario, presente, votos,
     *     animar, lideranca }
     *
     * `animar` é o pedido de espetáculo — um por EVENTO, mesmo quando o
     * combo vale cinco votos. `lideranca` é `{ tipo: 'virada' | 'empate',
     * urnaId, anterior }` quando a disputa virou nesta chamada.
     */
    processar(evento) {
      const negar = (motivo) => ({ contado: false, motivo, chave: null, animar: false, lideranca: null });

      if (!evento || evento.giftId == null || evento.giftId === '') {
        avisar('evento sem giftId, ignorado');
        return negar('evento-invalido');
      }
      /*
       * A rodada fechada AVISA, e o aviso é o que impede o presente de sumir.
       *
       * Era a recusa mais cara do motor, e a única sem uma linha no painel:
       * fora de uma rodada, o presente chegava, não virava voto, não virava
       * fala e não virava aviso — a live inteira ficava sem saber que ele
       * existiu. O Leonardo mandou uma Rosa pelo painel assim e ficou sem
       * resposta. O que o operador precisa ler aqui é o que fazer: a rodada
       * está fechada, e é ele que abre.
       */
      if (!tally.aberta) {
        avisar(`o presente ${evento.giftNome || evento.giftId} não conta: a rodada está fechada`);
        return negar('rodada-fechada');
      }

      const chave = chaveDoEvento(evento);

      /*
       * A deduplicação é consultada no BANCO, e não só na memória. Uma
       * reconexão que reinicia o processo não pode reabrir a porta para os
       * votos que já entraram — é o teste crítico 6 da seção 8.
       */
      if (db.jaContado(chave)) return negar('duplicado');

      const presente = cfg.presentes.find((p) => p.giftId === String(evento.giftId));
      if (!presente) {
        avisar(`presente ${evento.giftId} não tem mapeamento; não conta`);
        return negar('sem-mapeamento');
      }
      if (presente.ativo === false) {
        // A outra recusa muda. Quem desativou o presente foi o operador — e
        // ele é justamente quem precisa se lembrar disso ao ver o placar
        // parado.
        avisar(`o presente ${presente.nome} está desativado; não conta`);
        return negar('presente-inativo');
      }
      if (!presente.urnaId) {
        avisar(`presente ${presente.nome} não aponta para urna nenhuma; não conta`);
        return negar('sem-urna');
      }
      const urna = cfg.urnas[presente.urnaId];
      if (!urna || urna.ativo === false) {
        avisar(`presente ${presente.nome} aponta para a urna ${presente.urnaId}, que não está ativa`);
        return negar('urna-inativa');
      }

      return contar(evento, chave, presente, urna);
    },

    /**
     * O voto que o CHAT resgatou.
     *
     * Um presente sem urna no painel não conta sozinho — mas também não pode
     * sumir: quem pagou por ele merece que o voto aconteça. Quem decide a
     * urna é o número que a pessoa escreveu no chat, e daqui para baixo o
     * caminho é o MESMO do presente mapeado: deduplicar, gravar, somar,
     * conferir a liderança. O que muda é só de onde veio o número da urna.
     *
     * A chave de deduplicação continua sendo a do PRESENTE, e não a do
     * comentário: é o presente que vale uma vez só. Um espectador que escreve
     * "22" duas vezes, ou uma reconexão que reentrega o comentário, não podem
     * contar duas vezes o mesmo diamante.
     */
    contarPeloNumero(evento, { numero } = {}) {
      const negar = (motivo) => ({ contado: false, motivo, chave: null, animar: false, lideranca: null });

      if (!evento || evento.giftId == null || evento.giftId === '') {
        avisar('presente resgatado sem giftId, ignorado');
        return negar('evento-invalido');
      }
      if (!tally.aberta) return negar('rodada-fechada');

      const procurado = Number(numero);
      const urna = Object.values(cfg.urnas).find(
        (u) => Number.isFinite(procurado) && Number(u.numero) === procurado && u.ativo !== false,
      );
      if (!urna) return negar('numero-sem-urna');

      const chave = chaveDoEvento(evento);
      if (db.jaContado(chave)) return negar('duplicado');

      /*
       * O nome do presente é o que a LIVE deu a ele. Um presente sem
       * mapeamento não tem nome no painel, e a etiqueta da fila escreve este
       * nome — sem o fallback, ela mostraria "undefined" no ar.
       */
      const nome = String(evento.giftNome ?? '').trim() || 'Presente';
      /*
       * E ele vale o PISO dos presentes, e não um voto.
       *
       * Um presente resgatado é um presente que alguém pagou — só não tem
       * preço no painel, porque não tem mapeamento. Valendo um voto, ele seria
       * o presente mais caro da noite contando menos que o Heart Me, que é
       * exatamente o contrário do que o preço manda. Sem preço conhecido, o
       * piso é a resposta honesta: vale o mesmo que o presente mais barato.
       */
      return contar(evento, chave, { nome, votos: VOTOS_DO_PRESENTE, ativo: true }, urna);
    },

    /**
     * O voto que o CHAT escreveu.
     *
     * O caminho de graça: quem não tem moeda escreve o nome ou o número do
     * candidato e o voto entra. Vale UM voto, e é isso que mantém o presente
     * valendo a pena — ver o cabeçalho do `chat-voto.js`.
     *
     * Quem decide a urna é o `acharUrna` de lá, e ele só devolve urna quando o
     * texto cita UMA. Aqui a urna chega já decidida, e o que sobra é o mesmo
     * caminho de sempre: deduplicar, gravar, somar, conferir a liderança. É de
     * propósito que os três caminhos até o voto terminem no mesmo `contar` —
     * um deles que esquecesse a liderança seria o voto que não move o placar.
     */
    contarPeloChat(evento, { urnaId, chave } = {}) {
      const negar = (motivo) => ({ contado: false, motivo, chave: null, animar: false, lideranca: null });

      /*
       * A rodada fechada AVISA, como no presente: fora de uma rodada, o voto
       * escrito não conta — e sem esta linha o espectador que digitou "22"
       * ficaria sem saber por que não aconteceu nada.
       */
      if (!tally.aberta) {
        avisar('o voto escrito no chat não conta: a rodada está fechada');
        return negar('rodada-fechada');
      }

      const urna = cfg.urnas?.[urnaId];
      if (!urna || urna.ativo === false) {
        avisar(`voto escrito no chat para a urna ${urnaId}, que não está ativa`);
        return negar('urna-inativa');
      }

      const k = chave ?? chaveDoEvento(evento);
      if (db.jaContado(k)) return negar('duplicado');

      /*
       * O nome do presente daqui é o que a etiqueta da mão escreve, e ele não
       * pode ser o nome de um presente: quem votou pelo chat não mandou nada.
       */
      return contar(evento, k, { nome: 'Voto no chat', votos: VOTOS_DO_CHAT, ativo: true }, urna, 'chat');
    },

    /** O retrato completo, para `state.full` e para o painel. */
    estado() {
      const lista = urnasAtivas();
      const total = lista.reduce((s, u) => s + (votos[u.id] ?? 0), 0);
      return {
        rodada: rodada ? {
          id: rodada.id,
          iniciadaEm: rodada.iniciadaEm,
          duracaoSegundos: rodada.duracaoSegundos,
          aberta: rodada.encerradaEm == null,
          encerradaEm: rodada.encerradaEm,
          motivo: rodada.motivo ?? null,
        } : null,
        total,
        lider,
        empate: empatadas.size > 1,
        urnas: lista.map((u) => {
          const v = votos[u.id] ?? 0;
          return {
            id: u.id, nome: u.nome, numero: u.numero, cor: u.corPrimaria,
            votos: v,
            // Percentual arredondado: a barra do placar desenha inteiros, e
            // uma fração de voto por cento não é informação para ninguém.
            percentual: total > 0 ? Math.round((v / total) * 100) : 0,
            lider: lider === u.id,
            ultimoVoto: ultimoVoto[u.id] ?? null,
          };
        }),
        apoiadores: db.apoiadores(rodada?.id ?? -1, 10),
        avisos: avisos.slice(),
      };
    },

    /**
     * Refaz a contagem a partir do banco.
     *
     * É o que a página faz ao abrir, e o que o servidor faz ao subir depois
     * de um reinício no meio da live: o banco é a memória longa, e a memória
     * curta se reconstrói dele.
     */
    reconstruir() {
      const ultima = db.rodadaAtual();
      zerar();
      if (!ultima) { rodada = null; return null; }
      rodada = ultima;

      const doBanco = db.votosDaRodada(ultima.id);
      for (const v of doBanco) {
        votos[v.urnaId] = (votos[v.urnaId] ?? 0) + v.votos;
        ultimoVoto[v.urnaId] = { usuario: v.usuario, presente: v.presente, votos: v.votos, em: v.em };
        recentes.push(v);
      }
      while (recentes.length > LIMITE_DE_RECENTES) recentes.shift();

      const agora = calcularLideranca();
      lider = agora.lider;
      empatadas = agora.empatadas;
      return rodada;
    },
  };

  /*
   * A liderança de partida não conta como virada: a primeira urna a pontuar
   * não "assumiu a liderança" de ninguém. Sem isto, o primeiro voto da noite
   * dispararia o som de ultrapassagem — e o clímax da disputa viraria o
   * barulho mais barato da cena.
   */
  function descreverVirada(antes, antesEmpate, agora) {
    if (agora.empatadas.size > 1 && !antesEmpate) {
      return { tipo: 'empate', urnaId: null, anterior: antes };
    }
    if (!agora.lider || agora.lider === antes) return null;
    if (antes == null) return null;
    return { tipo: 'virada', urnaId: agora.lider, anterior: antes };
  }

  /**
   * A conta em si: o presente já resolvido e a urna já decidida.
   *
   * Ela existe separada porque há DOIS caminhos até aqui — o presente que o
   * painel já mapeia, e o presente órfão que o chat resgatou —, e os dois têm
   * que terminar no mesmo lugar: gravados no banco, somados na memória,
   * entrando no ranking de apoiadores, e conferindo a liderança. Duplicar
   * esta metade significaria que um dos dois caminhos esqueceria um desses
   * passos, e o voto que decide a rodada seria justamente o que não move o
   * placar.
   *
   * O `presente` daqui é o mínimo que a conta precisa: um nome para a
   * etiqueta e quantos votos ele vale. O da configuração passa direto; o
   * resgatado no chat chega montado aqui.
   *
   * `origem` é de ONDE o voto veio — 'presente' ou 'chat' —, e ele viaja até a
   * tela porque as duas coisas não são iguais lá: o presente tem desenho, e o
   * voto escrito não tem. Sem ele, a etiqueta da mão procuraria o desenho de
   * um presente chamado "Voto no chat" e não acharia nada.
   */
  function contar(evento, chave, presente, urna, origem = 'presente') {
    const combo = evento.combo ?? 1;
    /*
     * O presente vai INTEIRO para a conta, e não só o campo `votos`.
     *
     * Era `{ votos: presente.votos }`, e isso bastava enquanto o número de
     * votos era um campo escrito no arquivo. Desde que o preço em moedas
     * decide — "quanto mais caro o presente, mais voto" —, montar um objeto
     * novo aqui joga fora justamente o `moedas`, e todos os presentes passam a
     * valer o piso: o diamante e o Heart Me, o mesmo tanto. O defeito não
     * deixa rastro, porque o voto continua contando e o placar continua
     * subindo — só que sempre igual.
     */
    const pontos = pontosDoPresente(presente, urna, combo);
    const em = evento.em ?? Date.now();

    /*
     * Grava ANTES de contar, e o resultado da gravação não decide a
     * contagem. Um `false` aqui significa "já estava gravado" (a chave é
     * única no banco) e um erro de disco devolve `false` também — nos dois
     * casos o voto vale, porque quem decide se ele é repetido é o
     * `jaContado` de quem chamou, consultado na mesma transação lógica.
     */
    const gravou = db.registrarVoto({
      rodadaId: rodada.id, chave, urnaId: urna.id,
      usuario: evento.usuario ?? '', presente: presente.nome,
      votos: pontos, em,
    });
    if (!gravou && !db.jaContado(chave)) {
      avisar(`o banco não gravou o voto de ${evento.usuario ?? 'alguém'}; a contagem segue em memória`);
    }

    const antes = lider;
    const antesEmpate = empatadas.size > 0;

    votos[urna.id] = (votos[urna.id] ?? 0) + pontos;
    ultimoVoto[urna.id] = { usuario: evento.usuario ?? '', presente: presente.nome, votos: pontos, em };
    recentes.push({
      chave, urnaId: urna.id, usuario: evento.usuario ?? '',
      presente: presente.nome, votos: pontos, em,
    });
    if (recentes.length > LIMITE_DE_RECENTES) recentes.shift();

    const agora = calcularLideranca();
    lider = agora.lider;
    empatadas = agora.empatadas;

    return {
      contado: true,
      motivo: null,
      chave,
      urnaId: urna.id,
      // O número que a mão vai digitar e a ficha que a urna vai mostrar
      // saem daqui: quem anima não consulta a configuração.
      numero: urna.numero,
      candidato: urna.candidato,
      usuario: evento.usuario ?? '',
      presente: presente.nome,
      origem,
      votos: pontos,
      animar: true,
      lideranca: descreverVirada(antes, antesEmpate, agora),
    };
  }

  zerar();
  return tally;
}
