<#
  O sintetizador de fala do Windows, falado pelo servidor.

  Por que PowerShell, e não uma biblioteca: o Node não tem voz, e a
  `speechSynthesis` do navegador NÃO funciona dentro do OBS — o CEF que ele
  embarca não traz motor de fala (getVoices() devolve lista vazia para
  sempre) e o áudio dela nem é capturado com "Control audio via OBS". O que o
  OBS captura é um <audio>, então o som precisa existir como arquivo. Quem o
  produz é o sintetizador que já vem instalado em qualquer Windows que rode
  OBS: zero dependências, e voz pt-BR de fábrica.

  Este processo é de VIDA LONGA, e isso não é detalhe de desempenho. Um
  processo novo leva ~1,9 s só para carregar o .NET e a voz — quase dois
  segundos entre alguém seguir e a narração sair, que no meio de uma live é
  uma eternidade. Reaproveitado, cada frase custa ~90 ms.

  O protocolo é uma linha por frase, em UTF-8, separada por TAB:

    entrada   <id>\t<voz>\t<texto>
    saída     pronto\t<voz>
              ok\t<id>\t<wav>\t<texto>      (o texto volta como ECO)
              erro\t<id>\t<motivo>

  A `voz` na LINHA é o que permite o rodízio de duas vozes caber numa partida
  só deste processo. Ela poderia vir do ambiente, na subida — e era assim —,
  mas aí trocar de voz exigiria derrubar e subir o worker, que custa ~1,9 s:
  numa live movimentada, dois segundos por nome anunciado é a fila de fala
  nunca alcançando a live.

  O campo vazio quer dizer "fala com a voz deste processo". É o que o servidor
  manda para a voz de reserva — as vozes do rodízio são neurais, e nenhuma
  delas existe no SAPI —, e é o que um `echo` de teste manda.

  A extensão vai na resposta porque agora há DOIS sintetizadores: este escreve
  `.wav`, e o neural, em `ponte/voz.py`, escreve `.mp3`. Quem lê o arquivo é o
  servidor, e ele não pode adivinhar — um `readFile` no nome errado devolveria
  ENOENT e a fala sumiria com o sintetizador tendo funcionado perfeitamente.

  O eco existe para o outro lado poder conferir que o acento chegou inteiro.
  O stdin do Windows PowerShell 5.1 não é UTF-8 por padrão, e "Conceição"
  vira "Concei??o" sem erro nenhum — sai som, sai bonito, sai errado. Com o
  eco, o servidor compara byte a byte e sabe.
#>

$ErrorActionPreference = 'Stop'

# Sem isto, o carregamento dos módulos do .NET cospe um registro de progresso
# em stderr — e o PowerShell serializa progresso como CLIXML, um XML de uma
# linha inteira por aviso. O console do servidor amanheceria coberto de
# "<Objs Version=..." a cada frase, escondendo o que interessa. O aviso de
# stderr continua existindo para erro de verdade; só o enfeite sai.
$ProgressPreference = 'SilentlyContinue'

# UTF-8 nos dois sentidos, sem BOM. Precisa vir antes de qualquer leitura,
# porque a codificação é lida no momento em que o fluxo é aberto.
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer

if ($env:URNA_VOZ_NOME) {
  try { $s.SelectVoice($env:URNA_VOZ_NOME) } catch { }
} else {
  # Sem voz escolhida, o padrão do Windows costuma ser a Zira, em inglês — e
  # um nome brasileiro lido com sotaque americano é pior do que não narrar.
  $br = $s.GetInstalledVoices() |
    Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'pt-BR' } |
    Select-Object -First 1
  if ($br) { $s.SelectVoice($br.VoiceInfo.Name) }
}

if ($env:URNA_VOZ_VELOCIDADE) {
  # -10 a 10 na escala do SAPI.
  try { $s.Rate = [int]$env:URNA_VOZ_VELOCIDADE } catch { }
}

$pasta = $env:URNA_VOZ_PASTA
$out = [Console]::Out

# A voz com que este processo nasceu, para voltar a ela quando a linha não
# escolher nenhuma. Guardada ANTE da primeira troca: `$s.Voice.Name` muda a
# cada `SelectVoice`, e depois da primeira frase com voz escolhida não haveria
# mais como saber qual era a da subida.
$vozDoProcesso = $s.Voice.Name

# A voz escolhida vai junto: o painel precisa poder MOSTRAR qual é, senão um
# dia o Leonardo ouve inglês no ar e não tem onde descobrir por quê.
$out.WriteLine("pronto`t$vozDoProcesso")

while ($true) {
  $linha = [Console]::In.ReadLine()
  if ($null -eq $linha) { break }   # stdin fechou: o servidor está saindo
  if ($linha.Length -eq 0) { continue }

  $corte = $linha.IndexOf("`t")
  if ($corte -lt 1) { continue }

  $id = $linha.Substring(0, $corte)
  $resto = $linha.Substring($corte + 1)

  # O segundo TAB separa a VOZ do texto. A ausência dele não é erro: é uma
  # linha que não escolhe voz, e ela fala com a deste processo.
  $corte2 = $resto.IndexOf("`t")
  if ($corte2 -lt 0) {
    $vozDaVez = $vozDoProcesso
    $texto = $resto
  } else {
    $pedida = $resto.Substring(0, $corte2).Trim()
    if ($pedida) { $vozDaVez = $pedida } else { $vozDaVez = $vozDoProcesso }
    $texto = $resto.Substring($corte2 + 1)
  }

  # Trocar de voz é barato; o que é caro é NASCER de novo, e não é o que
  # acontece aqui: este processo atende as duas vozes do rodízio sem sair do ar.
  #
  # A conferência contra a voz em uso evita um `SelectVoice` por frase, e o
  # `catch` vazio é o degrau de sempre: um nome que esta máquina não tem — as
  # vozes neurais, por exemplo — deixa a voz que já estava, e a frase sai.
  if ($vozDaVez -and $vozDaVez -ne $s.Voice.Name) {
    try { $s.SelectVoice($vozDaVez) } catch { }
  }

  try {
    $caminho = Join-Path $pasta "$id.wav"
    $s.SetOutputToWaveFile($caminho)
    $s.Speak($texto)
    # Fecha o arquivo. Sem isto o WAV fica com o cabeçalho de tamanho em
    # aberto até a PRÓXIMA frase, e o <audio> da página toca um arquivo
    # truncado — ou nenhum.
    $s.SetOutputToNull()
    $out.WriteLine("ok`t$id`twav`t$texto")
  } catch {
    $out.WriteLine("erro`t$id`t$($_.Exception.Message)")
  }
}

$s.Dispose()
