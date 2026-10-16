/**
 * O log da live — a resposta escrita para "por que não falou nada?".
 *
 * Ele nasceu de uma pergunta do Leonardo: ele mandou um presente pelo painel,
 * não ouviu voz nenhuma e não teve onde procurar o motivo. O servidor já
 * sabia de tudo o que tinha acontecido — só não contava para ninguém. Um
 * silêncio sem explicação é a pior falha possível numa live: não dá para
 * saber se é o presente, a voz, a tela ou o operador.
 *
 * O formato é o do `tiktok-live-horse`, o projeto irmão, e é o que ele já
 * sabe ler:
 *
 *     21:04:09 [INFO] hub: 🎁 Ana mandou Rosa
 *     21:04:09 [INFO] voto: ✅ Rosa → Lula (Ana) · +1
 *     21:04:10 [INFO] voz: 🗣 "Ana mandou Rosa pra Lula!"
 *     21:04:10 [AVISO] voz: nenhuma tela conectada — a fala não foi ouvida
 *
 * Os níveis ficam em português porque é assim que o resto deste projeto fala
 * com ele; o resto da linha é o do horse, palavra por palavra.
 *
 * Dois destinos, e os dois por um motivo:
 *
 *   - o CONSOLE é onde ele está olhando, e é o que o horse tem;
 *   - o ARQUIVO, um por dia em `data/logs/`, é o que sobra depois que o
 *     terminal rola. Numa live de três horas, a resposta para "por que não
 *     falou" está a duas mil linhas de distância da tela de hoje — e amanhã
 *     não está em lugar nenhum.
 *
 * A escrita é SÍNCRONA de propósito: o volume é de dezenas de linhas por
 * segundo no pior caso, e a ordem das linhas é justamente o que se vai ler
 * depois. Uma escrita assíncrona trocaria essa ordem por um ganho que ninguém
 * mede.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** Os níveis, e o canal de cada um no console. */
const CANAIS = Object.freeze({ info: 'log', aviso: 'warn', erro: 'error' });
const ROTULOS = Object.freeze({ info: 'INFO', aviso: 'AVISO', erro: 'ERRO' });

const doisDigitos = (n) => String(n).padStart(2, '0');

/** `21:04:09` — a hora local, que é a hora da live. */
function carimbo(data) {
  return `${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}:${doisDigitos(data.getSeconds())}`;
}

/** `2026-10-15` — o nome do arquivo do dia. */
function dia(data) {
  return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`;
}

/**
 * @param {object} [opcoes]
 * @param {string|null} [opcoes.pasta] onde gravar; sem ela o log é só console
 * @param {object} [opcoes.saida] o console — injetado para a suíte não sujar o terminal
 * @param {Function} [opcoes.agora] o relógio, injetado pelo mesmo motivo dos testes
 */
export function criarLog({ pasta = null, saida = console, agora = () => new Date() } = {}) {
  /*
   * A pasta é criada agora, e não na primeira linha.
   *
   * O erro de permissão no meio da live — com a voz já falando e a rodada
   * correndo — é o pior momento para descobrir que a pasta não existe. Aqui
   * ele aparece na subida, junto com o resto do que o servidor avisa ao
   * nascer.
   */
  let destino = pasta ? join(pasta, '') : null;
  if (destino) {
    try {
      mkdirSync(destino, { recursive: true });
    } catch (erro) {
      saida.warn(`[log] não consegui usar a pasta "${pasta}": ${erro.message} — o log fica só no console`);
      destino = null;
    }
  }

  /** Depois da primeira falha de escrita, o arquivo é abandonado — e uma vez só. */
  let desistiu = false;

  /**
   * A linha vai para o arquivo do DIA.
   *
   * O nome sai do relógio a cada linha, e não uma vez na subida: uma live que
   * começa 23h e termina 1h tem que estar partida em dois arquivos, senão a
   * data do nome passa a mentir sobre metade do que está lá dentro.
   */
  function gravar(linha, data) {
    if (!destino || desistiu) return;
    try {
      appendFileSync(join(destino, `${dia(data)}.log`), `${linha}\n`, 'utf8');
    } catch (erro) {
      desistiu = true;
      saida.warn(`[log] parei de escrever o arquivo: ${erro.message} — o log segue no console`);
    }
  }

  function escrever(nivel, assunto, texto) {
    const data = agora();
    const linha = `${carimbo(data)} [${ROTULOS[nivel]}] ${assunto}: ${texto}`;
    saida[CANAIS[nivel]](linha);
    gravar(linha, data);
    return linha;
  }

  return {
    info: (assunto, texto) => escrever('info', assunto, texto),
    aviso: (assunto, texto) => escrever('aviso', assunto, texto),
    erro: (assunto, texto) => escrever('erro', assunto, texto),
  };
}
