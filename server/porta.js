/**
 * Porta ocupada — descobrir quem está segurando, e dizer o que fazer.
 *
 * O `EADDRINUSE` do Node, sozinho, é uma pilha de chamadas que não responde
 * nenhuma das duas perguntas que importam: *quem* está na porta, e *o que eu
 * faço agora*. O Leonardo reclamou exatamente disso — "nao quero ter q dar
 * taskkill e tal para reiniciar" —, e o caso dele é o mais comum de todos:
 * o servidor da tentativa anterior continuou de pé.
 *
 * As funções aqui são puras de propósito. A que descobre o PID não roda o
 * `netstat`; ela LÊ a saída dele. Assim o formato chato do Windows — o
 * cabeçalho em português, a coluna do meio, a linha de conexão que engana —
 * vira um caso de teste em vez de uma suposição.
 */

/**
 * O PID de quem ESCUTA a porta, lido da saída de `netstat -ano`.
 *
 * A armadilha que justifica esta função existir: com um navegador aberto, a
 * porta 3000 aparece em DUAS linhas. Uma é o servidor, que escuta
 * (`Endereço local` = `0.0.0.0:3000`); a outra é a conexão do navegador, que
 * só MENCIONA a porta do outro lado (`Endereço externo` = `127.0.0.1:3000`) e
 * traz o PID do NAVEGADOR. Procurar a porta na linha inteira acha as duas, e
 * a primeira pode ser a errada — matar aquele PID fecharia a janela onde a
 * urna está sendo capturada.
 *
 * Por isso a comparação é só contra o campo do endereço LOCAL, e é por porta
 * inteira (`:3000`), nunca por pedaço: `3001` e `30000` contêm "3000" como
 * texto e seriam mortos por engano.
 *
 * `null` quando não há ninguém — e aí a mensagem muda, porque não existe
 * `taskkill` para um PID que não foi encontrado.
 */
export function pidDoNetstat(saida, porta) {
  const alvo = `:${Number(porta)}`;
  for (const linha of String(saida ?? '').split(/\r?\n/)) {
    const campos = linha.trim().split(/\s+/);
    // Proto · local · externo · [estado] · PID. Menos que quatro campos é
    // cabeçalho ou linha partida no meio.
    if (campos.length < 4) continue;
    const [proto, local] = campos;
    if (proto !== 'TCP' && proto !== 'UDP') continue;
    if (!local.endsWith(alvo)) continue;
    // O PID é o último campo nas duas formas: com estado (TCP) e sem (UDP).
    const pid = Number(campos[campos.length - 1]);
    if (Number.isInteger(pid) && pid > 0) return pid;
  }
  return null;
}

/**
 * O que dizer ao Leonardo quando a porta está ocupada.
 *
 * Ele vai ler isto no terminal, no meio de outra coisa, provavelmente com a
 * live esperando. Então a ordem é: o que aconteceu, quem é o culpado, e o
 * comando pronto para colar — sem aspas, sem lugar para preencher, sem
 * `taskkill /PID <coloque-o-pid-aqui> /F`, que é a mesma coisa que não dizer
 * nada.
 *
 * A saída sem matar ninguém vem sempre, inclusive quando há PID: subir em
 * outra porta é o caminho certo quando ele quer as duas instâncias de pé, e
 * é mais barato que descobrir isso sozinho.
 */
export function mensagemDePortaOcupada(porta, pid = null) {
  const p = Number(porta);
  const linhas = ['', `  A porta ${p} já está ocupada.`, ''];

  /*
   * A PRIMEIRA resposta é o `npm run reiniciar`, e essa ordem é o ponto.
   *
   * Ele derruba quem está na porta e sobe o servidor de novo na mesma janela,
   * sem PID nenhum para copiar — que é literalmente o que o Leonardo pediu:
   * "nao quero ter q dar taskkill e tal para reiniciar". O `taskkill` pronto
   * para colar foi a resposta anterior, e era boa; só não era a que ele queria
   * dar. Deixá-lo no topo faria ele continuar fazendo à mão o que já tem
   * comando.
   *
   * Vale ainda mais quando o PID não foi descoberto: o reiniciar faz a própria
   * descoberta, então é justamente aí que ele resolve sozinho.
   */
  linhas.push(
    '  Na maioria das vezes é outra instância deste servidor que ficou de pé.',
    '  Para derrubá-la e subir de novo, num comando só:',
    '',
    '      npm run reiniciar',
    '',
  );

  if (pid) {
    linhas.push(
      `  Quem está segurando é o processo ${pid}. Para derrubá-lo à mão:`,
      '',
      `      taskkill /PID ${pid} /F`,
      '',
    );
  } else {
    linhas.push(
      '  Não consegui descobrir qual processo é. Para ver quem está',
      '  segurando:',
      '',
      `      netstat -ano | findstr :${p}`,
      '',
    );
  }

  linhas.push(
    '  Ou suba em outra porta, sem mexer em nada:',
    '',
    `      set PORT=${p + 1} && npm start`,
    '',
  );

  return linhas.join('\n');
}

/**
 * Roda o `netstat` e devolve o PID, ou `null` se não der para saber.
 *
 * Nunca estoura: isto é o caminho de ERRO, e um erro dentro do tratamento do
 * erro deixaria o Leonardo sem mensagem nenhuma — o exato oposto do motivo de
 * tudo isto existir.
 */
export async function descobrirPidDaPorta(porta, { executar } = {}) {
  const { execFile } = await import('node:child_process');
  const rodar = executar ?? ((cmd, args) => new Promise((ok, falha) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (erro, stdout) => (erro && !stdout ? falha(erro) : ok(stdout ?? '')));
  }));

  try {
    return pidDoNetstat(await rodar('netstat', ['-ano']), porta);
  } catch {
    return null;
  }
}
