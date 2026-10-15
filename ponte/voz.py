"""A voz neural, falada pelo servidor em Node.

Por que existe um segundo sintetizador, se o `server/voz.ps1` já funciona: o
SAPI do Windows não é uma voz, é uma colagem de pedaços de fala gravados. A
Francisca do Windows lê "Bia acabou de seguir a live" com a mesma música de um
GPS de carro — e numa transmissão que passa a noite anunciando gente, isso é a
diferença entre um narrador e um aviso de supermercado.

A `edge-tts` são as vozes neurais da própria Microsoft, as mesmas que leem o
Teams e o Edge. Continuam sendo do Windows, continuam sem custar dependência de
Node nenhuma — o que elas pedem é o Python, que este projeto já tem por causa
da ponte do TikTok.

O protocolo é o MESMO do `voz.ps1`, com um campo a mais:

  entrada   <id>\\t<texto>
  saída     pronto\\t<voz>
            ok\\t<id>\\t<ext>\\t<texto>     (o texto volta como ECO)
            erro\\t<id>\\t<motivo>

O `ext` é a parte nova, e ela existe porque agora há DOIS motores: este escreve
`.mp3`, o PowerShell escreve `.wav`. Quem lê o arquivo é o servidor, e ele não
pode adivinhar a extensão — um `readFile` no nome errado devolveria ENOENT e a
fala sumiria com o sintetizador tendo funcionado perfeitamente.

O eco continua igual, e continua importando: entre o Node e este processo há
duas conversões de codificação, e "Conceição" pode chegar como "Concei??o" sem
erro nenhum. Com o eco, o servidor compara com o que mandou e sabe.

Uso:  python -u ponte/voz.py     (lê URNA_VOZ_PASTA, URNA_VOZ_NOME e
                                  URNA_VOZ_VELOCIDADE do ambiente)
"""
from __future__ import annotations

import asyncio
import os
import sys

VOZ_PADRAO = "pt-BR-FranciscaNeural"

# Quanto o painel soma por ponto da escala dele, e onde a escala começa.
#
# O painel fala de -10 a 10, com o 0 querendo dizer "o ritmo de sempre" — é o
# que o campo promete a quem o arrasta. No edge-tts "o ritmo de sempre" é +8%,
# que é o padrão do `tiktok-live-horse`, e não +0%: a +0% a voz neural fala
# devagar de um jeito que soa solene demais para anunciar quem chegou na live.
RITMO_BASE = 8
RITMO_POR_PONTO = 2

# +3Hz de tom, do horse. Não é enfeite: é o que faz a voz soar animada em vez
# de neutra, e é a diferença que se ouve entre "narrador" e "leitor de tela".
TOM = "+3Hz"


def taxa(velocidade: int) -> str:
    """A velocidade do painel (-10 a 10) no formato que o edge-tts entende."""
    return f"{RITMO_BASE + RITMO_POR_PONTO * velocidade:+d}%"


def falar(texto: str, voz: str, ritmo: str, destino: str) -> None:
    """Sintetiza UMA frase para `destino`.

    A escrita é atômica de propósito. O `save` da edge-tts baixa o áudio pela
    rede, e uma conexão que cai no meio da frase deixa um MP3 truncado — que o
    servidor acharia em cache depois e tocaria para sempre, porque do lado dele
    um arquivo que existe é um arquivo bom. Escrever num nome de rascunho e só
    renomear no fim faz o cache só ver frase inteira.
    """
    import edge_tts  # importado aqui dentro para o `--ajuda` não pagar a partida

    rascunho = f"{destino}.parcial"
    try:
        comunicador = edge_tts.Communicate(texto, voz, rate=ritmo, pitch=TOM)
        asyncio.run(comunicador.save(rascunho))
        os.replace(rascunho, destino)
    except BaseException:
        apagar(rascunho)
        raise


def apagar(caminho: str) -> None:
    try:
        os.remove(caminho)
    except OSError:
        pass


def sintetizar(texto: str, voz: str, ritmo: str, destino: str) -> None:
    """Sintetiza com a voz pedida — e, se ela não existir mais, com a padrão.

    A lista de vozes do edge-tts muda sem avisar: voz nova entra, voz antiga
    sai, e a que o Leonardo escolheu no painel pode simplesmente não existir
    numa terça-feira. O horse trata isso tentando de novo com a voz padrão, e é
    o comportamento certo: melhor falar com a voz de sempre do que ficar mudo
    por causa de um nome que envelheceu.

    O degrau seguinte — o SAPI — não está aqui, e é de propósito: quem cuida de
    processo é o `server/voz.js`, que já sabe subir, derrubar e ressuscitar o
    PowerShell. Duplicar essa responsabilidade em Python daria dois donos para
    o mesmo processo, e o dia em que discordassem sobraria um sintetizador
    pendurado na máquina.
    """
    try:
        falar(texto, voz, ritmo, destino)
        return
    except Exception as e:  # noqa: BLE001 — a frase não pode derrubar o worker
        if voz == VOZ_PADRAO:
            raise
        registrar(f"a voz {voz} falhou ({e}); tentando {VOZ_PADRAO}")
    falar(texto, VOZ_PADRAO, ritmo, destino)


def registrar(mensagem: str) -> None:
    """Log no stderr. O stdout é SÓ protocolo — misturar os dois faz o Node
    tentar ler um aviso como se fosse uma resposta de síntese."""
    print(f"[voz.py] {mensagem}", file=sys.stderr, flush=True)


def responder(linha: str) -> None:
    sys.stdout.write(linha + "\n")
    sys.stdout.flush()


def numero_do_ambiente(nome: str, padrao: int = 0) -> int:
    """Um inteiro do ambiente, ou o padrão — sem derrubar o worker por lixo.

    O valor vem de um campo de painel que o Leonardo pode ter salvado como
    texto. Um `int()` cru numa variável dessas mataria o processo na subida, e
    o narrador ficaria mudo a noite inteira por causa de um caractere.
    """
    bruto = (os.environ.get(nome) or "").strip()
    if not bruto:
        return padrao
    try:
        return int(bruto)
    except ValueError:
        registrar(f"{nome}={bruto!r} não é um número; usando {padrao}")
        return padrao


def main() -> int:
    # UTF-8 nos dois sentidos, sem BOM, e `\n` de verdade.
    #
    # O padrão do Windows para um pipe é a página de código do sistema, e é por
    # ele que "Conceição" vira "Concei??o" sem erro nenhum. O `newline` também
    # não é detalhe: sem ele o Windows traduz cada `\n` para `\r\n`, e embora o
    # lado Node já aceite os dois, um protocolo que depende de o outro lado ser
    # tolerante é um protocolo que quebra no dia em que alguém trocar o leitor.
    for fluxo in (sys.stdin, sys.stdout):
        fluxo.reconfigure(encoding="utf-8", newline="\n")

    pasta = (os.environ.get("URNA_VOZ_PASTA") or "").strip()
    if not pasta:
        registrar("URNA_VOZ_PASTA não foi definida — não sei onde escrever o áudio")
        return 2
    os.makedirs(pasta, exist_ok=True)

    voz = (os.environ.get("URNA_VOZ_NOME") or "").strip() or VOZ_PADRAO
    ritmo = taxa(numero_do_ambiente("URNA_VOZ_VELOCIDADE"))

    # A voz escolhida vai junto: o painel precisa poder MOSTRAR qual está no
    # ar, senão um dia o Leonardo ouve outra voz e não tem onde descobrir por
    # quê. É também o único sinal de que o worker terminou de subir.
    responder(f"pronto\t{voz}")

    for linha in sys.stdin:
        linha = linha.rstrip("\n")
        if not linha:
            continue
        corte = linha.find("\t")
        # Sem TAB não há id: é linha corrompida, e não uma frase. O mesmo
        # critério do `voz.ps1` — o id é o nome do arquivo, e um id inventado
        # escreveria em qualquer lugar.
        if corte < 1:
            continue

        identificador, texto = linha[:corte], linha[corte + 1:]
        destino = os.path.join(pasta, f"{identificador}.mp3")
        try:
            sintetizar(texto, voz, ritmo, destino)
            responder(f"ok\t{identificador}\tmp3\t{texto}")
        except Exception as e:  # noqa: BLE001 — uma frase ruim não derruba a live
            apagar(destino)
            registrar(f"não consegui falar {texto!r}: {e}")
            responder(f"erro\t{identificador}\t{type(e).__name__}: {e}")

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(0)
