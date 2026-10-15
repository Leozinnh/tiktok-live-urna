/**
 * A voz do narrador — o lado Node do `voz.ps1`.
 *
 * O porquê de existir um processo PowerShell está escrito por extenso no
 * cabeçalho do `voz.ps1`. Em uma linha: a `speechSynthesis` do navegador não
 * funciona dentro do OBS, e o que o OBS captura é um `<audio>` — então o som
 * tem que existir como arquivo.
 *
 * Este módulo cuida de três coisas, e a terceira é a que dá trabalho:
 *
 *   1. manter UM processo de fala vivo pelo tempo que o servidor viver;
 *   2. falar com ele por linhas de texto, uma frase por vez;
 *   3. sobreviver a ele morrendo.
 *
 * O terceiro item é o que separa um narrador que funciona de um que para no
 * meio da live. Um sintetizador cai por memória, por atualização do Windows,
 * ou porque alguém o fechou no gerenciador de tarefas — e se a única saída
 * fosse reiniciar o servidor, a transmissão ficaria muda até alguém reparar.
 * A distinção que o código faz é entre "morreu sozinho" (ressuscita) e "eu
 * mandei parar" (fica parado).
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./voz.ps1', import.meta.url));

/**
 * O script vira `-EncodedCommand`, e isto merece explicação.
 *
 * O jeito óbvio seria `-File voz.ps1`, e ele esbarra na política de execução
 * do Windows: um `.ps1` é um script, e rodá-lo exige afrouxar a política —
 * `-ExecutionPolicy Bypass` — numa máquina que não é minha. Não vale a pena
 * enfraquecer uma proteção do sistema para economizar três linhas.
 *
 * `-EncodedCommand` recebe o texto do script em base64 de UTF-16LE e o
 * executa como COMANDO, não como arquivo: a política de execução não se
 * aplica, e nada no Windows fica mais permissivo do que já estava. De quebra,
 * resolve o escape — passar o script inteiro por `-Command` exigiria escapar
 * aspas, crases e cifrões, e o primeiro `$` perdido só apareceria meses
 * depois, no meio de uma live.
 *
 * O `.ps1` continua no repositório como texto legível, e é LIDO daqui. Ele
 * não é um arquivo que o Windows executa.
 */
export function codificarParaOPowerShell(texto) {
  return Buffer.from(String(texto), 'utf16le').toString('base64');
}

/**
 * O nome do arquivo de uma frase.
 *
 * Dezesseis caracteres de SHA-1: espaço de sobra para uma noite de live não
 * colidir, e curto o bastante para o nome do arquivo continuar legível numa
 * listagem de pasta. Apara as pontas porque o texto vem de um modelo de frase
 * montado no servidor, e um espaço a mais num deles criaria um segundo arquivo
 * para a mesma fala — o cache deixaria de existir sem ninguém notar.
 */
export function chaveDoTexto(texto, ajustes = {}) {
  const limpo = String(texto ?? '').trim();
  const nome = String(ajustes?.nome ?? '').trim();
  const velocidade = Number(ajustes?.velocidade ?? 0) || 0;
  /*
   * A voz e a velocidade entram na chave porque o arquivo em disco é o cache,
   * e a mesma frase dita por outra voz é outro som. Sem elas, trocar a voz no
   * painel não mudaria nada: o servidor acharia o arquivo antigo e o tocaria
   * outra vez, para sempre, sem nunca chamar o sintetizador.
   *
   * O ajuste PADRÃO não deixa marca, e isso é deliberado: a chave de sempre
   * tem que continuar valendo, senão toda fala já sintetizada viraria lixo no
   * dia em que este código subisse.
   */
  const marca = nome || velocidade ? `|${nome}|${velocidade}` : '';
  return createHash('sha1').update(limpo + marca, 'utf8').digest('hex').slice(0, 16);
}

/**
 * @param {object} opcoes
 * @param {string} opcoes.pasta      onde os WAV ficam (é o cache)
 * @param {string} [opcoes.exe]      o interpretador; existe para o teste poder apontar outro
 * @param {string} [opcoes.nome]     a voz do Windows; vazio escolhe a primeira pt-BR
 * @param {number} [opcoes.velocidade] -10 a 10, na escala do SAPI
 * @param {number} [opcoes.timeoutMs] quanto esperar por uma frase antes de desistir
 */
export function criarVoz({
  pasta,
  exe = 'powershell.exe',
  nome = null,
  velocidade = null,
  timeoutMs = 20_000,
  aoAvisar = null,
} = {}) {
  if (!pasta) throw new Error('a voz precisa de uma pasta para os arquivos');

  let processo = null;
  let pronto = null;
  let encerrada = false;
  /** id → { resolver, rejeitar, temporizador } da frase em voo. */
  const esperando = new Map();
  let sinteses = 0;
  let vozEscolhida = null;
  let sobra = '';
  /** Quantas vezes o sintetizador subiu. Um laço de reinício aparece aqui. */
  let partidas = 0;
  /** Com que ajuste o processo de pé foi aberto; `null` quando não há um. */
  let assinaturaDoProcesso = null;

  /*
   * A voz e a velocidade podem ser valores ou funções.
   *
   * Funções porque o painel as troca com a live no ar: quem as lê no momento
   * de subir o processo pega o que está valendo AGORA. Um valor fixo aqui
   * obrigaria a reiniciar o servidor para o campo do painel fazer efeito.
   */
  const ajusteDe = (valor, padrao) => {
    const v = typeof valor === 'function' ? valor() : valor;
    return v == null || v === '' ? padrao : v;
  };
  const ajustesAgora = () => ({
    nome: String(ajusteDe(nome, '')).trim(),
    velocidade: Number(ajusteDe(velocidade, 0)) || 0,
  });
  // A assinatura é o que compara dois ajustes: `{nome:'', velocidade:0}` e
  // `{}` são o mesmo pedido, e sem isto o processo morreria e renasceria a
  // cada frase, pagando a partida de novo toda vez.
  const assinaturaDe = (a) => `${a.nome}\u0000${a.velocidade}`;

  const avisar = (texto) => {
    if (aoAvisar) aoAvisar(texto);
    else console.warn(`[voz] ${texto}`);
  };

  /** Falha tudo que estava em voo. Chamado quando o processo morre. */
  function desistirDeTodos(motivo) {
    for (const [, p] of esperando) {
      clearTimeout(p.temporizador);
      p.rejeitar(new Error(motivo));
    }
    esperando.clear();
  }

  function receberLinha(linha) {
    const [tipo, id, resto] = linha.split('\t');
    if (tipo === 'pronto') {
      vozEscolhida = id ?? null;
      pronto?.(vozEscolhida);
      pronto = null;
      return;
    }
    const p = esperando.get(id);
    if (!p) return;
    esperando.delete(id);
    clearTimeout(p.temporizador);
    if (tipo === 'ok') p.resolver({ eco: resto ?? '' });
    else p.rejeitar(new Error(`o sintetizador recusou: ${resto ?? 'sem motivo'}`));
  }

  /**
   * Sobe o processo, se não houver um.
   *
   * A promessa de `pronto` resolve com o nome da voz escolhida — e é o único
   * sinal de que o `Add-Type` terminou. Falar antes disso perderia a frase no
   * vazio, porque o laço que lê o stdin ainda não começou.
   *
   * Duas chamadas ao mesmo tempo sobem UM processo: sem a guarda de `subindo`,
   * dois seguidores no mesmo quadro criariam dois sintetizadores, e o segundo
   * ficaria pendurado na máquina até o servidor fechar.
   */
  let roteiro = null;
  let subindo = null;
  function subir() {
    const quer = assinaturaDe(ajustesAgora());

    /*
     * O processo de pé é de uma voz que já não é a do painel.
     *
     * A voz e a velocidade entram no processo no momento em que ele sobe, e
     * ele vive a noite inteira — então trocar o campo no painel não muda nada
     * no que já está rodando. Derrubar aqui é o que faz a frase SEGUINTE sair
     * com a voz nova, sem reiniciar o servidor.
     *
     * `processo` é zerado antes de matar: o `exit` do morto chega depois, e
     * ele só mexe no estado se ainda for o processo da vez.
     */
    if (processo && assinaturaDoProcesso !== quer) {
      const velho = processo;
      processo = null;
      pronto = null;
      assinaturaDoProcesso = null;
      try { velho.stdin.end(); } catch { /* já foi */ }
      const prazo = setTimeout(() => { try { velho.kill(); } catch { /* já morreu */ } }, 1000);
      prazo.unref?.();
    }

    if (processo) return pronto ?? Promise.resolve(vozEscolhida);
    if (subindo) return subindo;

    subindo = (async () => {
      roteiro ??= await readFile(SCRIPT, 'utf8');
      return abrirProcesso(ajustesAgora());
    })().finally(() => { subindo = null; });
    return subindo;
  }

  function abrirProcesso(ajustes) {
    const p = spawn(exe, [
      '-NoProfile', '-NonInteractive', '-EncodedCommand', codificarParaOPowerShell(roteiro),
    ], {
      env: {
        ...process.env,
        URNA_VOZ_PASTA: pasta,
        ...(ajustes.nome ? { URNA_VOZ_NOME: ajustes.nome } : {}),
        ...(ajustes.velocidade ? { URNA_VOZ_VELOCIDADE: String(ajustes.velocidade) } : {}),
      },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    processo = p;
    assinaturaDoProcesso = assinaturaDe(ajustes);
    partidas += 1;

    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (pedaco) => {
      /*
       * O `data` chega em pedaços que não respeitam a linha, e um deles pode
       * cortar um acento no meio. O `setEncoding('utf8')` já junta os bytes de
       * um caractere partido; o que falta é juntar linhas partidas, e é o que
       * a sobra faz.
       */
      sobra += pedaco;
      const linhas = sobra.split(/\r?\n/);
      sobra = linhas.pop() ?? '';
      for (const l of linhas) if (l) receberLinha(l);
    });

    // O stderr do PowerShell é o que ele cospe quando algo dá errado de
    // verdade. Não é motivo para calar a live, mas é a única pista que existe
    // quando a voz para de sair — então vai para o aviso, e não para o lixo.
    p.stderr.setEncoding('utf8');
    p.stderr.on('data', (pedaco) => {
      const t = String(pedaco).trim();
      if (t) avisar(`stderr do sintetizador: ${t.slice(0, 300)}`);
    });

    p.on('error', (erro) => {
      avisar(`não consegui subir o sintetizador: ${erro.message}`);
      if (processo === p) { processo = null; pronto = null; }
    });

    p.on('exit', () => {
      /*
       * Só mexe no estado se AINDA for este o processo.
       *
       * O `exit` chega depois de o processo já ter sido dado como morto e
       * substituído — o `matarProcessoParaTeste` faz exatamente isso, e uma
       * queda de verdade seguida de ressurreição faz igual. Sem a comparação,
       * o `exit` do morto zerava o `processo` do vivo, e a frase seguinte
       * subia um terceiro: um sintetizador órfão por queda, a noite inteira.
       */
      if (processo !== p) return;
      processo = null;
      pronto = null;
      // Morreu sozinho: a próxima frase sobe outro. Foi `parar` que mandou?
      // Então não sobe nada, e quem estiver esperando recebe silêncio.
      desistirDeTodos(encerrada ? 'a voz foi encerrada' : 'o sintetizador caiu');
    });

    /*
     * A promessa é guardada ANTES de o resolvedor ser extraído.
     *
     * `pronto = new Promise((ok) => { pronto = ok })` parece a mesma coisa e
     * não é: o executor roda na hora, então `pronto` termina sendo o `ok` — e
     * devolver `pronto` devolveria uma FUNÇÃO, não a promessa. Quem esperasse
     * por ela receberia um valor que não tem `.then`, e o erro só apareceria
     * na primeira frase de verdade.
     */
    const espera = new Promise((ok) => { pronto = ok; });
    return espera;
  }

  return {
    /** Quantas frases foram realmente sintetizadas (o cache não conta). */
    get sinteses() { return sinteses; },
    get voz() { return vozEscolhida; },
    get viva() { return Boolean(processo); },
    /** Quantas vezes o sintetizador subiu — um laço de reinício aparece aqui. */
    get partidas() { return partidas; },

    /** Sobe o processo agora, para a primeira frase não pagar a partida. */
    aquecer: () => subir().then(() => true).catch(() => false),

    /**
     * O WAV de uma frase. `null` quando não há o que falar.
     *
     * Devolve `{ bytes, eco, arquivo }`. O `eco` é o texto que o sintetizador
     * diz ter recebido — quem chama compara com o que mandou, porque um
     * acento perdido no caminho soa como português e não é.
     */
    async sintetizar(texto) {
      const limpo = String(texto ?? '').trim();
      if (!limpo || encerrada) return null;

      // Os ajustes entram na chave, e não só no processo: é o arquivo em
      // disco que decide se a frase precisa ser sintetizada, e a mesma frase
      // dita por outra voz é outro som.
      const chave = chaveDoTexto(limpo, ajustesAgora());
      const arquivo = join(pasta, `${chave}.wav`);

      // O disco é a memória do narrador: sobrevive ao processo, e por isso o
      // primeiro seguidor de apelido conhecido sai na hora, mesmo depois de
      // reiniciar o servidor.
      try {
        const bytes = await readFile(arquivo);
        if (bytes.length > 44) return { bytes, eco: limpo, arquivo };
      } catch { /* não está em cache: sintetiza */ }

      await mkdir(pasta, { recursive: true });
      await subir();

      const resultado = await new Promise((resolver, rejeitar) => {
        const id = `${chave}`;
        const temporizador = setTimeout(() => {
          esperando.delete(id);
          rejeitar(new Error(`o sintetizador não respondeu em ${timeoutMs}ms`));
        }, timeoutMs);
        esperando.set(id, { resolver, rejeitar, temporizador });
        processo.stdin.write(`${id}\t${limpo}\n`, 'utf8');
      });

      const bytes = await readFile(arquivo);
      sinteses += 1;
      return { bytes, eco: resultado.eco, arquivo };
    },

    /** Fecha o stdin: o laço do PowerShell termina sozinho e o processo sai. */
    parar() {
      encerrada = true;
      const p = processo;
      processo = null;
      pronto = null;
      if (!p) return false;
      try { p.stdin.end(); } catch { /* já foi */ }
      /*
       * Uma rede de segurança, e não a via normal: o `stdin.end()` já basta
       * para o laço terminar. Se por algum motivo o processo não sair — um
       * `Speak` travado no meio de uma frase longa, por exemplo —, ele seria
       * um PowerShell pendurado na máquina do Leonardo depois de ele fechar o
       * servidor. Mata na força depois de um segundo.
       */
      const prazo = setTimeout(() => { try { p.kill(); } catch { /* já morreu */ } }, 1000);
      prazo.unref?.();
      return true;
    },

    /** Só para o teste: derruba o processo por fora e vê se ele volta. */
    matarProcessoParaTeste() {
      const p = processo;
      processo = null;
      pronto = null;
      try { p?.kill(); } catch { /* já morreu */ }
    },
  };
}
