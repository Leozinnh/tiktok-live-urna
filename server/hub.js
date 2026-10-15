/**
 * O hub — seção 5 da especificação, o protocolo WebSocket.
 *
 * O transporte mora em `ws.js`: o handshake, os quadros, os pedaços. Aqui é
 * o que o servidor FAZ com o que chega, e o que ele decide contar para quem.
 *
 * A separação da seção 3 aparece de novo, agora do lado do fio: o motor
 * CONTA e não DESENHA, e o hub é quem traduz a contagem em mensagens. Um voto
 * vira três coisas, nesta ordem, e a ordem é a da seção 4.5:
 *
 *   `vote.counted`  — o fato aconteceu;
 *   `tally.update`  — o placar sobe AGORA, sem esperar a mão digitar;
 *   `vote.animate`  — a fila pede o espetáculo, que pode esperar.
 *
 * Duas decisões que não estão escritas na especificação e valem o registro:
 *
 *   - **o papel do cliente vem da conexão.** A spec chama o campo de `tipo`
 *     dentro de uma mensagem que também se chama `tipo`; aqui o papel se
 *     chama `papel` e a mensagem continua sendo `tipo`, porque um envelope
 *     com dois nomes iguais é um envelope que ninguém lê direito;
 *   - **a velocidade da animação não vai para o disco.** `anim.speed` muda a
 *     velocidade em memória e avisa todo mundo, mas quem grava
 *     `config/local.json` é o `config.update` da aba Animação. Arrastar um
 *     controle não pode reescrever um arquivo a cada quadro.
 *
 * Isto NÃO é uma fronteira de segurança: o servidor roda na máquina do
 * Leonardo, e quem alcança a porta 3000 alcança o painel. O que a separação
 * de papéis protege é outra coisa, e é real — uma tecla apertada por engano
 * na janela que o OBS está capturando não pode encerrar a rodada.
 */

import { mesclar, normalizar } from './config.js';

export function criarHub({
  tally,
  fonte,
  config,
  agora = () => Date.now(),
  // Como gravar `config/local.json`. Injetado para o hub não saber de
  // caminhos de arquivo, e para a suíte não escrever no disco de ninguém.
  aoSalvar = null,
}) {
  let cfg = config;
  const clientes = new Set();
  let sequencia = 0;

  /*
   * Quando a rodada termina. `null` quer dizer "sem relógio correndo" — uma
   * rodada aberta sem prazo, ou nenhuma rodada. É o `null` que faz o `tick`
   * de cada segundo ser barato e o fim da rodada acontecer uma vez só.
   */
  let terminaEm = null;

  const ehAdmin = (c) => c.papel === 'admin';

  const enviarA = (cliente, tipo, payload) => {
    try {
      cliente.enviar(JSON.stringify({ tipo, payload }));
    } catch (erro) {
      /*
       * O OBS recarrega a fonte de navegador no meio da live, e cada recarga
       * deixa um socket morto que só reclama na primeira escrita. Tirar o
       * cliente aqui é o que impede a lista de crescer a noite inteira.
       */
      clientes.delete(cliente);
      console.error(`[hub] cliente ${cliente.id} caiu ao receber ${tipo}: ${erro.message}`);
    }
  };

  const enviarATodos = (tipo, payload) => {
    for (const c of [...clientes]) enviarA(c, tipo, payload);
  };

  const enviarAosAdmins = (tipo, payload) => {
    for (const c of [...clientes]) if (ehAdmin(c)) enviarA(c, tipo, payload);
  };

  /**
   * O placar, no formato do `tally.update` da especificação.
   *
   * A `diferenca` sai calculada daqui, e não no navegador: a faixa superior
   * mostra a distância entre primeiro e segundo, e mostrá-la é o que
   * transforma dois números numa disputa. Com zero ou uma urna ativa não há
   * distância a mostrar, e é zero — e não `undefined`, que impresso na tela
   * da live é o defeito que só aparece no primeiro segundo da transmissão.
   */
  function placar() {
    const e = tally.estado();
    const votos = e.urnas.map((u) => u.votos).sort((a, b) => b - a);
    return {
      urnas: e.urnas,
      total: e.total,
      apoiadores: e.apoiadores,
      lider: e.lider,
      empate: e.empate,
      diferenca: votos.length > 1 ? votos[0] - votos[1] : 0,
    };
  }

  /**
   * O retrato do motor para uma página.
   *
   * A única diferença entre o painel e a tela é o log de avisos: "presente
   * 999 não tem mapeamento" é exatamente o tipo de texto que não pode vazar
   * para a captura. Para a tela ele vai vazio, e vai — o formato é o mesmo,
   * o que faz a página não precisar saber com quem está falando.
   */
  function estadoPara(cliente) {
    const e = tally.estado();
    return { ...placar(), rodada: e.rodada, avisos: ehAdmin(cliente) ? e.avisos : [] };
  }

  function retrato(cliente) {
    const payload = {
      config: cfg,
      tally: estadoPara(cliente),
      rodada: tally.estado().rodada,
      votosRecentes: tally.recentes(),
    };
    if (ehAdmin(cliente)) payload.fonte = fonte.status();
    return payload;
  }

  function atualizacaoDeRodada() {
    return {
      estado: tally.aberta ? 'aberta' : 'encerrada',
      terminaEm,
      restante: terminaEm == null ? 0 : Math.max(0, terminaEm - agora()),
      tally: placar(),
    };
  }

  /**
   * Fecha a rodada e conta o resultado.
   *
   * Quem fecha é o relógio do SERVIDOR, e não o do navegador: uma página de
   * transmissão que dorme no meio da live não pode ser a que decide quando a
   * votação terminou. E os votos recebidos antes daqui já estão contados —
   * a seção 6.3 manda processar o que chegou, não descartar por causa da
   * hora.
   */
  function fecharRodada(motivo) {
    terminaEm = null;
    if (!tally.aberta) return;
    tally.fecharRodada({ em: agora(), motivo });
    const e = tally.estado();
    enviarATodos('round.finished', {
      ...atualizacaoDeRodada(),
      motivo,
      // O resultado é o placar final ordenado. A faixa mostra "{urna}
      // VENCEU!" e a tela de resultado desenha a lista — nenhuma das duas
      // precisa saber ordenar.
      resultado: [...e.urnas].sort((a, b) => b.votos - a.votos),
    });
  }

  /* ------------------------------------------------------- o que chega */

  function processarMensagem(cliente, bruto) {
    let msg;
    try {
      msg = JSON.parse(bruto);
    } catch {
      return; // nem tudo que chega neste socket é JSON nosso
    }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;

    /*
     * A saudação e o pedido de retrato são as duas coisas que a TELA pode
     * dizer. O papel declarado aqui não é uma credencial — é a página
     * dizendo quem ela é, e quem alcança esta porta pode dizer o que quiser.
     * O que se protege com isto é o acidente, não o ataque: uma tecla
     * apertada na janela que o OBS captura não pode encerrar a rodada.
     */
    if (msg.tipo === 'hello') {
      cliente.papel = msg.papel === 'admin' ? 'admin' : 'broadcast';
      enviarA(cliente, 'state.full', retrato(cliente));
      return;
    }
    if (msg.tipo === 'state.request') {
      enviarA(cliente, 'state.full', retrato(cliente));
      return;
    }

    if (!ehAdmin(cliente)) return;

    switch (msg.tipo) {
      case 'sim.gift':
        fonte.enviar?.({
          giftId: msg.giftId,
          userId: msg.userId ?? 'painel',
          userName: msg.userName ?? 'Painel',
          combo: msg.combo ?? 1,
        });
        break;

      case 'round.start':
        tally.abrirRodada({ iniciadaEm: agora() });
        terminaEm = agora() + Math.max(1, cfg.rodada.duracaoSegundos) * 1000;
        enviarATodos('round.update', atualizacaoDeRodada());
        break;

      case 'round.stop':
        fecharRodada('manual');
        break;

      case 'round.reset':
        // Zera abrindo uma rodada nova: os votos da anterior continuam no
        // banco, que é para isso que ele existe, e a contagem em memória
        // começa do zero sem ninguém precisar apagar nada.
        if (tally.aberta) tally.fecharRodada({ em: agora(), motivo: 'reset' });
        tally.abrirRodada({ iniciadaEm: agora() });
        terminaEm = null;
        enviarATodos('round.update', atualizacaoDeRodada());
        break;

      case 'config.update': {
        /*
         * Um remendo, e não um retrato inteiro: o painel manda só a aba que
         * ele mexeu, e o que não foi dito continua valendo. Uma configuração
         * que chega quebrada é recusada INTEIRA e a boa continua no ar — a
         * seção 7 manda cair para o padrão e avisar, e o meio de uma live é
         * o pior momento possível para perder o mapeamento dos presentes.
         *
         * Recusar em silêncio é o que não pode: o `mesclar` ignora um remendo
         * que não é objeto, e sem o aviso abaixo o painel mostraria "salvo"
         * para uma gravação que não aconteceu. O aviso é o que transforma a
         * recusa em algo que o Leonardo vê.
         */
        const remendo = msg.config;
        if (remendo && typeof remendo === 'object' && !Array.isArray(remendo)) {
          const { config: nova, avisos } = normalizar(mesclar(cfg, remendo), cfg);
          cfg = nova;
          tally.definirConfig(cfg);
          aoSalvar?.(cfg);
          enviarATodos('config.changed', { config: cfg, avisos });
        } else {
          enviarATodos('config.changed', {
            config: cfg,
            avisos: [{ em: agora(), texto: 'a configuração enviada não é um objeto; nada foi alterado' }],
          });
        }
        break;
      }

      case 'anim.speed': {
        const v = Number(msg.velocidade);
        if (!Number.isFinite(v) || v <= 0) break;
        cfg = { ...cfg, animacao: { ...cfg.animacao, velocidade: v } };
        tally.definirConfig(cfg);
        // Sem `aoSalvar`: isto é o controle da rodada, não uma edição de
        // configuração. O que persiste é o botão de salvar da aba Animação.
        enviarATodos('config.changed', { config: cfg, avisos: [] });
        break;
      }

      default:
        break; // mensagem de uma versão futura do painel: ignora e segue
    }
  }

  /* --------------------------------------------------- o que sai sozinho */

  /*
   * A fonte fala, o motor conta, o hub conta para as páginas. Este é o
   * caminho inteiro de um presente que chega da live, e é o único lugar
   * onde ele existe.
   */
  fonte.aoEvento((evento) => {
    const r = tally.processar(evento);
    if (!r.contado) return;

    enviarATodos('vote.counted', {
      id: r.chave,
      urnaId: r.urnaId,
      userId: evento.userId,
      usuario: r.usuario,
      presente: r.presente,
      votos: r.votos,
      em: evento.em,
      ts: agora(),
    });

    // O placar sobe antes do espetáculo. Se a fila entupir, quem atrasa é a
    // mão — nunca o número.
    enviarATodos('tally.update', placar());

    const presente = cfg.presentes.find((p) => p.giftId === String(evento.giftId));
    enviarATodos('vote.animate', {
      id: r.chave,
      urnaId: r.urnaId,
      // O número que a mão digita e a ficha que a urna mostra viajam JUNTO
      // com o voto, e não são deduzidos da configuração pela página: uma
      // edição no painel entre o voto e a animação faria a mão digitar o
      // número errado — e a urna deste projeto é uma MÁQUINA, que digita o
      // número do candidato que recebeu o presente.
      numero: r.numero,
      candidato: r.candidato,
      giftId: String(evento.giftId),
      usuario: r.usuario,
      votos: r.votos,
      prioridade: presente?.prioridade ?? 0,
    });

    if (r.lideranca) {
      enviarATodos('lead.changed', {
        urnaId: r.lideranca.urnaId,
        anteriorId: r.lideranca.anterior,
        empate: r.lideranca.tipo === 'empate',
      });
    }
  });

  fonte.aoStatus((s) => enviarAosAdmins('source.status', s));

  /* ----------------------------------------------------------- a fachada */

  return {
    /**
     * Adota um socket. O `enviar` é do socket; o resto é do hub.
     *
     * Devolve o próprio cliente com `receber` e `fechar` pendurados, porque
     * é assim que o `upgrade` do HTTP usa isto: ele já tem o socket na mão, e
     * o que ele precisa de volta é onde entregar os bytes que chegarem.
     */
    conectar(socket, { papel } = {}) {
      const cliente = {
        id: ++sequencia,
        ...socket,
        papel: papel ?? socket?.papel ?? 'broadcast',
      };
      cliente.receber = (texto) => {
        try {
          processarMensagem(cliente, texto);
        } catch (erro) {
          // Seção 7: a live não para por causa de um erro. Qualquer coisa
          // pode chegar neste socket, e o processo que fica de pé a noite
          // inteira não pode cair por causa disso.
          console.error(`[hub] mensagem recusada: ${erro.message}`);
        }
      };
      cliente.fechar = () => clientes.delete(cliente);
      clientes.add(cliente);
      return cliente;
    },

    /** O relógio da rodada, chamado de segundo em segundo pelo servidor. */
    tick() {
      if (terminaEm == null) return;
      if (agora() >= terminaEm) { fecharRodada('tempo'); return; }
      enviarATodos('round.update', atualizacaoDeRodada());
    },

    quantosClientes: () => clientes.size,
    placar,
  };
}
