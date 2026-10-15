"""A ponte entre a LIVE do TikTok e o motor em Node.

Este arquivo existe por um motivo só: a biblioteca `TikTokLive`, que é a única
coisa pronta que sabe falar com a live, só existe em Python. O resto do sistema
é Node e não tem nenhuma dependência — e continua não tendo, porque este
processo é separado, descartável, e fala por uma linha de comando.

O contrato inteiro cabe em duas regras:

  1. Cada evento é UMA linha de JSON no stdout, terminada em `\\n`.
  2. O que não for evento é log, e log vai para o stderr.

O Node do outro lado não confia em nada disto: ele ignora o que não consegue
ler e passa tudo pela mesma normalização que o simulador usa. Um bug aqui não
consegue contar voto errado — no máximo, faz um evento não chegar.

As armadilhas abaixo foram pagas no projeto `tiktok-live-horse`, que roda em
LIVE de verdade, e estão repetidas aqui de propósito:

  1. `client.start()` NÃO bloqueia — ele devolve a Task na hora, e num laço de
     reconexão isso vira uma rajada de conexões que estoura o rate limit do
     servidor de assinatura (HTTP 429). Quem bloqueia até o websocket fechar é
     `client.connect()`.
  2. O cliente não se reutiliza: depois que cai, cada tentativa monta um
     cliente NOVO.
  3. `client.close()` faz `run_until_complete` num laço já rodando e derruba a
     task com RuntimeError. Só se usa `disconnect()`.
  4. Na v7 o comentário vem em `event.content`, o streak de presente em
     `event.streaking` / `event.repeat_count`, e `event.gift` só resolve com
     `fetch_gift_info=True`.

   python -u ponte/tiktok.py --usuario NOME_DA_LIVE
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import random
import sys
import time

from TikTokLive import TikTokLiveClient
from TikTokLive.client.errors import (
    UserNotFoundError,
    UserOfflineError,
    WebcastBlockedError,
)
from TikTokLive.events import (
    CommentEvent,
    ConnectEvent,
    DisconnectEvent,
    FollowEvent,
    GiftEvent,
    JoinEvent,
    LikeEvent,
    LiveEndEvent,
)

BACKOFF_INICIAL = 5.0
BACKOFF_MAX = 60.0
DORMIR_OFFLINE = 30.0
DORMIR_BLOQUEADO = 60.0

# Quantas curtidas seguidas viram um gesto. É o MESMO número do narrador em
# `server/narracao.js` — e tem que ser, porque é ele que decide se o evento
# chega lá ou não. Um abaixo do outro seria um narrador mudo sem erro nenhum.
LIMIAR_CURTIDA = 5

log = logging.getLogger("ponte")


def emitir(evento: dict) -> None:
    """Uma linha de JSON no stdout. `flush` porque o Node está esperando."""
    sys.stdout.write(json.dumps(evento, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def status(conectada: bool, detalhe: str, fim: bool = False) -> None:
    """O estado da ponte, para o painel.

    `fim=True` quer dizer "não me levante de novo": é o que a ponte diz quando
    o problema não se conserta tentando — o @ errado, por exemplo. Sem isto o
    Node levantaria a ponte a cada segundo, gastaria a cota do servidor de
    assinatura e tomaria um 429 que derrubaria também a tentativa CERTA, feita
    depois de o Leonardo corrigir o nome no painel.
    """
    linha = {"ponte": "status", "conectada": conectada, "detalhe": detalhe}
    if fim:
        linha["fim"] = True
    emitir(linha)


def identidade(evento) -> tuple[str, str]:
    """(usuário, apelido) de um evento.

    O `user` vem `None` em alguns eventos de curtida — o TikTok para de mandar
    o autor depois de muitas curtidas seguidas —, e por isso tudo aqui é
    `getattr` com padrão. Um `evento.user.unique_id` direto derrubaria o
    handler inteiro, e com ele a conexão.
    """
    usuario = getattr(evento, "user", None)
    bruto = (
        getattr(usuario, "unique_id", None)
        or getattr(usuario, "display_id", None)
        or ""
    )
    apelido = getattr(usuario, "nickname", None) or bruto
    return str(bruto), str(apelido)


def agora_ms() -> int:
    return int(time.time() * 1000)


async def correr(usuario: str) -> None:
    """Conecta, e reconecta para sempre, até o processo ser morto."""
    backoff = BACKOFF_INICIAL

    while True:
        cliente = None
        try:
            log.info("conectando na live de @%s…", usuario)
            # Cliente NOVO a cada tentativa: um que caiu não volta a funcionar.
            cliente = TikTokLiveClient(unique_id=f"@{usuario}")

            @cliente.on(ConnectEvent)
            async def ao_conectar(evento: ConnectEvent) -> None:
                status(True, f"na live de @{getattr(evento, 'unique_id', usuario)}")

            @cliente.on(DisconnectEvent)
            async def ao_desconectar(evento: DisconnectEvent) -> None:
                log.warning("desconectado da live")

            @cliente.on(LiveEndEvent)
            async def ao_encerrar(evento: LiveEndEvent) -> None:
                # A live acabou: a fonte continua de pé, esperando a próxima.
                status(False, "a live encerrou — esperando a próxima")

            @cliente.on(GiftEvent)
            async def ao_presentear(evento: GiftEvent) -> None:
                presente = evento.gift
                if presente is None:
                    # Presente fora do catálogo: sem ele não há como saber
                    # QUANTO vale, e chutar é contar errado.
                    log.warning("presente sem catálogo, ignorado")
                    return
                # No meio de um streak, só o evento final traz a contagem
                # cheia. Contar os parciais multiplicaria o mesmo presente.
                if getattr(evento, "streaking", False):
                    return
                bruto, apelido = identidade(evento)
                emitir({
                    "tipo": "presente",
                    "plataforma": "tiktok",
                    "userId": bruto,
                    "usuario": apelido,
                    "giftId": str(getattr(presente, "id", "") or ""),
                    "giftNome": str(getattr(presente, "name", "") or ""),
                    "combo": max(1, int(getattr(evento, "repeat_count", 1) or 1)),
                    "comboIndex": 0,
                    "em": agora_ms(),
                })

            @cliente.on(FollowEvent)
            async def ao_seguir(evento: FollowEvent) -> None:
                bruto, apelido = identidade(evento)
                emitir({
                    "tipo": "seguidor", "plataforma": "tiktok",
                    "userId": bruto, "usuario": apelido, "em": agora_ms(),
                })

            @cliente.on(JoinEvent)
            async def ao_entrar(evento: JoinEvent) -> None:
                bruto, apelido = identidade(evento)
                emitir({
                    "tipo": "entrada", "plataforma": "tiktok",
                    "userId": bruto, "usuario": apelido, "em": agora_ms(),
                })

            @cliente.on(CommentEvent)
            async def ao_comentar(evento: CommentEvent) -> None:
                """
                O que alguém ESCREVEU no chat.

                Ele não é um evento social: não merece fala, não conta voto
                sozinho e não aparece em lugar nenhum da tela. O que ele é, é a
                RESPOSTA — é por aqui que o espectador decide a urna de um
                presente que o painel não mapeia, quando o presente não achou
                urna e ficou esperando o número.

                Vai tudo o que chega, sem filtro: quem decide se aquele texto
                interessa é o servidor, que é quem sabe quais presentes estão
                esperando e de quem. Filtrar aqui por "parece um número" seria
                duplicar a regra em dois lugares — e o dia em que as duas
                discordassem, o voto sumiria no meio do caminho sem erro
                nenhum.
                """
                bruto, apelido = identidade(evento)
                emitir({
                    "tipo": "comentario", "plataforma": "tiktok",
                    "userId": bruto, "usuario": apelido,
                    "texto": str(getattr(evento, "content", "") or ""),
                    "em": agora_ms(),
                })

            @cliente.on(LikeEvent)
            async def ao_curtir(evento: LikeEvent) -> None:
                """
                Curtida só vira evento quando vira GESTO.

                O TikTok manda uma curtida por toque, e uma pessoa animada dá
                dezenas. Emitir cada uma encheria a fila do narrador com o
                mesmo nome e calaria todo mundo que viesse depois. Abaixo do
                limiar não sai evento — e o limiar é o mesmo do narrador, não
                um número parecido escolhido aqui.
                """
                quantas = int(getattr(evento, "count", 0) or 0)
                if quantas < LIMIAR_CURTIDA:
                    return
                bruto, apelido = identidade(evento)
                emitir({
                    "tipo": "curtida", "plataforma": "tiktok",
                    "userId": bruto, "usuario": apelido,
                    "quantidade": quantas, "em": agora_ms(),
                })

            # `connect()` só retorna quando o websocket fecha. NÃO trocar por
            # `start()`: ele volta na hora e o laço vira uma rajada de
            # conexões que estoura o rate limit (HTTP 429).
            await cliente.connect(
                fetch_room_info=False, fetch_gift_info=True, fetch_live_check=True,
            )
            backoff = BACKOFF_INICIAL

        except UserNotFoundError:
            # @ errado não se conserta reconectando; insistir só gasta cota.
            status(
                False,
                f"não existe usuário @{usuario} no TikTok — confira o nome na aba Integração",
                fim=True,
            )
            log.error("usuário @%s não existe", usuario)
            return

        except UserOfflineError:
            status(False, f"a live de @{usuario} está offline — esperando começar")
            await descartar(cliente)
            await asyncio.sleep(DORMIR_OFFLINE)
            continue

        except asyncio.CancelledError:
            await descartar(cliente)
            raise

        except Exception as e:  # noqa: BLE001 — a ponte não pode morrer por nada
            if "already running" in str(e):
                # Encerramento: a biblioteca tentou rodar um laço dentro de
                # outro. Não há o que reconectar.
                log.info("desconexão forçada (encerrando)")
                return
            if isinstance(e, WebcastBlockedError):
                status(False, f"o Webcast bloqueou a conexão — esperando {DORMIR_BLOQUEADO:.0f}s")
                await descartar(cliente)
                await asyncio.sleep(DORMIR_BLOQUEADO)
                continue
            espera = backoff * (0.5 + random.random())
            status(False, f"conexão caiu ({type(e).__name__}) — tentando em {espera:.0f}s")
            log.warning("conexão interrompida: %s", e)
            await descartar(cliente)
            await asyncio.sleep(espera)
            backoff = min(BACKOFF_MAX, backoff * 2)
            continue

        # Chegou aqui porque o websocket fechou sem exceção. O aviso já saiu
        # no handler; aqui só se decide tentar de novo.
        await descartar(cliente)
        espera = backoff * (0.5 + random.random())
        status(False, f"a conexão fechou — tentando em {espera:.0f}s")
        await asyncio.sleep(espera)
        backoff = min(BACKOFF_MAX, backoff * 2)


async def descartar(cliente) -> None:
    """Só `disconnect()`.

    `close()` faria `run_until_complete` num laço já rodando e mataria a task
    com RuntimeError — e a ponte morreria em silêncio no meio da live.
    """
    if cliente is None:
        return
    try:
        await cliente.disconnect()
    except Exception:  # noqa: BLE001
        log.debug("falha ao desconectar", exc_info=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Ponte TikTok LIVE → JSON por linha")
    parser.add_argument("--usuario", required=True, help="o @ da live, sem arroba")
    args = parser.parse_args()

    # O log vai para o stderr, e o stdout fica SÓ para evento. Misturar os dois
    # é o defeito que faz o Node tentar ler "INFO:..." como JSON.
    logging.basicConfig(
        level=logging.INFO,
        stream=sys.stderr,
        format="%(levelname)s:%(name)s:%(message)s",
    )

    usuario = args.usuario.strip().lstrip("@")
    try:
        asyncio.run(correr(usuario))
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
