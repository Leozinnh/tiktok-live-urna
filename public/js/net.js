/**
 * O canal da página com o servidor.
 *
 * Uma fonte de navegador do OBS fica aberta a noite inteira. Nesse tempo o
 * servidor vai ser reiniciado — quando o Leonardo mexer numa configuração,
 * quando o Windows reiniciar sozinho para atualizar. Uma página que abre um
 * WebSocket e morre junto com ele fica preta até alguém recarregar na mão, e
 * quem percebe é um espectador no chat, não o Leonardo.
 *
 * Por isso a reconexão é a razão de existir deste arquivo, e não um extra.
 *
 * A política é curta de propósito: espera que dobra de 500ms até 8 segundos,
 * para sempre, e um `hello` a cada conexão que dá certo. Sem jitter — o
 * tremor que se põe no backoff serve para espalhar mil clientes que caíram
 * juntos, e aqui é uma página só, no computador do Leonardo.
 */

/** A espera antes da enésima tentativa: 500, 1000, 2000, 4000, 8000, 8000… */
export function calcularEspera(tentativa, { base = 500, teto = 8000 } = {}) {
  const n = Math.max(0, Math.floor(Number(tentativa) || 0));
  return Math.min(teto, base * 2 ** n);
}

/**
 * O endereço do socket a partir do endereço da página.
 *
 * `http` vira `ws` e `https` vira `wss` — uma página em https não pode abrir
 * um `ws://`, o navegador bloqueia o conteúdo misto e a conexão morre sem
 * erro visível.
 */
export function urlDoSocket(origem, papel = 'broadcast') {
  const base = String(origem).replace(/\/+$/, '').replace(/^http/, 'ws');
  return `${base}/ws?papel=${encodeURIComponent(papel)}`;
}

/**
 * Abre o canal e o mantém aberto.
 *
 *   `abrir()`   — começa. Chamar duas vezes não abre dois canais.
 *   `fechar()`  — encerra de propósito, e não reconecta.
 *   `enviar(m)`  — manda uma mensagem, se houver canal.
 *   `estado()`  — `{ conectado, tentativas }`.
 *
 * `aoMensagem` recebe `{ tipo, payload }` já decodificado; `aoStatus` recebe
 * `{ conectado, tentativas }` a cada mudança. Nenhum dos dois pode derrubar
 * o canal: um ouvinte que explode é um ouvinte que explode, e não uma queda
 * de rede.
 */
export function criarRede({
  url,
  papel = 'broadcast',
  criarSocket = (endereco) => new WebSocket(endereco),
  aoMensagem = () => {},
  aoStatus = () => {},
  base = 500,
  teto = 8000,
} = {}) {
  const endereco = url ?? urlDoSocket(globalThis.location?.origin ?? 'http://localhost:3000', papel);
  let socket = null;
  let tentativas = 0;
  let relogio = null;
  let encerrado = false;
  let conectado = false;

  function avisar() {
    try {
      aoStatus({ conectado, tentativas });
    } catch (erro) {
      console.error(`[rede] ouvinte de status falhou: ${erro.message}`);
    }
  }

  function entregar(texto) {
    let mensagem;
    try {
      mensagem = JSON.parse(texto);
    } catch {
      // Um quadro cortado no meio do caminho não é motivo para derrubar a
      // transmissão. Seção 7: a live não para por causa de um erro.
      return;
    }
    if (!mensagem || typeof mensagem !== 'object') return;
    try {
      aoMensagem(mensagem);
    } catch (erro) {
      console.error(`[rede] ouvinte de mensagem falhou: ${erro.message}`);
    }
  }

  function enviar(mensagem) {
    if (!socket || socket.readyState !== 1) return false;
    try {
      socket.send(JSON.stringify(mensagem));
      return true;
    } catch (erro) {
      console.error(`[rede] não consegui enviar: ${erro.message}`);
      return false;
    }
  }

  function agendar() {
    if (encerrado) return;
    const espera = calcularEspera(tentativas, { base, teto });
    tentativas += 1;
    relogio = setTimeout(() => {
      relogio = null;
      abrirAgora();
    }, espera);
  }

  function abrirAgora() {
    if (encerrado) return;
    let novo;
    try {
      novo = criarSocket(endereco);
    } catch (erro) {
      console.error(`[rede] não consegui abrir o canal: ${erro.message}`);
      agendar();
      return;
    }
    socket = novo;

    novo.onopen = () => {
      if (socket !== novo) return;
      conectado = true;
      tentativas = 0;
      avisar();
      // O retrato inteiro, a cada conexão. Uma página que volta no meio da
      // rodada não recebe o histórico por push: ela pergunta. Sem isto o
      // placar voltaria do zero e a live mostraria a contagem errada.
      enviar({ tipo: 'hello', papel });
    };

    novo.onmessage = (evento) => {
      if (socket !== novo) return;
      entregar(evento?.data);
    };

    novo.onclose = () => {
      if (socket !== novo) return;
      socket = null;
      conectado = false;
      avisar();
      agendar();
    };

    // `onerror` sempre vem seguido de `onclose`; só o registro basta.
    novo.onerror = () => {};
  }

  return {
    abrir() {
      if (socket || relogio || encerrado) return;
      abrirAgora();
    },

    fechar() {
      encerrado = true;
      if (relogio) {
        clearTimeout(relogio);
        relogio = null;
      }
      const atual = socket;
      socket = null;
      conectado = false;
      // O `onclose` que vier daqui encontra `socket !== atual` e não agenda
      // nada: fechar é decisão do dono, não uma queda.
      try {
        atual?.close();
      } catch { /* já estava morto */ }
    },

    enviar,
    estado: () => ({ conectado, tentativas }),
  };
}
