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

import { basename } from 'node:path';
import { mesclar, normalizar } from './config.js';
import { criarNarrador } from './narracao.js';
import { criarEspera } from './espera.js';

export function criarHub({
  tally,
  fonte,
  config,
  // O sintetizador de voz. Opcional de propósito: sem ele a faixa da tela
  // continua aparecendo, só muda, e é assim que a suíte roda sem subir um
  // PowerShell por fala.
  voz = null,
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

  /*
   * O narrador lê as frases de AGORA, e não as do dia em que nasceu.
   *
   * `cfg` é trocado inteiro a cada salvamento do painel, então passar
   * `cfg.narracao.falas` aqui dentro daria ao narrador uma lista congelada: o
   * Leonardo editaria uma frase com a live no ar, ouviria a antiga, e não
   * teria como saber por quê.
   */
  const narrador = criarNarrador({ falas: () => cfg.narracao?.falas, agora });

  /*
   * A espera do número no chat.
   *
   * O presente que não está no painel não conta sozinho, mas também não pode
   * sumir: quem pagou por ele merece que o voto aconteça. Ele abre uma janela,
   * o número que o espectador escrever decide a urna, e o silêncio é
   * respondido com uma cobrança falada.
   *
   * A janela é lida da CONFIGURAÇÃO a cada consulta, e não no dia em que o
   * hub nasceu: o Leonardo pode querer vinte segundos numa live calma, e ele
   * muda isso no painel com a rodada no ar.
   */
  const espera = criarEspera({
    janelaMs: () => Number(cfg.integracao?.esperaNumeroSegundos) * 1000,
    agora,
  });

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
      // O id vai junto pelo mesmo motivo que o número do voto vai no
      // `vote.animate`: quem recebe precisa saber de QUE rodada se trata. O
      // `round.update` sai a cada segundo de relógio andando e sai de novo,
      // com a mesma cara, quando o painel zera — a única diferença entre
      // "a rodada continua" e "começou outra" é este número, e é ele que faz
      // a tela esconder o resultado da rodada anterior.
      rodada: tally.estado().rodada,
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
    /*
     * Rodada fechada, esperas esquecidas.
     *
     * Um número que chegue depois daqui não conta — o placar já foi mostrado
     * como final. Manter a espera de pé só renderia uma cobrança falada por um
     * voto que não pode mais acontecer: a voz pedindo um número para uma urna
     * que já encerrou.
     */
    esquecerEsperas();
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
          // O nome viaja para a etiqueta da fila — é ele que aparece na tela
          // quando o presente não está no painel e o voto sai pelo chat.
          giftNome: msg.giftNome,
          userId: msg.userId ?? 'painel',
          userName: msg.userName ?? 'Painel',
          combo: msg.combo ?? 1,
        });
        break;

      case 'sim.social':
        /*
         * O botão de teste da narração.
         *
         * O campo se chama `social` porque `tipo` já é o nome da mensagem —
         * o mesmo motivo que fez o papel do cliente se chamar `papel` aqui
         * em cima.
         *
         * Nada de `giftId` atravessa: a porta daqui fala alto, e não conta
         * voto. Quem impede isso não é esta linha, é a normalização lá
         * embaixo — e é ela que continua valendo no dia em que alguém
         * mandar um `social: 'presente'`.
         */
        fonte.social?.({
          tipo: msg.social,
          userId: msg.userId ?? 'painel',
          userName: msg.userName ?? 'Painel',
          quantidade: msg.quantidade,
        });
        break;

      case 'sim.comment':
        // O chat do teste. O `userId` é o que importa: é ele que liga o
        // comentário ao presente de quem escreveu, e um comentário de outra
        // pessoa não pode resgatar nada.
        fonte.comentario?.({
          userId: msg.userId ?? 'painel',
          userName: msg.userName ?? 'Painel',
          texto: msg.texto ?? '',
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
          /*
           * A configuração mudou, e a fonte pode depender dela.
           *
           * Quem decide se isso significa trocar de fonte é a própria fonte —
           * o hub só avisa. Sem esta linha, escolher "TikTok ao vivo" no
           * painel gravaria a escolha e deixaria o simulador contando, que é
           * o defeito que o Leonardo só descobriria no ar.
           */
          fonte.aplicarConfig?.(cfg);
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
   * A fala de quem chegou.
   *
   * Duas decisões que valem o registro:
   *
   *   - **a faixa espera a voz.** O `sintetizar` é assíncrono, e o anúncio só
   *     sai depois dele. Anunciar primeiro e mandar o áudio depois faria a
   *     faixa aparecer meio segundo antes da voz — e as duas são o MESMO
   *     aviso, então separadas parecem dois;
   *   - **uma fala de cada vez.** Numa live movimentada chegam vários eventos
   *     no mesmo segundo, e cada `sintetizar` demora o que demora. Sem a
   *     fila, a segunda fala, que é rápida, chegaria antes da primeira: a
   *     live ouviria "bem-vindo, Bia" antes do "bem-vindo, Ana";
   *   - **a fila tem TETO.** Sem ele, uma live movimentada acumula mais fala
   *     do que a voz consegue dizer, e o sintoma no ar é a voz ficando para
   *     trás: ela anuncia quem chegou há dois minutos, falando do passado
   *     enquanto a live já é outra. Cheia, a fila recusa — e recusar é barato
   *     justamente aqui, porque a fala é a parte que envelhece: o nome de quem
   *     acabou de chegar não volta, mas o de quem chegar depois é anunciado
   *     igual. O voto NÃO passa por esta fila, então nenhuma recusa custa
   *     contagem.
   */
  const FILA_DA_FALA_MAX = 6;
  let filaDaFala = Promise.resolve();
  let naFila = 0;

  /**
   * @param {object} evento
   * @param {object} [opcoes]
   * @param {boolean} [opcoes.essencial] `true` para a fala que NÃO pode ser
   *   recusada pela fila cheia. É a cobrança do número, e só ela: as outras
   *   falas são avisos, e a cobrança é a única que desfaz um prejuízo.
   */
  function narrar(evento, { essencial = false } = {}) {
    if (cfg.narracao?.ativa === false) return;
    /*
     * A recusa vem ANTES do narrador, e não depois.
     *
     * O `narrador.narrar` não só escolhe a frase: ele marca o cooldown da
     * pessoa e acumula a rajada de curtidas. Consultá-lo para depois jogar a
     * fala fora gastaria o silêncio de quem foi recusado — a pessoa ficaria um
     * minuto muda por causa de uma fala que ninguém ouviu, e numa live cheia
     * ela nunca mais seria anunciada.
     *
     * A exceção é a cobrança, e a assimetria tem motivo: uma boas-vindas
     * recusada não custa nada — quem chegar depois é anunciado igual —, mas a
     * cobrança já foi CONSUMIDA da espera antes de virar fala. Recusá-la não é
     * adiá-la, é perdê-la, e o que se perde com ela é a única explicação que
     * quem mandou um presente órfão tem para ouvir.
     */
    if (!essencial && naFila >= FILA_DA_FALA_MAX) return;
    const texto = narrador.narrar(evento);
    // `null` é a resposta para quem não merece fala — a curtida solta, o
    // repetido, o apelido em cooldown. Silêncio é decisão, e não erro.
    if (!texto) return;
    naFila += 1;
    filaDaFala = filaDaFala
      .then(() => anunciarNaTela(evento, texto))
      // Um erro aqui não pode envenenar a fila pelo resto da noite: a
      // promessa rejeitada faria toda fala seguinte cair no mesmo buraco.
      .catch(() => {})
      // A vaga só volta quando a fala TERMINA — é o tempo da voz que a fila
      // mede. Soltar antes faria o teto contar falas que ainda nem começaram.
      .then(() => { naFila -= 1; });
  }

  /**
   * O retrato da espera, para o painel.
   *
   * O painel mostra quem está esperando e há quanto tempo — é o que permite ao
   * operador entender, no meio da live, por que um presente caro não virou
   * voto: alguém mandou e não escreveu o número.
   */
  function avisarEspera() {
    enviarAosAdmins('espera.updated', {
      pendentes: espera.pendentes,
      janelaMs: espera.janelaMs,
      esperas: espera.lista().map((e) => ({ ...e, esperandoHa: Math.max(0, agora() - e.desde) })),
    });
  }

  /**
   * A cobrança falada de quem mandou presente e não escreveu o número.
   *
   * Uma por espera vencida, e uma só: o `vencidas` já as consome, e é isso que
   * impede a voz de repetir a cobrança a cada segundo até alguém reiniciar o
   * servidor.
   */
  function cobrarEsperas() {
    const vencidas = espera.vencidas();
    if (vencidas.length === 0) return;
    for (const vencida of vencidas) {
      narrar({
        tipo: 'espera',
        userId: vencida.userId,
        usuario: vencida.usuario,
        quantidade: vencida.combo,
        em: agora(),
      }, { essencial: true });
    }
    avisarEspera();
  }

  /** Esquece as esperas em aberto. É o que a virada de rodada faz. */
  function esquecerEsperas() {
    if (espera.pendentes === 0) return;
    espera.limpar();
    avisarEspera();
  }

  async function anunciarNaTela(evento, texto) {
    let wav = null;
    try {
      const pronta = await voz?.sintetizar(texto);
      // A URL, e não o caminho do arquivo: o navegador monta o pedido a
      // partir da origem, e uma barra invertida do Windows não é caminho
      // válido em URL.
      if (pronta?.arquivo) wav = `/voz/${basename(pronta.arquivo)}`;
    } catch (erro) {
      /*
       * A faixa vai sem áudio. O sintetizador é um processo externo — ele cai,
       * ele trava, ele demora —, e a seção 7 é explícita em que a live não
       * para por causa de um erro. Perder a fala é um detalhe; perder o nome
       * de quem chegou é a página parecer morta.
       */
      console.error(`[hub] a voz falhou em "${texto}": ${erro.message}`);
    }
    enviarATodos('narrate', {
      texto,
      wav,
      tipo: evento.tipo,
      usuario: evento.usuario,
      em: evento.em,
      ts: agora(),
    });
  }

  /*
   * A fonte fala, o motor conta, o hub conta para as páginas. Este é o
   * caminho inteiro de um presente que chega da live, e é o único lugar
   * onde ele existe.
   */
  fonte.aoEvento((evento) => {
    /*
     * O comentário não é evento: é RESPOSTA.
     *
     * Ele não conta voto sozinho, não merece fala e não aparece em lugar
     * nenhum da tela. O que ele pode fazer é resgatar o presente órfão de
     * quem o escreveu — e quem garante que é do autor certo é a espera, que é
     * indexada por pessoa.
     */
    if (evento.tipo === 'comentario') {
      const resgate = espera.resgatar({ userId: evento.userId, texto: evento.texto, urnas: urnasAtivas() });
      if (!resgate) return;   // a imensa maioria dos comentários morre aqui
      const r = tally.contarPeloNumero(
        { ...evento, giftId: resgate.giftId, giftNome: resgate.presente, combo: resgate.combo },
        { numero: resgate.numero },
      );
      if (r.contado) {
        /*
         * O `giftNome` e o `combo` viajam JUNTO com o resgate, e não são
         * detalhe: o evento daqui é um COMENTÁRIO, e comentário não tem
         * presente nem combo nenhum. Sem eles a fala do voto resgatado sairia
         * sem o nome do presente e sem o "5x" — a mesma frase de quem mandou
         * um presente só, e um voto de segunda classe em relação ao mapeado.
         */
        anunciarVoto(r, {
          ...evento,
          usuario: resgate.usuario,
          giftId: resgate.giftId,
          giftNome: resgate.presente,
          combo: resgate.combo,
        });
        avisarEspera();
      }
      return;
    }

    const r = tally.processar(evento);
    if (!r.contado) {
      /*
       * O presente que não está mapeado abre uma espera pelo número.
       *
       * Só o `sem-mapeamento` abre. Um presente DESLIGADO no arquivo, ou
       * apontando para uma urna apagada, é uma decisão de quem configura —
       * abrir uma janela para ele seria desfazer, pelo chat, o que ele
       * acabou de decidir no `local.json`.
       *
       * (Era "no painel" até 2026-10-15: a aba de Presentes saiu, e o
       * mapeamento passou a ser só do arquivo. A regra não mudou.)
       */
      if (r.motivo === 'sem-mapeamento') {
        espera.abrir({
          userId: evento.userId,
          usuario: evento.usuario,
          giftId: evento.giftId,
          presente: evento.giftNome || 'Presente',
          combo: evento.combo,
          em: evento.em,
        });
        avisarEspera();
      }
      /*
       * Não contou voto: ou é um evento social — chegada, follow, curtida —,
       * ou é um presente sem urna no mapeamento. Quem separa os dois é o
       * narrador, que só conhece os tipos sociais: um presente órfão não tem
       * frase nenhuma e sai daqui em silêncio. Quem fala por ele é a espera,
       * quinze segundos depois, quando o número não vem.
       */
      narrar(evento);
      return;
    }

    anunciarVoto(r, evento);
  });

  /** As urnas que um número escrito no chat pode escolher. */
  function urnasAtivas() {
    return Object.values(cfg.urnas ?? {}).filter((u) => u?.ativo !== false);
  }

  /**
   * O voto aconteceu: conta para todos, pede a animação e sobe o placar.
   *
   * Ele existe como função por causa do segundo caminho até o voto — o
   * presente órfão resgatado no chat. Os dois têm que terminar no MESMO
   * anúncio; um voto que subisse por um caminho e não pelo outro seria um
   * voto que o placar não vê, e o defeito só apareceria na live.
   */
  function anunciarVoto(r, evento) {
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
      // O nome do presente viaja junto pelo mesmo motivo que o número: a
      // etiqueta da fila escreve ele, e uma edição no painel entre o voto e
      // a animação renomearia um voto que já aconteceu.
      presente: r.presente,
      giftId: String(evento.giftId),
      usuario: r.usuario,
      votos: r.votos,
      prioridade: presente?.prioridade ?? 0,
    });

    // O placar DEPOIS do pedido de animação, e não antes.
    //
    // Não é atraso: as duas mensagens saem no mesmo tick, e o número nunca
    // espera a mão. É ordem de leitura. O placar da tela é de propósito mais
    // lento que este — ele só sobe quando a cédula cai —, e a auto-correção
    // dele assume que "fila vazia" quer dizer "nada em voo". Com o placar
    // primeiro, existia a janela em que a página já sabia a contagem nova sem
    // saber ainda que havia um voto a caminho, e o número subia um quadro
    // antes de a mão aparecer. Custou uma medição no navegador para aparecer.
    enviarATodos('tally.update', placar());

    /*
     * A fala do presente, e ela vem DEPOIS do placar.
     *
     * O presente é o único evento que conta voto, e era o único que não era
     * falado: a tela animava a mão digitando e a voz ficava quieta — no evento
     * que a pessoa pagou para acontecer. A ordem não é detalhe: o que a tela
     * mostra primeiro é o voto acontecendo, e a voz confirma o que já está lá.
     *
     * Os campos que a frase usa não estão no evento cru, e é aqui que eles
     * nascem: `presente` é o nome que o MOTOR contou — o do mapeamento quando
     * existe, o que veio da TikTok quando o voto foi resgatado no chat —, e
     * `urna` é o nome de quem recebeu, que o evento não traz em lugar nenhum.
     * O `combo` é o do evento, e sem ele quem manda cinco presentes ouve a
     * mesma frase de quem mandou um.
     */
    narrar({
      ...evento,
      tipo: 'presente',
      presente: r.presente,
      urna: cfg.urnas?.[r.urnaId]?.nome,
      combo: evento.combo,
    });

    if (r.lideranca) {
      enviarATodos('lead.changed', {
        urnaId: r.lideranca.urnaId,
        anteriorId: r.lideranca.anterior,
        empate: r.lideranca.tipo === 'empate',
      });
    }
  }

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
      /*
       * A espera é conferida ANTES da saída rápida de propósito.
       *
       * A rodada sem prazo (`terminaEm == null`) sai daqui na linha seguinte,
       * e uma rodada assim é justamente uma em que o presente órfão continua
       * chegando — a cobrança falada ficaria muda na única situação em que ela
       * é a única coisa acontecendo.
       */
      cobrarEsperas();
      if (terminaEm == null) return;
      if (agora() >= terminaEm) { fecharRodada('tempo'); return; }
      enviarATodos('round.update', atualizacaoDeRodada());
    },

    quantosClientes: () => clientes.size,
    placar,
  };
}
