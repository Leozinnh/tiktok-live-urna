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
import { criarNarrador, LIMIAR_DA_CURTIDA } from './narracao.js';
import { criarEspera } from './espera.js';
import { acharUrna, chaveDoComentario, criarChatVoto } from './chat-voto.js';
import { criarLog } from './log.js';

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
  // O log da live. Injetado pelo mesmo motivo da voz: a suíte escreveria no
  // terminal de quem roda `npm test` e no arquivo do dia de quem está no ar.
  // O de verdade chega do `index.js`, com a pasta `data/logs`.
  log = criarLog(),
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

  /*
   * Como o log chama um cliente.
   *
   * "Painel" e "tela" são os dois papéis que existem, e são os nomes que o
   * Leonardo usa. O número do cliente fica junto porque a pergunta que se faz
   * no meio da live é "quantas telas estão abertas?" — e uma reconexão do OBS
   * aparece aqui como dois clientes, um que saiu e outro que entrou.
   */
  const apelido = (c) => `${c.papel === 'admin' ? 'painel' : 'tela'} #${c.id}`;

  /** Quantos clientes abertos agora, no singular quando é um só. */
  const quantosConectados = () =>
    `${clientes.size} ${clientes.size === 1 ? 'conectado' : 'conectados'}`;

  /* ------------------------------------------------------------- o log */

  /*
   * O log conta a MESMA história que o painel, e por isso ele existe.
   *
   * O Leonardo mandou uma Rosa pelo botão de teste com a rodada fechada, não
   * ouviu voz nenhuma e não teve onde ler o motivo: o servidor sabia de tudo
   * (a rodada estava fechada) e não contava para ninguém. O painel só fala
   * enquanto a aba está aberta e só guarda cinquenta linhas; o log fica.
   *
   * A regra que estes textos seguem: toda decisão de NÃO fazer algo sai
   * escrita com o motivo. Um log que só registra o que funcionou não serve
   * para procurar defeito — o defeito é justamente o que não aconteceu.
   */
  const EMOJI_DO_EVENTO = Object.freeze({
    entrada: '👋',
    seguidor: '👤',
    curtida: '❤️',
    compartilhou: '🔁',
    assinatura: '💎',
    presente: '🎁',
    espera: '⏳',
  });

  /*
   * O "3x " do combo, escrito igual ao da fala.
   *
   * É a mesma decisão do narrador, repetida aqui de propósito: o presente
   * único sai "mandou Rosa", e não "mandou 1x Rosa", que não é como uma
   * pessoa fala — e o log existe para ser lido por gente.
   */
  const vezesDe = (combo) => (Number(combo) > 1 ? `${Number(combo)}x ` : '');

  /** O nome de quem fez o evento, com um lugar-comum para quando não veio. */
  const quemDe = (evento) => String(evento?.usuario ?? '').trim() || 'Alguém';

  /** A frase de um evento que chegou da live, para o log. */
  function descreverEvento(evento) {
    const quem = quemDe(evento);
    const emoji = EMOJI_DO_EVENTO[evento?.tipo] ?? '•';
    switch (evento?.tipo) {
      case 'entrada': return `${emoji} ${quem} entrou na live`;
      case 'seguidor': return `${emoji} ${quem} começou a seguir a live`;
      case 'curtida': return `${emoji} ${quem} mandou ${evento.quantidade ?? 0} curtidas`;
      case 'compartilhou': return `${emoji} ${quem} compartilhou a live`;
      case 'assinatura': return `${emoji} ${quem} virou assinante`;
      case 'presente': {
        const quantos = vezesDe(evento.combo);
        // Sem nome, o log não escreve o id — "mandou 3x presentes" é o que
        // uma pessoa lê; "mandou 3x 2" é o que ela vai ter que decifrar.
        const nome = String(evento.giftNome ?? '').trim() || (quantos ? 'presentes' : 'um presente');
        return `${emoji} ${quem} mandou ${quantos}${nome}`;
      }
      default: return `${emoji} ${quem}: ${evento?.tipo ?? 'evento sem tipo'}`;
    }
  }

  /*
   * Os motivos de recusa, ditos por extenso.
   *
   * O motor devolve códigos (`rodada-fechada`, `sem-mapeamento`) porque quem
   * os lê é o código. Quem lê o log é o Leonardo, no meio da live, atrás do
   * motivo de um presente não ter virado voto.
   */
  const MOTIVO_DA_RECUSA = Object.freeze({
    'rodada-fechada': 'Rodada fechada',
    'duplicado': 'Presente repetido',
    'sem-mapeamento': 'Presente fora do mapeamento',
    'presente-inativo': 'Presente desativado no painel',
    'sem-urna': 'Presente sem urna',
    'urna-inativa': 'Urna do presente desativada',
    'evento-invalido': 'Evento inválido',
    'numero-sem-urna': 'Número escrito no chat não é de urna nenhuma',
  });

  /*
   * O silêncio do narrador, explicado.
   *
   * O narrador cala por cooldown, por limiar de curtida, por lista de frases
   * vazia no painel — e todos esses silêncios eram o MESMO silêncio na tela
   * de quem está no ar. "Não falou nada" não é diagnóstico; "já foi
   * anunciado, faltam 47s" é.
   */
  function descreverSilencio({ motivo, evento, faltamMs, quantidade } = {}) {
    const quem = String(evento?.usuario ?? '').trim() || 'alguém';
    switch (motivo) {
      case 'cooldown':
        return `silêncio: ${quem} já foi anunciado; faltam ${Math.ceil((faltamMs ?? 0) / 1000)}s`;
      case 'abaixo-do-limiar':
        return `silêncio: ${quem} mandou ${quantidade ?? 0} curtidas, abaixo do limiar de ${LIMIAR_DA_CURTIDA}`;
      case 'presente-sem-nome':
        return `silêncio: o presente de ${quem} chegou sem o nome que a frase precisa`;
      case 'sem-frase':
        return `silêncio: não há frase de "${evento?.tipo}" na lista do painel`;
      default:
        return `silêncio: ${motivo ?? 'motivo não explicado'}`;
    }
  }

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
      log.aviso('hub', `o cliente ${cliente.id} caiu ao receber ${tipo}: ${erro.message}`);
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
  const narrador = criarNarrador({
    falas: () => cfg.narracao?.falas,
    agora,
    // Todo silêncio do narrador vira uma linha com o motivo. É a metade da
    // resposta que faltava: sem ela, "não falou nada" e "não tinha o que
    // falar" ficam idênticos de fora.
    aoSilenciar: (explicacao) => log.info('voz', `🤐 ${descreverSilencio(explicacao)}`),
  });

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

  /*
   * O voto escrito no chat, e o intervalo entre dois da mesma pessoa.
   *
   * Ele é o caminho de graça até o voto — quem não tem moeda escreve o nome ou
   * o número do candidato. O estado dele (quem votou quando) vive enquanto a
   * rodada viver, e é por isso que ele nasce aqui, ao lado da espera, e não
   * dentro do motor: o motor conta, quem lembra das pessoas é o hub.
   */
  const chatVoto = criarChatVoto({ agora });

  /**
   * O comentário que é um voto — ou nada.
   *
   * Devolve sem falar quando o texto não cita urna nenhuma, que é a imensa
   * maioria dos comentários de uma live. Quando cita, e é a primeira vez da
   * pessoa na janela, o voto entra pelo mesmo `anunciarVoto` do presente: a
   * mão digita, o placar sobe, o log escreve. A única diferença é o valor —
   * um voto, contra os cinco ou mais do presente.
   */
  function votarPeloChat(evento) {
    const alvo = acharUrna(evento.texto, urnasAtivas());
    if (!alvo) return;

    if (!chatVoto.reservar(evento.userId)) {
      /*
       * O segundo "22" de quem já votou agora há pouco. Ele não conta e não
       * merece fala — mas merece linha, porque é por ela que se descobre, numa
       * live cheia, que o intervalo está curto demais.
       */
      log.info('hub', `⏱ ${quemDe(evento)} escreveu "${evento.texto}" de novo; `
        + `o voto do chat tem intervalo de ${Math.round(chatVoto.intervaloMs / 1000)}s`);
      return;
    }

    const r = tally.contarPeloChat(evento, {
      urnaId: alvo.urnaId,
      chave: chaveDoComentario(evento),
    });
    if (r.contado) {
      anunciarVoto(r, evento);
      return;
    }
    /*
     * A recusa do voto escrito, escrita por extenso.
     *
     * É a mesma promessa da linha do presente recusado: quem escreveu "22" e
     * viu o placar parado precisa de uma resposta. A rodada fechada é o caso
     * que mais acontece — e é justamente o que o operador precisa saber.
     */
    const motivo = MOTIVO_DA_RECUSA[r.motivo] ?? r.motivo;
    log.info('hub', `⛔ ${motivo}: o voto de ${quemDe(evento)} escrito no chat não contou`);
  }

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
    /*
     * A rodada que fecha fica registrada, e com o motivo.
     *
     * Sem esta linha, uma fala que não saiu às 21h não tem como ser amarrada
     * ao momento em que a votação virou: o presente chegou "do nada" numa
     * rodada que tinha acabado de encerrar sozinha, cinquenta minutos depois
     * de alguém ter apertado "começar".
     */
    log.info('hub', `⏰ rodada encerrada (${motivo})`);
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

    /*
     * A fala que a TELA não conseguiu dizer.
     *
     * Vem antes da porteira de admin, e isso é o ponto: quem perde fala é a
     * página do ar, que não é admin e nunca vai ser. É um aviso de quem está
     * com o alto-falante, e não um comando — a tela não pede nada, ela conta o
     * que aconteceu.
     *
     * Existe porque o defeito mais caro desta noite foi mudo por fora: o
     * `play()` recusado pelo navegador era engolido num `catch`, a fala não
     * saía, a faixa piscava e o log não escrevia nada. Quem olhasse o console
     * diria que estava tudo dito. O Leonardo julga o sistema pelo console, e
     * por isso a recusa tem que chegar até ele.
     */
    if (msg.tipo === 'narracao.perdida') {
      // Esta mensagem chega de um socket que qualquer um alcança, e o texto
      // dela vai direto para o arquivo de log. Cortado e numa linha só: um
      // aviso de fora não enche o log da live.
      const texto = String(msg.texto ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
      const motivo = String(msg.motivo ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
      if (texto) log.aviso('voz', `⚠ a tela perdeu "${texto}": ${motivo || 'sem motivo'}`);
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
        log.info('hub', `▶️ rodada aberta (${Math.round(cfg.rodada.duracaoSegundos / 60)} min)`);
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
        // Sem relógio: a rodada zerada espera o "começar" de quem opera. É o
        // que faz o placar ficar em zero na tela até a hora certa.
        log.info('hub', '🧹 rodada zerada pelo painel (sem relógio correndo)');
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
  let narracaoEstavaAtiva = cfg.narracao?.ativa !== false;

  /**
   * @param {object} evento
   * @param {object} [opcoes]
   * @param {boolean} [opcoes.essencial] `true` para a fala que NÃO pode ser
   *   recusada pela fila cheia. É a cobrança do número, e só ela: as outras
   *   falas são avisos, e a cobrança é a única que desfaz um prejuízo.
   */
  function narrar(evento, { essencial = false } = {}) {
    /*
     * A narração desligada no painel é o primeiro suspeito de uma live muda,
     * e é o único que não aparece em lugar nenhum: a tela continua animando o
     * voto, o placar continua subindo, e só a voz some. A linha sai na
     * VIRADA, e não a cada evento — com a narração desligada a live inteira
     * passaria o dia escrevendo a mesma frase no arquivo.
     */
    const ativa = cfg.narracao?.ativa !== false;
    if (ativa !== narracaoEstavaAtiva) {
      narracaoEstavaAtiva = ativa;
      log.info('voz', ativa
        ? '🗣 narração ligada no painel'
        : '🤐 narração DESLIGADA no painel: nada vai ser falado');
    }
    if (!ativa) return;
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
    if (!essencial && naFila >= FILA_DA_FALA_MAX) {
      log.aviso('voz', `fila cheia (${naFila} falas esperando); ${quemDe(evento)} ficou sem voz`);
      return;
    }
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

  /**
   * Esquece as esperas em aberto. É o que a virada de rodada faz.
   *
   * O intervalo do voto escrito cai junto, e ANTES do atalho das esperas: uma
   * rodada pode virar sem nenhuma espera pendente — e quem votou pelo chat no
   * último segundo da anterior tem que poder votar na nova na hora. Deixar o
   * `return` na frente faria o relógio do chat atravessar a virada, que é
   * exatamente o voto que a virada deveria liberar.
   */
  function esquecerEsperas() {
    chatVoto.limpar();
    if (espera.pendentes === 0) return;
    espera.limpar();
    avisarEspera();
  }

  async function anunciarNaTela(evento, texto) {
    /*
     * A linha da voz, antes de virar som — igual à do turfe.
     *
     * É o que a live está dizendo AGORA. Lida de trás para frente, ela diz o
     * que já foi ao ar mesmo que o áudio tenha falhado depois.
     */
    log.info('voz', `🗣 "${texto}"`);
    if (clientes.size === 0) {
      /*
       * Ninguém para ouvir.
       *
       * Sem tela conectada, a fala é gerada, o áudio é gerado, e nada disso
       * chega a lugar nenhum: para quem está na frente do computador
       * ouvindo, é idêntico a um servidor mudo. O sintoma que o Leonardo
       * descreveu — "não falou nada" — tem esta cara quando o OBS está com a
       * fonte fechada.
       */
      log.aviso('voz', `nenhuma tela conectada: ninguém vai ouvir "${texto}"`);
    }
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
      log.erro('voz', `a voz falhou em "${texto}": ${erro.message} — a faixa saiu sem áudio`);
    }
    enviarATodos('narrate', {
      texto,
      wav,
      tipo: evento.tipo,
      usuario: evento.usuario,
      /*
       * O presente que chegou, num objeto só.
       *
       * A faixa quer o desenho, o pop-up quer o nome, quem mandou e para qual
       * urna foi — e os dois mostram o MESMO presente. Espalhar isso em campos
       * soltos daria dois lugares afirmando a mesma coisa, e no dia em que
       * discordassem a faixa e o pop-up mostrariam presentes diferentes no
       * mesmo instante da live. Só o presente tem um: chegada, follow e
       * curtida chegam aqui sem ele.
       */
      presente: evento.tipo === 'presente'
        ? {
          nome: evento.presente,
          desenho: evento.desenho,
          // O apelido quando existe: "vai pra Lulinha" é o que a live fala, e
          // o pop-up tem que dizer o mesmo que a voz.
          urna: evento.apelido ?? evento.urna,
          // A cor da urna do voto, para o pop-up inteiro sair na cor de quem
          // recebeu — a mesma rosa é vermelha na 13 e azul no 22.
          cor: evento.cor,
        }
        : null,
      em: evento.em,
      /*
       * `em` e `ts` contados os dois pelo relógio do SERVIDOR, e é isso que
       * deixa a página medir o atraso sem sincronizar relógio nenhum: o que
       * ela usa é a diferença entre os dois, que é o tempo que a fala passou
       * na fila daqui — síntese incluída. Sem isso, uma fala que esperou dois
       * segundos para ser sintetizada chegava à página parecendo nova, e a
       * fila de lá contava o atraso a partir do zero.
       */
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
      /*
       * Comentário NÃO vira linha no log.
       *
       * É o evento mais frequente da live — centenas por hora —, e a imensa
       * maioria não faz nada: não conta voto, não merece fala. O que merece
       * registro é o comentário que RESGATA um presente, e esse aparece logo
       * abaixo, na linha do voto.
       */
      const resgate = espera.resgatar({ userId: evento.userId, texto: evento.texto, urnas: urnasAtivas() });
      if (!resgate) {
        /*
         * Não é resgate. Então o comentário tenta ser um VOTO.
         *
         * É o caminho de graça, e ele vem DEPOIS do resgate de propósito: quem
         * mandou um presente órfão e escreveu "22" está escolhendo a urna
         * daquele presente, e não pedindo mais um voto. Invertendo a ordem, o
         * mesmo "22" contaria o presente resgatado (cinco votos ou mais) E um
         * voto de chat, e o espectador ganharia um voto por ter sido claro.
         */
        votarPeloChat(evento);
        return;
      }
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

    log.info('live', descreverEvento(evento));

    /*
     * O evento social não passa pelo motor.
     *
     * Chegada, follow, curtida e companhia não têm `giftId`, e o motor recusa
     * todos eles — corretamente — com um aviso no painel POR EVENTO. Numa
     * live com trezentos follows, esses avisos empurram para fora da lista os
     * que importam (ela guarda cinquenta linhas), e o painel vira ruído
     * exatamente na hora em que o Leonardo olha para ele atrás de uma
     * resposta. Um presente que perdeu o `giftId` no caminho continua
     * passando por baixo e continua avisando.
     */
    const r = evento.giftId == null || evento.giftId === ''
      ? { contado: false, motivo: 'evento-invalido', animar: false, lideranca: null }
      : tally.processar(evento);
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
        log.info('hub', `⏳ ${quemDe(evento)} mandou ${evento.giftNome || 'um presente'} fora do `
          + 'mapeamento; esperando o número da urna no chat');
        avisarEspera();
      } else if (evento.giftId != null && evento.giftId !== '') {
        /*
         * A recusa de um presente, escrita por extenso.
         *
         * É a linha que responde a pergunta que abriu esta entrega: o presente
         * chegou, o motor recusou, e — até aqui — nada no mundo dizia por quê.
         * Evento social não entra aqui: ele não tem giftId, e "recusado" não é
         * o que aconteceu com um follow.
         */
        const motivo = MOTIVO_DA_RECUSA[r.motivo] ?? r.motivo;
        log.info('hub', `⛔ ${motivo}: o presente ${evento.giftNome || evento.giftId} `
          + `de ${quemDe(evento)} não contou`);
      }
      /*
       * Não contou voto: ou é um evento social — chegada, follow, curtida —,
       * ou é um presente que o motor recusou.
       *
       * Só o social vai para o narrador. A fala de um PRESENTE sai em
       * `anunciarVoto`, com o nome que o motor contou (`r.presente`), e um
       * presente que não contou não tem esse nome: pedir a fala aqui devolvia
       * "silêncio: o presente chegou sem nome" para uma Rosa que tem nome, e
       * essa linha mandava procurar defeito no lugar errado. Quem fala pelo
       * presente órfão é a espera, quando o número não vem.
       */
      if (evento.giftId == null || evento.giftId === '') narrar(evento);
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
    /*
     * O voto no log: quem mandou, o quê, quantos votos e para qual urna.
     *
     * É a linha de conferência da live. O placar diz QUANTO está cada urna; a
     * conta de quem mandou o quê é esta, e é por ela que se descobre o
     * presente que não entrou.
     */
    const urna = cfg.urnas?.[r.urnaId]?.nome ?? r.urnaId;
    /*
     * Duas linhas, e não uma com um campo a mais.
     *
     * Quem votou pelo chat não MANDOU nada, e "mandou Voto no chat para a
     * Lula" é uma frase que faz procurar defeito no lugar errado. A linha do
     * chat diz o que aconteceu — o texto escrito —, e é ela que responde
     * "por que esta urna subiu?" numa live em que ninguém mandou presente.
     */
    log.info('hub', r.origem === 'chat'
      ? `✅ ${r.usuario || 'alguém'} votou no chat: ${r.numero} · ${urna} `
        + `(+${r.votos} ${r.votos === 1 ? 'voto' : 'votos'})`
      : `✅ ${r.usuario || 'alguém'} mandou ${vezesDe(evento.combo)}${r.presente} `
        + `para a ${urna} (+${r.votos} ${r.votos === 1 ? 'voto' : 'votos'})`);

    enviarATodos('vote.counted', {
      id: r.chave,
      urnaId: r.urnaId,
      userId: evento.userId,
      usuario: r.usuario,
      presente: r.presente,
      origem: r.origem,
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
      /*
       * De onde o voto veio. A etiqueta da mão mostra o desenho do presente, e
       * o voto escrito no chat não tem desenho nenhum: sem este campo ela
       * procuraria a figura de um presente chamado "Voto no chat" e sairia sem
       * figura — ou, pior, com a figura de outro presente que tivesse o mesmo
       * nome.
       */
      origem: r.origem,
      giftId: String(evento.giftId ?? ''),
      /*
       * O desenho do presente, para a etiqueta da mão mostrar a figura do que
       * chegou.
       *
       * Ele sai daqui pela mesma razão que a figura da faixa dourada sai: o
       * nome que a TikTok manda ("Rosa") não é nome de arquivo nenhum, e
       * adivinhar a figura a partir dele daria uma rosa sem rosa no dia em que
       * o nome não batesse. Quem sabe o mapeamento é o servidor.
       */
      desenho: presente?.desenho ?? '',
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
     * existe, o que veio da TikTok quando o voto foi resgatado no chat —,
     * `urna` é o nome de quem recebeu, que o evento não traz em lugar nenhum,
     * e `apelido` é como o narrador chama esse candidato ("Lulinha ganhou um
     * voto"): os três saem da MESMA consulta à urna, e é por isso que eles
     * nascem juntos — o voto e o nome de quem ganhou não podem discordar.
     * O `combo` é o do evento, e sem ele quem manda cinco presentes ouve a
     * mesma frase de quem mandou um.
     *
     * O voto ESCRITO no chat não fala, e é a diferença que sustenta a de
     * valor: quem paga pelo presente tem a voz dizendo o nome dele, e quem
     * escreve um número no chat tem o voto contado e a mão digitando na tela.
     * Além disso a fala é o gargalo de tudo — são segundos por frase, e o
     * chat de uma live movimentada engoliria a fila da voz inteira em um
     * minuto, deixando o presente pago esperando atrás de cem "22".
     */
    if (r.origem !== 'chat') {
      narrar({
        ...evento,
        tipo: 'presente',
        presente: r.presente,
        urna: cfg.urnas?.[r.urnaId]?.nome,
        apelido: cfg.urnas?.[r.urnaId]?.apelido,
        /*
         * O desenho do presente, para a faixa mostrar a figura do que chegou.
         *
         * Ele sai do MAPEAMENTO (o presente da configuração), e não do evento:
         * o nome que a TikTok manda para o presente ("Rosa") não é o nome de
         * arquivo nenhum em `public/img/`, e adivinhar a figura a partir dele
         * daria uma rosa sem rosa no dia em que o nome não batesse. Sem
         * mapeamento não há desenho — e a faixa sai dourada, sem figura.
         */
        desenho: presente?.desenho,
        /*
         * A cor da urna que recebeu o voto, para o pop-up pintar com ela.
         *
         * Ela sai da MESMA consulta que o nome e o apelido acima, e é por isso
         * que nasce aqui: a mesma rosa é vermelha na 13 e azul no 22, então a
         * cor não é do presente — é de quem recebeu o voto. É a `corPrimaria`
         * da configuração, a mesma que já pinta o painel da urna na cena, e não
         * uma cor que o pop-up escolheria sozinho.
         */
        cor: cfg.urnas?.[r.urnaId]?.corPrimaria,
        combo: evento.combo,
      });
    }

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
      cliente.fechar = () => {
        if (!clientes.delete(cliente)) return;  // já tinha caído
        log.info('hub', `🔌 ${apelido(cliente)} saiu (${quantosConectados()})`);
      };
      clientes.add(cliente);
      log.info('hub', `🔌 ${apelido(cliente)} conectado (${quantosConectados()})`);
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
