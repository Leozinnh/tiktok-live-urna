/**
 * O WebSocket, escrito à mão.
 *
 * O projeto tem zero dependências de execução desde o primeiro commit — é o
 * que faz `npm install` não existir e o site subir com um `npm start`. Um
 * `ws` no package.json resolveria isto em três linhas e traria junto uma
 * árvore de dependências para manter atualizada numa máquina que fica ligada
 * a noite inteira numa live.
 *
 * O que a especificação pede é pequeno: um canal para o servidor empurrar
 * estado e eventos, e algumas mensagens de volta. Sem extensões, sem
 * compressão, sem fragmentação. É essa parte pequena que está implementada
 * aqui, e só ela — o que não é usado não é escrito, porque código de
 * protocolo que nunca rodou é código que não funciona.
 *
 * As funções são puras e recebem bytes: é o que permite testá-las sem abrir
 * uma porta.
 */

import { createHash } from 'node:crypto';

/** O GUID do RFC 6455, seção 1.3. É a constante que faz o handshake ser ele. */
export const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export const OPCODE = {
  continuacao: 0x0,
  texto: 0x1,
  binario: 0x2,
  close: 0x8,
  ping: 0x9,
  pong: 0xa,
};

/**
 * A resposta ao `Sec-WebSocket-Key` do cliente.
 *
 * É o SHA-1 da chave colada no GUID, em base64. Parece cerimônia e não é
 * segurança nenhuma — é o que separa um upgrade de verdade de qualquer
 * requisição HTTP que traga os cabeçalhos certos por acidente, um proxy no
 * meio do caminho, por exemplo.
 */
export function chaveDeAceite(chaveDoCliente) {
  return createHash('sha1').update(String(chaveDoCliente) + GUID).digest('base64');
}

/**
 * Monta um quadro do servidor para o cliente.
 *
 * O servidor NÃO mascara (RFC 6455, seção 5.1) — só o cliente mascara. Errar
 * isso é o defeito clássico: o navegador recebe o quadro, vê o bit de máscara
 * ligado e fecha a conexão sem explicar por quê.
 */
export function codificarFrame(dados, opcode = OPCODE.texto) {
  const corpo = Buffer.isBuffer(dados) ? dados : Buffer.from(String(dados), 'utf8');
  const n = corpo.length;
  let cabecalho;
  if (n < 126) {
    cabecalho = Buffer.alloc(2);
    cabecalho[1] = n;
  } else if (n < 65536) {
    cabecalho = Buffer.alloc(4);
    cabecalho[1] = 126;
    cabecalho.writeUInt16BE(n, 2);
  } else {
    cabecalho = Buffer.alloc(10);
    cabecalho[1] = 127;
    cabecalho.writeBigUInt64BE(BigInt(n), 2);
  }
  cabecalho[0] = 0x80 | opcode; // FIN ligado: sem fragmentação
  return Buffer.concat([cabecalho, corpo]);
}

/** Um quadro de controle sem payload — `close`, `ping` ou `pong`. */
export function codificarControle(opcode) {
  return codificarFrame(Buffer.alloc(0), opcode);
}

/**
 * Decodifica o que chegou do cliente.
 *
 * Devolve `{ mensagens, resto }`:
 *
 *   - `mensagens` são os payloads de TEXTO, na ordem;
 *   - `resto` são os bytes que ainda não formam um quadro inteiro.
 *
 * O `resto` não é detalhe: uma mensagem maior do que o pacote chega em
 * pedaços, e decodificar o pedaço faria o motor receber um JSON truncado e
 * recusar um voto de verdade.
 *
 * Quadros de controle são consumidos e descartados — entregá-los adiante
 * faria um `JSON.parse` explodir num `ping`, que não é erro nenhum: é o
 * navegador dizendo "tô aqui".
 */
export function decodificarFrames(buffer) {
  const mensagens = [];
  let pos = 0;

  while (pos + 2 <= buffer.length) {
    const primeiro = buffer[pos];
    const segundo = buffer[pos + 1];
    const opcode = primeiro & 0x0f;
    const mascarado = (segundo & 0x80) !== 0;
    let tamanho = segundo & 0x7f;
    let cabecalho = 2;

    if (tamanho === 126) {
      if (pos + 4 > buffer.length) break;
      tamanho = buffer.readUInt16BE(pos + 2);
      cabecalho = 4;
    } else if (tamanho === 127) {
      if (pos + 10 > buffer.length) break;
      tamanho = Number(buffer.readBigUInt64BE(pos + 2));
      cabecalho = 10;
    }

    // Um cliente que não mascara está fora do protocolo. Recusar o quadro é
    // mais seguro do que adivinhar onde ele termina.
    if (!mascarado && opcode !== OPCODE.close && opcode !== OPCODE.ping && opcode !== OPCODE.pong) {
      break;
    }
    const inicioDaMascara = pos + cabecalho;
    const inicioDoCorpo = inicioDaMascara + (mascarado ? 4 : 0);
    const fim = inicioDoCorpo + tamanho;
    if (fim > buffer.length) break;

    if (mascarado) {
      const chave = buffer.subarray(inicioDaMascara, inicioDaMascara + 4);
      const corpo = Buffer.from(buffer.subarray(inicioDoCorpo, fim));
      for (let i = 0; i < corpo.length; i++) corpo[i] ^= chave[i % 4];
      if (opcode === OPCODE.texto) mensagens.push(corpo.toString('utf8'));
    } else if (opcode === OPCODE.texto) {
      mensagens.push(buffer.subarray(inicioDoCorpo, fim).toString('utf8'));
    }

    pos = fim;
  }

  return { mensagens, resto: buffer.subarray(pos) };
}
