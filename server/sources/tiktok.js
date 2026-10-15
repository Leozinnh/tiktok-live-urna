/**
 * A fonte da TikTok — Etapa 7.
 *
 * A live real não fala o protocolo daqui. Quem fala com ela é a biblioteca
 * `TikTokLive`, que só existe em Python — e é por isso que este projeto, que
 * não tem nenhuma dependência de Node, tem uma ponte em Python ao lado.
 *
 * A divisão é esta, e vale a pena ser explícita porque ela é uma decisão e
 * não um acidente:
 *
 *   - a PONTE (`ponte/tiktok.py`) sabe tudo o que é difícil e descartável:
 *     assinar o websocket, reconectar quando cai, ler os campos que mudam de
 *     nome entre versões da biblioteca, e traduzir tudo para uma linha de
 *     JSON por evento;
 *   - ESTE ARQUIVO sabe tudo o que é do sistema: o que é um evento, o que
 *     conta voto, e o que acontece quando a ponte morre às 3 da manhã.
 *
 * A fronteira entre os dois é uma linha de texto. É uma fronteira pobre de
 * propósito: um processo Python que enlouqueça não pode derrubar o motor nem
 * sujar o banco — na pior das hipóteses ele escreve lixo no cano, e o lixo
 * não é evento.
 *
 * O que este arquivo NÃO faz: decidir se um presente conta. Isso é
 * `normalizarEvento`, a mesma função que o simulador usa. Um atalho aqui —
 * "veio da TikTok, então é voto" — seria o defeito mais caro possível, porque
 * contaria para a urna errada sem deixar rastro.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { criarFonte, normalizarEvento } from './base.js';

/** Onde a ponte mora, relativa a este arquivo. */
const PONTE = fileURLToPath(new URL('../../ponte/tiktok.py', import.meta.url));

/**
 * Quanto esperar antes de levantar a ponte de novo, e até onde crescer.
 *
 * Começa em um segundo porque a queda mais comum é a live que ainda não
 * abriu, e nesse caso a resposta certa é tentar de novo logo. O teto de um
 * minuto existe para o caso oposto: o `@` errado, que nunca vai conectar, não
 * pode virar uma tentativa por segundo a noite inteira.
 */
const BACKOFF_INICIAL_MS = 1_000;
const BACKOFF_MAX_MS = 60_000;

const erro = (texto) => ({ erro: texto });

/**
 * A fonte da live de verdade.
 *
 * @param {object} [opcoes]
 * @param {string} [opcoes.usuario]  o @ da live, sem arroba
 * @param {Function} [opcoes.iniciarProcesso] como o Python é levantado
 * @param {Function} [opcoes.espera]  como se espera entre tentativas
 */
export function criarFonteTiktok({
  usuario = '',
  iniciarProcesso = null,
  espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const nome = String(usuario ?? '').trim().replace(/^@+/, '');

  /** O processo de agora, ou `null` entre uma tentativa e a outra. */
  let filho = null;
  /** O laço de reconexão está de pé? `parar()` é o único que diz não. */
  let vivo = false;
  /**
   * Qual tentativa é a atual.
   *
   * Sem este número, uma espera de trinta segundos que já estava em curso
   * quando o operador parou a fonte levantaria um processo DEPOIS do
   * `parar()` — e o operador veria um Python que ele não pediu, sem nada na
   * tela explicando de onde ele veio.
   */
  let geracao = 0;
  let backoff = BACKOFF_INICIAL_MS;
  let eu = null;
  /**
   * A ponte já disse que não adianta tentar de novo.
   *
   * Só um caso usa isto hoje, e ele é o mais provável de todos: o @ errado.
   * Insistir nele não conserta nada e ainda gasta cota do servidor de
   * assinatura, que responde 429 — e o 429 derruba junto a tentativa CERTA,
   * aquela que o Leonardo faz depois de corrigir o nome no painel. Ou seja:
   * a insistência inútil de agora é o defeito de amanhã.
   */
  let desistiu = false;

  const processoPadrao = () => spawn(
    process.env.PYTHON || 'python',
    /*
     * `-u` é obrigatório, e não estilo.
     *
     * Sem ele, o Python bufferiza a saída quando ela não vai para um terminal
     * — que é exatamente o caso aqui —, e os eventos chegam em blocos de 8 KB
     * minutos depois de terem acontecido. O sintoma é uma live que "funciona"
     * e conta votos com dois minutos de atraso, que é o tipo de defeito que
     * só aparece no ar.
     */
    ['-u', PONTE, '--usuario', nome],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      /*
       * O apelido de quem presenteia é UTF-8 e vai direto para a tela. Sem
       * isto, o Python no Windows escreve em cp1252 e o nome de quem tem
       * acento chega quebrado ou derruba a escrita do cano.
       */
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    },
  );

  /** Uma linha do cano. Pode ser evento, status, log — ou nada disso. */
  function tratarLinha(linha) {
    const texto = linha.trim();
    if (!texto) return;

    let bruto = null;
    try {
      bruto = JSON.parse(texto);
    } catch {
      // Quase sempre é log da biblioteca, que escreve no mesmo cano. Não é
      // evento, e é justamente por isso que não pode derrubar a leitura: uma
      // linha de log não pode calar o próximo presente.
      console.error(`[tiktok] ${texto}`);
      return;
    }

    if (bruto?.ponte === 'status') {
      const conectada = bruto.conectada === true;
      if (bruto.fim === true) desistiu = true;
      // Conectou: a próxima queda volta a esperar um segundo, e não o minuto
      // em que o backoff tinha parado. Sem isto, uma live que cai de hora em
      // hora passaria o dia inteiro esperando um minuto para voltar.
      if (conectada) backoff = BACKOFF_INICIAL_MS;
      eu?.definirConectada(conectada, String(bruto.detalhe ?? ''));
      return;
    }

    // A mesma normalização do simulador. É o que garante que um evento social
    // da live não vira voto, e que um presente sem `giftId` não conta.
    eu?.emitir(normalizarEvento(bruto, 'tiktok'));
  }

  /** Pendura os canos do processo e o que fazer quando ele morrer. */
  function ligar(processo, minhaGeracao) {
    let sobra = '';
    processo.stdout.setEncoding('utf8');
    processo.stdout.on('data', (pedaco) => {
      sobra += pedaco;
      const linhas = sobra.split('\n');
      // O último pedaço pode ser meia linha: um JSON cortado no meio de uma
      // palavra. Ele fica esperando o resto em vez de ser lido agora, porque
      // lido agora ele não seria um evento — seria lixo, e o presente sumiria
      // sem que nada acusasse erro.
      sobra = linhas.pop() ?? '';
      for (const linha of linhas) tratarLinha(linha);
    });

    processo.stderr.setEncoding('utf8');
    processo.stderr.on('data', (t) => {
      const limpo = String(t).trimEnd();
      if (limpo) console.error(`[tiktok] ${limpo}`);
    });

    processo.on('exit', (codigo) => {
      // Um processo de uma tentativa que já foi substituída não manda mais
      // nada: quem manda é a tentativa de agora.
      if (!vivo || minhaGeracao !== geracao) return;
      filho = null;
      // A ponte já explicou o motivo ao painel antes de sair, e não há
      // tentativa nenhuma a agendar. Escrever "a ponte saiu" por cima
      // apagaria justamente a frase que o operador precisa ler.
      if (desistiu) return;
      eu?.definirConectada(false, codigo === 0
        ? 'a ponte saiu'
        : `a ponte caiu (código ${codigo}) — tentando de novo`);
      reagendar();
    });

    // Sem isto, um `python` que não existe no PATH derruba o processo inteiro
    // com uma exceção que ninguém está olhando.
    processo.on('error', (e) => {
      if (!vivo || minhaGeracao !== geracao) return;
      filho = null;
      eu?.definirConectada(false, `não consegui chamar o Python: ${e.message}`);
      reagendar();
    });
  }

  /** Levanta a ponte. Síncrono: quem chama já quer o processo existindo. */
  function abrir() {
    const minha = ++geracao;
    // Cada tentativa é uma ponte nova, e a nova não herdou o desistir da
    // anterior: quem decide de novo é ela.
    desistiu = false;
    try {
      filho = (iniciarProcesso ?? processoPadrao)();
    } catch (e) {
      eu?.definirConectada(false, `não consegui chamar o Python: ${e.message}`);
      reagendar();
      return;
    }
    ligar(filho, minha);
  }

  async function reagendar() {
    const minha = geracao;
    const ms = backoff;
    backoff = Math.min(BACKOFF_MAX_MS, backoff * 2);
    await espera(ms);
    // A espera pode ter terminado depois de um `parar()`, ou depois de outra
    // tentativa já ter começado. Nos dois casos, abrir agora seria abrir a
    // mais.
    if (!vivo || minha !== geracao) return;
    abrir();
  }

  const fonte = criarFonte({
    modo: 'tiktok',
    detalhe: 'sem live conectada',

    iniciar(f) {
      eu = f;
      // Dois `iniciar()` seriam dois Pythons na mesma live, cada um contando
      // o mesmo presente. Um voto por presente é a regra inteira do sistema.
      if (vivo) return false;
      if (!nome) {
        f.definirConectada(false, 'falta o usuário da live — preencha na aba Integração');
        return false;
      }
      vivo = true;
      f.definirConectada(false, `chamando a ponte de @${nome}…`);
      abrir();
      return true;
    },

    parar(f) {
      vivo = false;
      // Invalida qualquer espera em curso: sem isto, a tentativa agendada
      // levantaria um processo depois de o operador ter mandado parar.
      geracao += 1;
      const processo = filho;
      filho = null;
      if (processo) {
        processo.removeAllListeners('exit');
        processo.stdout?.removeAllListeners('data');
        processo.kill();
      }
      f.definirConectada(false, 'parado');
    },
  });

  return fonte;
}
