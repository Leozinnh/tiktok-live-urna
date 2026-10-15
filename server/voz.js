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

const SCRIPT_SAPI = fileURLToPath(new URL('./voz.ps1', import.meta.url));
const SCRIPT_EDGE = fileURLToPath(new URL('../ponte/voz.py', import.meta.url));

/**
 * Os dois sintetizadores, e o que cada um sabe fazer.
 *
 * `sapi` é a voz do próprio Windows, pelo PowerShell: não custa dependência
 * nenhuma e funciona sem internet, mas é uma colagem de pedaços gravados — a
 * Francisca do Windows lê um nome brasileiro com a música de um GPS.
 *
 * `edge` são as vozes neurais da Microsoft, pelo `ponte/voz.py`: a qualidade
 * que se ouve no Teams e no Edge. Precisa do Python (que o projeto já tem por
 * causa da ponte do TikTok) e de internet.
 *
 * `extensoes` é o que cada um escreve, e a ORDEM importa: é por ela que o
 * cache é procurado. O edge prefere o próprio `.mp3`, mas aceita o `.wav`
 * porque é isso que sobra quando ele falha e a voz do Windows assume — a frase
 * já sintetizada uma vez não precisa ser sintetizada de novo, por quem quer
 * que tenha sido.
 *
 * Um motor sem `lerRoteiro` é um arquivo que o interpretador executa direto;
 * com ele, o texto do script é lido daqui e entregue como comando — é o que a
 * política de execução do Windows obriga no caso do `.ps1`.
 */
export const MOTORES = Object.freeze({
  sapi: Object.freeze({
    extensoes: Object.freeze(['wav']),
    comando: 'powershell.exe',
    lerRoteiro: true,
    argumentos: (roteiro) => [
      '-NoProfile', '-NonInteractive', '-EncodedCommand', codificarParaOPowerShell(roteiro),
    ],
  }),
  edge: Object.freeze({
    extensoes: Object.freeze(['mp3', 'wav']),
    comando: 'python',
    lerRoteiro: false,
    argumentos: () => ['-u', SCRIPT_EDGE],
  }),
});

/** O motor padrão de quem constrói uma voz sem dizer qual quer. */
export const MOTOR_PADRAO = 'sapi';

/**
 * Para quem pedir socorro quando o motor titular falha.
 *
 * A voz neural depende de internet e de um serviço que a Microsoft não promete
 * a ninguém. Quando ele cai no meio de uma live, a alternativa seria um
 * narrador mudo até alguém perceber — e é exatamente o desfecho que todo o
 * resto deste arquivo existe para evitar. A voz do Windows é feia, mas ela
 * está instalada, não usa rede, e um narrador feio é melhor do que nenhum.
 */
export const MOTOR_RESERVA = 'sapi';

/** O motor é conhecido? Um nome errado no painel não pode calar a live. */
export const motorConhecido = (nome) => Object.hasOwn(MOTORES, String(nome ?? ''));

/**
 * O menor arquivo que ainda pode ser áudio.
 *
 * Um WAV tem 44 bytes só de cabeçalho, então qualquer coisa menor que isso é
 * um arquivo interrompido no meio da escrita — e um MP3 truncado é ainda
 * menor. Existe para o cache não servir um resto de arquivo como se fosse uma
 * frase: sem esta linha, uma síntese que morreu no primeiro byte seria tocada
 * para sempre, porque do lado de quem lê um arquivo que existe é um arquivo
 * bom.
 */
const MINIMO_DE_AUDIO = 44;

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
 * @param {string} opcoes.pasta      onde os áudios ficam (é o cache)
 * @param {string|Function} [opcoes.motor] `'edge'` ou `'sapi'`; ver MOTORES
 * @param {string|object} [opcoes.exe] o interpretador, ou um por motor; existe
 *   para o teste poder apontar outro
 * @param {string} [opcoes.nome]     a voz escolhida; vazio usa a padrão do motor
 * @param {number} [opcoes.velocidade] -10 a 10, no ritmo que o painel promete
 * @param {number} [opcoes.timeoutMs] quanto esperar por uma frase antes de desistir
 */
export function criarVoz({
  pasta,
  motor = MOTOR_PADRAO,
  exe = null,
  nome = null,
  velocidade = null,
  timeoutMs = 20_000,
  aoAvisar = null,
} = {}) {
  if (!pasta) throw new Error('a voz precisa de uma pasta para os arquivos');

  let encerrada = false;
  /** id → { resolver, rejeitar, temporizador } da frase em voo. */
  const esperando = new Map();
  let sinteses = 0;
  /** Se já reclamamos que o motor titular está falhando. Ver `sintetizar`. */
  let reclamou = false;

  /*
   * Uma máquina por motor — e "máquina" é o processo vivo, com tudo o que ele
   * carrega: o `pronto`, a assinatura com que subiu, a sobra de linha, a voz
   * que ele disse ser.
   *
   * O mapa tem no máximo duas entradas, e normalmente uma: o motor reserva só
   * sobe no dia em que o titular falha. Ele existe como mapa, e não como um par
   * de variáveis soltas, porque o `exit` de um não pode mexer no estado do
   * outro — a mesma armadilha que já custou caro aqui, agora com dois processos
   * em vez de um.
   */
  const maquinas = new Map();
  function maquina(m) {
    if (!maquinas.has(m)) {
      maquinas.set(m, {
        processo: null, espera: null, aguardando: null, assinatura: null,
        subindo: null, sobra: '', partidas: 0, voz: null, roteiro: null,
      });
    }
    return maquinas.get(m);
  }

  /*
   * O motor, a voz e a velocidade podem ser valores ou funções.
   *
   * Funções porque o painel os troca com a live no ar: quem os lê no momento
   * de subir o processo pega o que está valendo AGORA. Um valor fixo aqui
   * obrigaria a reiniciar o servidor para o campo do painel fazer efeito.
   */
  const ajusteDe = (valor, padrao) => {
    const v = typeof valor === 'function' ? valor() : valor;
    return v == null || v === '' ? padrao : v;
  };
  const ajustesAgora = () => {
    const pedido = String(ajusteDe(motor, MOTOR_PADRAO));
    return {
      // Um nome de motor que o código não conhece — o painel é texto livre —
      // não pode calar a live: cai no padrão, que fala.
      motor: motorConhecido(pedido) ? pedido : MOTOR_PADRAO,
      nome: String(ajusteDe(nome, '')).trim(),
      velocidade: Number(ajusteDe(velocidade, 0)) || 0,
    };
  };
  // A assinatura é o que compara dois ajustes: `{nome:'', velocidade:0}` e
  // `{}` são o mesmo pedido, e sem isto o processo morreria e renasceria a
  // cada frase, pagando a partida de novo toda vez. O motor entra nela porque
  // trocar de motor no painel tem que derrubar o processo e subir o outro.
  const assinaturaDe = (a) => `${a.motor}\u0000${a.nome}\u0000${a.velocidade}`;

  /** O interpretador deste motor, respeitando o `exe` do teste. */
  const comandoDe = (m) => (typeof exe === 'string' ? exe : exe?.[m]) ?? MOTORES[m].comando;

  const avisar = (texto) => {
    if (aoAvisar) aoAvisar(texto);
    else console.warn(`[voz] ${texto}`);
  };

  /**
   * O áudio desta frase, se ele já estiver em disco.
   *
   * A ordem das extensões é a do motor, e é o que faz o edge reaproveitar o
   * `.wav` que o Windows sintetizou numa falha anterior: sem isso, a mesma
   * frase seria sintetizada de novo, falharia de novo, e cairia no Windows de
   * novo, a cada repetição e para sempre.
   */
  async function procurarNoCache(chave, m) {
    for (const ext of MOTORES[m].extensoes) {
      const arquivo = join(pasta, `${chave}.${ext}`);
      try {
        const bytes = await readFile(arquivo);
        // Um WAV tem 44 bytes só de cabeçalho; qualquer coisa menor que isso
        // não é áudio, é um arquivo interrompido no meio da escrita.
        if (bytes.length > MINIMO_DE_AUDIO) return { bytes, arquivo };
      } catch { /* não está em cache */ }
    }
    return null;
  }

  /** Pede uma frase a um motor, e devolve o áudio que ele escreveu. */
  async function falarCom(m, chave, texto) {
    await subir(m);
    const maq = maquina(m);

    const resultado = await new Promise((resolver, rejeitar) => {
      const temporizador = setTimeout(() => {
        esperando.delete(chave);
        rejeitar(new Error(`o sintetizador ${m} não respondeu em ${timeoutMs}ms`));
      }, timeoutMs);
      esperando.set(chave, { resolver, rejeitar, temporizador, motor: m });
      maq.processo.stdin.write(`${chave}\t${texto}\n`, 'utf8');
    });

    /*
     * A extensão vem do sintetizador, e mesmo assim é conferida.
     *
     * Ela entra no nome de um arquivo que este processo vai abrir, e o único
     * motivo de ela ser confiável é o worker ser nosso. Conferir contra a
     * lista do motor custa uma linha e transforma "confio porque é meu" em
     * "só aceito o que eu mesmo pedi" — que é a diferença entre um protocolo e
     * uma promessa.
     */
    if (!MOTORES[m].extensoes.includes(resultado.ext)) {
      throw new Error(`a voz ${m} devolveu uma extensão que não é dela: ${resultado.ext || '(vazia)'}`);
    }
    const arquivo = join(pasta, `${chave}.${resultado.ext}`);
    return { bytes: await readFile(arquivo), eco: resultado.eco, arquivo };
  }

  /**
   * Falha tudo que estava em voo. Chamado quando um sintetizador morre.
   *
   * Sem o filtro por motor: quem morreu pode ter levado junto frases que já
   * estavam na mão do outro, e uma frase que espera para sempre é pior do que
   * uma frase que falha — a primeira trava a fila do narrador, a segunda só
   * deixa aquele aviso sem som.
   */
  function desistirDeTodos(motivo) {
    for (const [, p] of esperando) {
      clearTimeout(p.temporizador);
      p.rejeitar(new Error(motivo));
    }
    esperando.clear();
  }

  /**
   * Uma linha do sintetizador.
   *
   * `pronto` traz a voz. As demais trazem a EXTENSÃO do arquivo que foi
   * escrito, e é ela que o servidor usa para montar o endereço — o edge escreve
   * `.mp3` e o Windows escreve `.wav`, e quem lê não pode adivinhar.
   *
   * O eco é remontado com `slice(3).join('\t')`, e não pego pelo índice: o
   * texto da frase é o último campo, e uma tabulação dentro dele — que um dia
   * alguém vai colar num modelo de frase — faria os campos do fim sumirem sem
   * erro nenhum.
   */
  function receberLinha(linha, m) {
    const maq = maquina(m);
    const campos = linha.split('\t');
    const tipo = campos[0];
    if (tipo === 'pronto') {
      maq.voz = campos[1] ?? null;
      const partida = maq.aguardando;
      maq.aguardando = null;
      partida?.ok(maq.voz);
      return;
    }
    const id = campos[1];
    const p = esperando.get(id);
    // Resposta de uma frase que já desistiu (o tempo estourou, ou o processo
    // anterior morreu). Não é erro: é tarde.
    if (!p) return;
    /*
     * E resposta de OUTRO motor é tarde do mesmo jeito.
     *
     * Quando o edge estoura o tempo e a frase vai para o Windows, a frase
     * ainda está na fila do edge — e a resposta dele chega depois, com o nome
     * do arquivo que ele escreveu. Sem esta linha, ela resolveria a promessa
     * que agora é do Windows, e o servidor leria um `.mp3` no lugar do `.wav`
     * que ainda está sendo escrito. O arquivo não existiria, e o defeito
     * apareceria como "a voz sumiu" — sem nada apontando para a causa.
     */
    if (p.motor !== m) return;
    esperando.delete(id);
    clearTimeout(p.temporizador);
    if (tipo === 'ok') {
      p.resolver({ ext: campos[2] ?? '', eco: campos.slice(3).join('\t') });
    } else {
      p.rejeitar(new Error(`o sintetizador recusou: ${campos.slice(2).join('\t') || 'sem motivo'}`));
    }
  }

  /**
   * Sobe o processo de um motor, se não houver um.
   *
   * A promessa de `pronto` resolve com o nome da voz escolhida — e é o único
   * sinal de que o sintetizador terminou de subir. Falar antes disso perderia
   * a frase no vazio, porque o laço que lê o stdin ainda não começou.
   *
   * Duas chamadas ao mesmo tempo sobem UM processo: sem a guarda de `subindo`,
   * dois seguidores no mesmo quadro criariam dois sintetizadores, e o segundo
   * ficaria pendurado na máquina até o servidor fechar.
   */
  function subir(m) {
    const maq = maquina(m);
    const quer = assinaturaDe(ajustesAgora());

    /*
     * O processo de pé é de uma voz que já não é a do painel.
     *
     * A voz, a velocidade e o motor entram no processo no momento em que ele
     * sobe, e ele vive a noite inteira — então trocar o campo no painel não
     * muda nada no que já está rodando. Derrubar aqui é o que faz a frase
     * SEGUINTE sair com a voz nova, sem reiniciar o servidor.
     *
     * `processo` é zerado antes de matar: o `exit` do morto chega depois, e
     * ele só mexe no estado se ainda for o processo da vez.
     */
    if (maq.processo && maq.assinatura !== quer) {
      const velho = maq.processo;
      maq.processo = null;
      maq.espera = null;
      maq.assinatura = null;
      recusarPartida(maq, new Error(`a voz ${m} foi trocada antes de ficar pronta`));
      try { velho.stdin.end(); } catch { /* já foi */ }
      const prazo = setTimeout(() => { try { velho.kill(); } catch { /* já morreu */ } }, 1000);
      prazo.unref?.();
    }

    if (maq.processo) return maq.espera ?? Promise.resolve(maq.voz);
    if (maq.subindo) return maq.subindo;

    maq.subindo = (async () => {
      if (MOTORES[m].lerRoteiro) maq.roteiro ??= await readFile(SCRIPT_SAPI, 'utf8');
      return abrirProcesso(m, ajustesAgora());
    })().finally(() => { maq.subindo = null; });
    return maq.subindo;
  }

  function abrirProcesso(m, ajustes) {
    const maq = maquina(m);
    const p = spawn(comandoDe(m), MOTORES[m].argumentos(maq.roteiro), {
      env: {
        ...process.env,
        URNA_VOZ_PASTA: pasta,
        ...(ajustes.nome ? { URNA_VOZ_NOME: ajustes.nome } : {}),
        ...(ajustes.velocidade ? { URNA_VOZ_VELOCIDADE: String(ajustes.velocidade) } : {}),
      },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    maq.processo = p;
    maq.assinatura = assinaturaDe(ajustes);
    maq.partidas += 1;

    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (pedaco) => {
      /*
       * O `data` chega em pedaços que não respeitam a linha, e um deles pode
       * cortar um acento no meio. O `setEncoding('utf8')` já junta os bytes de
       * um caractere partido; o que falta é juntar linhas partidas, e é o que
       * a sobra faz.
       */
      maq.sobra += pedaco;
      const linhas = maq.sobra.split(/\r?\n/);
      maq.sobra = linhas.pop() ?? '';
      for (const l of linhas) if (l) receberLinha(l, m);
    });

    // O stderr do sintetizador é o que ele cospe quando algo dá errado de
    // verdade. Não é motivo para calar a live, mas é a única pista que existe
    // quando a voz para de sair — então vai para o aviso, e não para o lixo.
    p.stderr.setEncoding('utf8');
    p.stderr.on('data', (pedaco) => {
      const t = String(pedaco).trim();
      if (t) avisar(`stderr de ${m}: ${t.slice(0, 300)}`);
    });

    /*
     * O sintetizador não subiu — o Python não está instalado, o PowerShell não
     * existe nesta máquina, o caminho está errado.
     *
     * A promessa de partida TEM que ser recusada aqui. Sem isso, `await subir()`
     * espera para sempre por um `pronto` que nunca vem, e a frase fica pendurada
     * sem nunca chegar ao `setTimeout` que existe justamente para desistir —
     * porque o relógio só começa a contar DEPOIS que a subida termina. O
     * sintetizador que não existe virava um narrador travado, e não um narrador
     * que cai para a voz de reserva.
     */
    p.on('error', (erro) => {
      avisar(`não consegui subir a voz ${m}: ${erro.message}`);
      if (maq.processo === p) { maq.processo = null; maq.espera = null; }
      recusarPartida(maq, new Error(`a voz ${m} não subiu: ${erro.message}`));
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
      if (maq.processo !== p) return;
      maq.processo = null;
      maq.espera = null;
      // Morreu ANTES de dizer "pronto": quem esperava pela partida precisa
      // saber, senão fica esperando por um processo que já não existe.
      recusarPartida(maq, new Error(`a voz ${m} terminou antes de ficar pronta`));
      // Morreu sozinho: a próxima frase sobe outro. Foi `parar` que mandou?
      // Então não sobe nada, e quem estiver esperando recebe silêncio.
      desistirDeTodos(encerrada ? 'a voz foi encerrada' : 'o sintetizador caiu');
    });

    /*
     * A promessa é guardada ANTES de o resolvedor ser extraído.
     *
     * `espera = new Promise((ok) => { espera = ok })` parece a mesma coisa e
     * não é: o executor roda na hora, então a variável termina sendo o `ok` — e
     * devolver isso devolveria uma FUNÇÃO, não a promessa. Quem esperasse por
     * ela receberia um valor que não tem `.then`, e o erro só apareceria na
     * primeira frase de verdade.
     */
    maq.espera = new Promise((ok, falha) => { maq.aguardando = { ok, falha }; });
    return maq.espera;
  }

  /**
   * A partida não vai acontecer. Quem esperava por ela precisa saber.
   *
   * `aguardando` é zerado antes de recusar porque recusar dispara o `catch` de
   * quem esperava, e esse `catch` pode muito bem pedir outra frase — que
   * subiria um processo novo e reescreveria `aguardando`. Zerar depois apagaria
   * a partida NOVA no lugar da velha.
   */
  function recusarPartida(maq, erro) {
    const partida = maq.aguardando;
    maq.aguardando = null;
    partida?.falha(erro);
  }

  return {
    /** Quantas frases foram realmente sintetizadas (o cache não conta). */
    get sinteses() { return sinteses; },
    /** Qual motor está valendo agora. */
    get motor() { return ajustesAgora().motor; },
    /**
     * A voz que o sintetizador disse estar usando, para o painel mostrar.
     *
     * A do motor de agora; se ele ainda não subiu, a de quem já subiu — é
     * melhor mostrar a voz do reserva do que não mostrar nada.
     */
    get voz() {
      const atual = maquina(ajustesAgora().motor).voz;
      if (atual) return atual;
      for (const maq of maquinas.values()) if (maq.voz) return maq.voz;
      return null;
    },
    get viva() { return [...maquinas.values()].some((maq) => Boolean(maq.processo)); },
    /** Quantas vezes os sintetizadores subiram — um laço de reinício aparece aqui. */
    get partidas() { return [...maquinas.values()].reduce((s, maq) => s + maq.partidas, 0); },

    /** Sobe o processo agora, para a primeira frase não pagar a partida. */
    aquecer: () => subir(ajustesAgora().motor).then(() => true).catch(() => false),

    /**
     * O áudio de uma frase. `null` quando não há o que falar.
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
      const ajustes = ajustesAgora();
      const chave = chaveDoTexto(limpo, ajustes);

      // O disco é a memória do narrador: sobrevive ao processo, e por isso o
      // primeiro seguidor de apelido conhecido sai na hora, mesmo depois de
      // reiniciar o servidor.
      const guardado = await procurarNoCache(chave, ajustes.motor);
      if (guardado) return { bytes: guardado.bytes, eco: limpo, arquivo: guardado.arquivo };

      await mkdir(pasta, { recursive: true });

      try {
        const r = await falarCom(ajustes.motor, chave, limpo);
        sinteses += 1;
        // Voltou a funcionar: a próxima queda merece um aviso novo.
        reclamou = false;
        return r;
      } catch (e) {
        /*
         * O titular falhou. Antes de deixar a live muda, fala a voz do
         * Windows — feia, instalada, e sem depender de rede nenhuma.
         *
         * O aviso sai UMA vez por queda, e não a cada frase: com o edge fora
         * do ar, cada fala do resto da noite cuspiria a mesma linha no
         * console, e o console é justamente onde o Leonardo procuraria a
         * causa. Repetir o mesmo aviso trezentas vezes é o jeito mais rápido
         * de esconder o primeiro.
         */
        if (ajustes.motor === MOTOR_RESERVA) throw e;
        if (!reclamou) {
          avisar(`a voz ${ajustes.motor} falhou (${e.message}) — falando com a do Windows`);
          reclamou = true;
        }
        const r = await falarCom(MOTOR_RESERVA, chave, limpo);
        sinteses += 1;
        return r;
      }
    },

    /**
     * Fecha o stdin de todos: cada laço termina sozinho e o processo sai.
     *
     * Todos, e não só o do motor de agora: o reserva pode ter subido numa falha
     * do titular e continuado de pé. Um deles esquecido aqui é um processo
     * pendurado na máquina do Leonardo depois de ele fechar o servidor.
     */
    parar() {
      encerrada = true;
      let algum = false;
      for (const maq of maquinas.values()) {
        const p = maq.processo;
        maq.processo = null;
        maq.espera = null;
        // Quem estava esperando a partida de um processo que agora está sendo
        // encerrado não vai receber `pronto` nunca.
        recusarPartida(maq, new Error('a voz foi encerrada'));
        if (!p) continue;
        algum = true;
        try { p.stdin.end(); } catch { /* já foi */ }
        /*
         * Uma rede de segurança, e não a via normal: o `stdin.end()` já basta
         * para o laço terminar. Se por algum motivo o processo não sair — um
         * `Speak` travado no meio de uma frase longa, por exemplo —, ele seria
         * um sintetizador pendurado na máquina do Leonardo depois de ele
         * fechar o servidor. Mata na força depois de um segundo.
         */
        const prazo = setTimeout(() => { try { p.kill(); } catch { /* já morreu */ } }, 1000);
        prazo.unref?.();
      }
      return algum;
    },

    /** Só para o teste: derruba o processo por fora e vê se ele volta. */
    matarProcessoParaTeste() {
      const maq = maquina(ajustesAgora().motor);
      const p = maq.processo;
      maq.processo = null;
      maq.espera = null;
      try { p?.kill(); } catch { /* já morreu */ }
    },
  };
}
