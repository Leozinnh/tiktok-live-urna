# Documentação — Live Vote Arena

Este arquivo é para quem vai **mexer** no projeto. O `README.md` é para quem
vai **usar**. Aqui está onde cada coisa mora, por que ela mora ali, como um
voto anda de ponta a ponta, e quais são as armadilhas que já custaram tempo.

Se você é o Leonardo voltando depois de um mês: leia
[Estado atual](#estado-atual) primeiro e depois
[A receita de cada mudança comum](#a-receita-de-cada-mudança-comum).

---

## O que é isto, em um parágrafo

Uma cena para o OBS capturar em **1080×1920**, com duas urnas eletrônicas
brasileiras de verdade no desenho. Cada presente da sua live do TikTok vira
**um voto**, e cada voto é encenado: uma **mão humana** aparece, digita o
número na urna, aperta CONFIRMA, e a cédula de papel cai na boca da urna. O
placar sobe quando a cédula cai — de propósito mais devagar que o servidor.

Tudo em HTML, CSS e JavaScript puros. **Sem Three.js, Unity ou Unreal.** O
servidor é Node sem uma única dependência instalada.

---

## Como rodar

```powershell
cd C:\xampp\htdocs\tiktok-live-urna

npm start          # sobe o servidor
npm run dev        # sobe e recarrega sozinho quando um arquivo do servidor muda
npm run reiniciar  # derruba quem está na porta 3000 e sobe de novo
npm test           # a suíte inteira (863 testes, poucos segundos)
```

| Endereço | O que é |
|---|---|
| <http://localhost:3000> | **A tela do ar.** É esta que o OBS captura. Zero botões. |
| <http://localhost:3000/admin> | O painel, em outra aba. Nada dele entra no quadro. |

O painel **não é** uma rota escondida nem um modo: é uma página separada, e
há um teste que varre os módulos da tela do ar para prender isso.

---

## O caminho de um voto

Vale ler esta seção inteira antes de mexer em qualquer coisa. Quase toda
decisão estranha do projeto sai daqui.

```
  TikTok LIVE  ──┐
                 ├──► FONTE ──► HUB ──► TALLY ──► BANCO
  Painel (teste)─┘                │        │
                                  │        └──► vote.counted
                                  │             tally.update
                                  └──► vote.animate ──► FILA ──► MÃO
```

**1. A fonte.** De onde vêm os presentes. Há duas, e o painel escolhe qual
(aba **Integração**): o `simulador` e o `tiktok` de verdade (pela ponte em
Python). Quem troca uma pela outra sem reiniciar o servidor é
`server/sources/troca.js` — o hub recebe **uma** fonte quando nasce, e a
troca acontece por baixo dele (`server/sources/base.js` é o contrato).

O ponto que importa: **o modo de teste não é um atalho.** O botão do painel
manda um `sim.gift` para o servidor, e o servidor o trata como trataria o
presente de qualquer pessoa. É a mesma estrada. O que entra por ali fica
gravado com a origem `simulador`, então quem olhar os votos depois sabe de
onde cada um veio.

**Voto que não vem de presente.** Nem todo voto chega por um presente
mapeado. São **três** estradas, e todas desembocam no mesmo `tally.contar`:

| Estrada | Quem manda | Quanto vale |
|---|---|---|
| Presente mapeado | a live, um presente que o painel conhece | `5 × round(√moedas)`, ou o `votos` escrito à mão |
| Presente resgatado | um presente fora do mapeamento, e o número que a pessoa **escreveu** no chat | o piso de 5 |
| Voto escrito no chat | a pessoa apenas **comentou** o nome ou o número de uma urna | 1 |

O multiplicador da urna (`urnas[].multiplicador`) e o combo valem para as
três, e é por isso que o `+N` que a tela mostra não é sempre o mesmo número.

Veja **"O voto escrito no chat"** mais adiante para as regras da terceira.

**2. O hub** (`server/hub.js`) traduz o presente em três mensagens, nesta
ordem, que é a da seção 4.5 da spec:

| Mensagem | Quando | Por quê |
|---|---|---|
| `vote.counted` | na hora | o fato aconteceu |
| `tally.update` | na hora | o placar do **servidor** sobe |
| `vote.animate` | na fila | o espetáculo, que pode esperar |

**3. O tally** (`server/tally.js`) é quem **conta**. Ele é a verdade. A tela
só mostra.

**4. O banco** (`server/db.js`) grava. Ele tem uma "muralha" em volta de toda
escrita: **falha ao gravar nunca interrompe a contagem.** Um `throw` no meio
de uma live derrubaria o processo e, com ele, a rodada inteira que só existia
na memória.

**5. A fila** (`public/js/anim/queue.js`) segura os votos que ainda vão ser
encenados. **Nenhum voto válido é descartado** — é uma promessa do projeto,
não um detalhe. Se a live receber 200 presentes de uma vez, a fila anda,
e o placar já subiu.

**6. A mão** (`public/js/hand-team.js`) pega o próximo voto e escolhe uma urna
livre (`public/js/urnas-livres.js`). Duas mãos, duas urnas, ao mesmo tempo.

**A urna é a máquina; o voto é do candidato** (2026-10-16). Quando a urna do
candidato está ocupada, o voto dele sai no gabinete do outro — e o que está
ESCRITO naquela tela é o voto, não a máquina. O número, o cargo, o candidato, a
contagem, a **cor** e a cédula impressa seguem o `destino` (a urna de quem
RECEBE o voto, ver `hand-actor.js`); a placa, o filete da base, o halo na mesa e
o LED das teclas continuam sendo os da máquina. O caso que apareceu no ar: o
voto do Flávio (22, azul) no gabinete do 13 (vermelho) saía inteiro vermelho —
etiqueta da mão, número grande da tela, dígitos e cédula. Nada disso errava a
contagem (o voto sempre foi contado no candidato certo), e é por isso que
passou: só se vê olhando a tela, e só quando a urna do candidato está ocupada.

A correção é de ESCOPO, e é a parte que vale saber: `--cor-urna` é uma variável
CSS, e `pintarCorDaTela` a escreve no elemento da TELA (e no da cédula), não na
raiz da urna. Como ela herda, o que está dentro da tela passa a ler a cor do
voto, e o gabinete — que está fora — continua a cor dele. Escrita na raiz, a cor
do candidato vestiria a máquina inteira, com a placa ainda dizendo 13. Sem cor
no estado (o repouso, ou um estado que não é voto), a variável é REMOVIDA e a
urna volta a ser ela mesma — sem isso ela ficaria com a cara do candidato
anterior até o próximo voto.

`tests/hand-actor.test.js` (o voto pelo caminho inteiro, com máquina e destino
diferentes) e `tests/cor-do-voto.test.js` (a herança e a limpeza no repouso)
prendem as duas metades; a sonda `node .superpowers/sonda/cor-do-voto.js 3311`
mede a cor COMPUTADA do dígito desenhado no gabinete emprestado, quadro a
quadro, e confere que o gabinete continuou vermelho.

### A parte contraintuitiva: a tela é mais lenta que o servidor

O placar da tela **não** sobe quando o presente chega. Ele sobe quando a
**cédula cai**. Isso parece um atraso a consertar e não é: é o que faz o
público ver o voto acontecer, em vez de ver um dígito pular sozinho.

Os dois números têm nomes diferentes de propósito — `contagem` é a tela,
`verdade` é o servidor — e a tela se corrige sozinha contra o servidor
sempre que **não há voto em voo**. Quem for mexer nisso precisa saber que a
diferença entre os dois é intencional.

---

## Mapa dos arquivos

### `public/js/` — o que roda no navegador

| Arquivo | O que faz |
|---|---|
| `ao-vivo.js` | Ponto de entrada da **tela do ar**. Amarra tudo. |
| `scene.js` | Monta o palco e escala para o tamanho da janela |
| `urna.js` | A urna: gabinete, tela, teclado e cédula. `markupTeclado` é pura |
| `urnas-livres.js` | Qual urna está livre para receber a próxima mão |
| `hand-actor.js` | A mão em cena: recebe um voto e o encena |
| `hand-team.js` | As duas mãos: quem pega o próximo voto da fila |
| `vote-sequence.js` | A coreografia de um voto, em passos |
| `placar.js` | O placar — sobe quando a cédula cai |
| `painel.js` | O rodapé: a fila sozinha, ou os **dois monitores** — ranking e últimos votos |
| `narrador.js` | A voz e a faixa: toca o áudio que o servidor gravou |
| `resultado.js` | O cartão de fim de rodada |
| `cronometro.js` | O relógio, que **obedece ao servidor** |
| `presentes.js` | O aviso de presente que entra na tela |
| `som.js` | Os sons da urna: as notas sintetizadas e o `confirm.mp3` do CONFIRMA |
| `config.js` | A configuração que chega do servidor |
| `net.js` | O canal WebSocket, dos dois lados |
| `admin.js` | Ponto de entrada do **painel** |
| `admin/abas.js` | As quatro abas, declaradas como **dado** |
| `admin/campos.js` | Desenha cada campo. Puro, testado sem navegador |
| `admin/medidores.js` | Os quatro números do alto do painel |
| `anim/timeline.js` | Linha do tempo com tweens nomeados |
| `anim/easing.js` | Curvas de aceleração |
| `anim/queue.js` | A fila |
| `hand/esqueleto.js` | O esqueleto da mão: **a fonte única dos pivôs** |
| `hand/hand-svg.js` | O desenho do SVG, **gerado** do esqueleto |
| `hand/poses.js` | As poses nomeadas (apontar, pressionar, segurar…) |

### `server/` — o que roda no Node

| Arquivo | O que faz |
|---|---|
| `index.js` | Servidor HTTP, sem dependências. Rotas, arquivos, upgrade do WS |
| `hub.js` | O canal ao vivo: quem recebe o quê |
| `tally.js` | A contagem e as rodadas — **a verdade** |
| `config.js` | Lê, **normaliza** e grava a configuração |
| `db.js` | O banco (SQLite pelo `node:sqlite`, escrito à mão) |
| `narracao.js` | As frases da voz: quem fala, quem fica quieto, e os marcadores |
| `log.js` | O log da live: console e um arquivo por dia |
| `espera.js` | A espera do número no chat, e a cobrança por voz |
| `voz.js` | A voz: os dois motores, o processo de cada um e o cache |
| `voz.ps1` | O sintetizador do Windows, falado por linhas de texto |
| `ws.js` | O protocolo WebSocket, escrito à mão |
| `porta.js` | Porta ocupada: quem está segurando e o que fazer |
| `reiniciar.js` | `npm run reiniciar` |
| `sources/base.js` | O contrato de uma fonte (+ `TIPOS_SOCIAIS`) |
| `sources/simulator.js` | O simulador — o que o painel dispara |
| `sources/tiktok.js` | A live de verdade, pela ponte em Python |
| `sources/troca.js` | A fonte que troca de fonte, sem reiniciar |

### `ponte/` — Python, e só quando precisa

| Arquivo | Precisa de | Para quê |
|---|---|---|
| `tiktok.py` | `pip install TikTokLive` | Receber os presentes da live de verdade |
| `voz.py` | `pip install edge-tts` | A voz **neural** |

As duas são **opcionais**. Sem elas o projeto continua inteiro: sem o
`edge-tts` a voz sai pela do Windows, e sem o `TikTokLive` o simulador
continua funcionando.

---

## A configuração

Uma configuração, um arquivo, um dono.

```
config/local.json          o arquivo do Leonardo (nasce vazio)
server/config.js           o PADRAO, o normalizar e o mesclar
        │
        │  GET  /config/local.json   (o painel lê)
        │  WS   config.update        (o painel grava)
        ▼
   o servidor, que é quem decide
```

**`PADRAO`** é a lista do que o servidor conhece. **`normalizar`** pega o que
veio do arquivo e força tudo para dentro dessa lista: campo desconhecido cai
fora, número fora da faixa é limitado, e o que não dá para consertar volta ao
padrão **com um aviso** — e o aviso aparece no painel, em vez de o operador
achar que salvou o que não salvou.

**`mesclar`** é o remendo recursivo: o que veio por cima vence campo a campo.
**Listas substituem** em vez de serem remendadas por índice — remendar por
índice é o caminho mais curto para o presente 3 do Leonardo virar o presente
3 do padrão sem ninguém entender por quê.

### A regra que governa o painel

> **Só entra campo que o servidor HONRA.**

Seria fácil pôr um "ícone da urna" na aba porque a spec o cita. Mas o
`normalizar` não conhece essa chave, e o campo viraria o pior defeito possível
desta tela: **o operador digita, o painel diz "salvo", e nada muda.**

`tests/admin-abas.test.js` prende as duas pontas: todo caminho declarado numa
aba tem que resolver contra o `PADRAO`. É o único teste da suíte que importa
código dos dois lados, e é de propósito — o defeito que ele pega mora na
costura.

### As quatro abas

| Aba | O que edita |
|---|---|
| **Urnas** | Nome, número, cargo, partido, cores, multiplicador, retrato |
| **Rodada** | A duração. (A política de fechamento ainda não — ver [o que ficou de fora](#o-que-ficou-de-fora-de-propósito)) |
| **Teste** | Dispara presente, rajada, presente **sem urna** e o número no chat |
| **Integração** | Simulador ou TikTok ao vivo, e o tempo de espera do número |

Os campos vivem em `public/js/admin/abas.js`, **declarados como dado** — não
como marcação. É essa separação que deixa um teste conferir, sem navegador,
que todo caminho existe do outro lado.

**Eram sete, e três saíram em 2026-10-15** — Presentes, Animação e Textos.
Palavras do Leonardo: *"o admin as opcoes 'animacoes', 'presentes', 'textos'
sao inuteis!"*. Ele edita essas três direto no `config/local.json`, e uma aba
que o dono não usa envelhece sem ninguém notar.

O que saiu foi a **tela**, e não o recurso. `presentes.*`, `animacao.*`,
`placar.mensagem*` e `narracao.*` continuam no `normalizar` e continuam
valendo — só não há mais caminho de editá-los pelo navegador. Duas
consequências que valem saber:

- **A velocidade da mão ficou fixa no arquivo.** O campo `animacao.velocidade`
  era o único do painel que mandava `anim.speed` (mudava a mão na hora, sem
  gravar). Sem a aba, o listener saiu junto, e a mensagem `anim.speed`
  continua no protocolo sem ninguém que a mande. Mudar a velocidade agora pede
  reiniciar o servidor.
- **Os presentes só se cadastram pelo arquivo.** O mesmo vale para as frases
  da voz e o motor dela.

`tests/admin-abas.test.js` prende as duas metades do corte: as abas não
voltam sozinhas, e as chaves delas não somem junto com a tela.

---

## A voz

A voz sai pelo **servidor**, e não pela página. O motivo é concreto: **o
navegador que o OBS embarca não fala** — o CEF do OBS não traz motor de fala
(`getVoices()` devolve lista vazia para sempre), e o áudio dela nem é
capturado com "Control audio via OBS". O que o OBS captura é um `<audio>`.
Então o som precisa existir como **arquivo**.

### Dois motores

| Motor | Escreve | Precisa de | Soa |
|---|---|---|---|
| `edge` (**padrão**) | `.mp3` | Python + `edge-tts` + internet | Como gente |
| `sapi` | `.wav` | Nada além do Windows | Robótica |

Os dois vivem em `server/voz.js`, na tabela `MOTORES`. O lado Node trata os
dois igual, porque **os dois falam o mesmo protocolo**:

```
  entrada   <id>\t<voz>\t<texto>          (voz vazia = a do processo)
  saída     pronto\t<voz>                 (uma vez, na subida)
            ok\t<id>\t<ext>\t<texto>      (o texto volta como ECO)
            erro\t<id>\t<motivo>
```

A **extensão** vai na resposta porque são dois sintetizadores e o servidor não
pode adivinhar: um `readFile` no nome errado devolveria `ENOENT` e a fala
sumiria com o sintetizador tendo funcionado perfeitamente.

A **voz vai na linha**, e não no ambiente do processo, por causa do rodízio
(abaixo): o processo é de vida longa, e trocar de voz por frase reiniciando-o
custaria 1,9 s por fala. O `pronto` responde qual voz o processo assumiu ao
subir — é ele que o painel mostra, e é o que diz que a voz pedida existe
naquele motor.

O **eco** existe para conferir que o acento chegou inteiro. O stdin do Windows
PowerShell 5.1 não é UTF-8 por padrão, e "Conceição" vira "Concei??o" **sem
erro nenhum** — sai som, sai bonito, sai errado.

### O processo é de vida longa

Um processo novo leva **~1,9 s** só para carregar o .NET e a voz. Quase dois
segundos entre alguém seguir e a narração sair, que no meio de uma live é uma
eternidade. Reaproveitado, cada frase custa **~90 ms**.

É por isso que `voz.js` mantém um `Map` de máquinas (uma por motor), cada uma
com o seu processo, a sua espera e o seu estado.

### O rodízio de vozes

A live fala com **duas vozes**, alternando a cada frase:
`pt-BR-FranciscaNeural` e `pt-BR-AntonioNeural`, na ordem em que estão em
`narracao.vozes` (`config/local.json`). O motivo é o mesmo do projeto dos
cavalos, de onde a ideia veio: uma voz só, dizendo quarenta frases por noite,
soa automática. Duas soam como duas pessoas acompanhando a live.

Três decisões que valem o registro:

- **o rodízio não é por evento, é por FRASE.** Duas pessoas que chegam juntas
  são anunciadas uma por cada voz. Amarrar a voz à pessoa faria o espectador
  ouvir sempre a mesma, que é o efeito que se quer evitar;
- **a voz entra na CHAVE do cache**, e por isso a mesma frase dita por duas
  vozes são dois arquivos. Sem isso, a segunda voz receberia o áudio da
  primeira — o rodízio existiria na conta e não no ouvido;
- **a lista VAZIA é uma decisão**, e não um campo esquecido: `"vozes": []`
  quer dizer "uma voz só, a do campo `voz`". É a mesma regra de
  `narracao.falas`, e é o que permite desligar o rodízio sem apagar `voz`.

O processo do sintetizador **sobrevive à troca de voz**: o que muda por frase
é só o campo da linha. O processo só é reiniciado quando muda algo que é dele
— o motor, a velocidade, ou a voz quando ela é fixa (sem rodízio). É o que
`assinaturaDe` compara.

A queda para o outro motor manda a voz **vazia** de propósito: as vozes
neurais não existem no SAPI, e `SelectVoice` com um nome que ele não conhece
lança em toda frase — a reserva ficaria muda justamente quando é chamada.

### A queda para o outro motor

Se o motor escolhido falhar, `voz.js` avisa **uma vez** no console e refaz a
frase com `MOTOR_RESERVA` (`sapi`). A troca é **por frase**: a live não para.

> **A chave do cache NÃO inclui o motor.** Isso é de propósito. Quem separa os
> dois no disco é a **extensão** (`<chave>.mp3` contra `<chave>.wav`). Pôr o
> motor na chave faria o edge ressintetizar — e refalhar — toda frase que o
> SAPI já tinha coberto.

### A armadilha que já custou tempo

O `p.on('error')` do processo limpava `maq.processo` mas **não resolvia a
promessa de subida**. Resultado: `await subir()` esperava para sempre e a
frase nunca chegava ao `setTimeout` — um narrador **permanentemente mudo**, em
vez de cair para a reserva. O conserto foi `maq.espera` (a promessa) mais
`maq.aguardando` (`{ ok, falha }`), e `recusarPartida()` chamada de todos os
caminhos de falha.

Quem mexer no ciclo de vida do processo precisa saber disso.

### O que merece fala

`server/narracao.js` decide **uma** coisa, e é puro: dado um evento, sai fala
ou sai silêncio. A parte difícil não é falar — é **calar**. Numa live
movimentada chegam dezenas de eventos por minuto, e um narrador que fala tudo
vira uma metralhadora de nomes que ninguém entende.

| Evento | Fala? | Por quê |
|---|---|---|
| `seguidor`, `entrada`, `compartilhou`, `assinatura` | sim | É a pessoa sendo vista: quem segue precisa ouvir que valeu |
| `curtida` | só quando vira **gesto** | 20 toques em 3 s (o número do `tiktok-live-horse`). Uma curtida solta encheria a fila de "valeu pela curtida" |
| `presente` **contado** | sim | É o ÚNICO evento que conta voto, e o único que custou dinheiro a quem mandou |
| `presente` **órfão** | **não** | Ele não virou voto. Quem fala por ele é a cobrança da espera, 15 s depois, dizendo o que fazer |
| `comentario` | não | O narrador viraria um leitor de chat |

O `{vezes}` do presente é o combo, e chega pronto: `5x ` quando a pessoa
mandou cinco, e **vazio** quando mandou um — "1x Rosa" não é como uma pessoa
fala. A convenção vem do projeto dos cavalos, de onde as frases vieram.

O `{urna}` é o nome de quem recebeu o voto, e nenhuma frase põe artigo na
frente dele: as urnas são pessoas, e "a {urna} agradece" sairia errado para
metade dos nomes.

Cada tipo tem um **cooldown por pessoa** (um minuto; o do presente, trinta
segundos), e é ele que impede quem sai e volta do TikTok de ser anunciado
duas vezes. A fala escolhida sai de um **baralho**: as frases de um tipo são
ditas todas, em ordem sorteada, antes de qualquer uma repetir.

A fila da fala (`hub.js`) tem **teto de 6**. Cheia, ela recusa o anúncio
seguinte em vez de crescer — a voz ficaria para trás e anunciaria quem chegou
dois minutos atrás. A recusa é barata porque a fala é a parte que envelhece, e
o voto **não passa** por essa fila: nenhuma recusa custa contagem.

**A cobrança é a exceção** (`narrar(…, { essencial: true })`). Ela já foi
retirada da espera antes de virar fala, então recusá-la não é adiá-la: é
perdê-la — e com ela a única explicação que quem mandou um presente órfão
teria para ouvir.

---

## A espera do número no chat

Um presente **mapeado** no painel já sabe para onde vai. Um presente que a
TikTok inventou ontem, ou que o Leonardo ainda não cadastrou, **não sabe** — e
antes ele simplesmente sumia: sem voto, sem fala, sem nada na tela. Quem
mandou ficava sem entender por que o presente caro não fez nada.

Agora ele abre uma **janela** (`server/espera.js`):

1. o presente guarda o lugar dele na fila;
2. o espectador tem `integracao.esperaNumeroSegundos` para escrever o número
   no chat (padrão 15 s, editável na aba **Integração**);
3. se ele escrever, o voto sai e vai para a urna daquele número;
4. se ele não escrever, o narrador **cobra por voz** — a fala `espera`, que é
   a única do sistema que responde a um **silêncio**, e não a um evento.

O botão **"presente desconhecido"** na aba Teste dispara exatamente isso. Ele
escolhe um `giftId` que **não está** em nenhum mapeamento (`giftIdSemUrna`), e
sobe sozinho se o Leonardo cadastrar justamente aquele número — um id fixo
viraria um falso positivo no dia em que ele cadastrasse o 9999.

---

## O voto escrito no chat

Alguém escreve **"bolsonaro, 22, flavio e tal"** e o voto entra. Sem presente,
sem clique, sem resgate: o comentário em si vale 1 voto para a urna que ele
nomeia (`server/chat-voto.js`).

Ele passa pelas MESMAS peneiras que o número resgatado, porque é a mesma
pergunta — *qual urna esta pessoa está nomeando?* — e duas respostas
diferentes para a mesma pergunta é o defeito que este projeto mais teme:

- vale o **número** (`22`, `13`) e vale o **nome ou o apelido** da urna, sem
  acento e sem maiúscula (`flavio` acha `Flávio Bolsonaro`, cujo apelido é
  "Flavio");
- nome com menos de **4 letras** não vale, e há uma lista de palavras neutras
  (`PALAVRAS_NEUTRAS`) — "brasil", "vote", "presidente" — que não nomeiam
  ninguém: sem ela, "vote 22 no brasil" e "o brasil precisa" dariam votos a
  urnas diferentes;
- **duas** urnas citadas no mesmo comentário não valem nada. Na dúvida, o
  sistema fica quieto e deixa a pessoa escrever de novo;
- **`1222` e `2022` não são o 22.** O número só conta como palavra inteira.

Três regras de convivência, e cada uma existe por um motivo:

| Regra | Por quê |
|---|---|
| **1 voto por pessoa a cada 3 s** (`INTERVALO_DO_CHAT_MS`) | É o que impede um único espectador de virar uma máquina de votos escrevendo "22" cinquenta vezes |
| O voto do chat **não é narrado** | A fila de voz é o gargalo da cena; um voto de 1 ponto não pode atrasar a fala de um presente de 50 |
| Ele é contado **depois** do resgate | Quem escreve o número para resgatar o próprio presente não ganha um voto de chat de brinde |

A recusa **sempre** deixa linha no log (`⏱` para o intervalo, `⛔` para o
resto). Um comentário que não vira voto por não citar urna nenhuma é o único
caso calado — e é o caso normal: a maior parte do chat não é voto.

---

## O log da live

`server/log.js`, no formato do `tiktok-live-horse`: hora, nível, assunto e
texto. Sai **no console** e num arquivo por dia em `dados/logs/AAAA-MM-DD.log`
(que o `.gitignore` já cobre junto com `dados/`).

```
22:28:43 [INFO] live: 🎁 Painel mandou Rosa
22:28:43 [INFO] hub: ✅ Painel mandou Rosa para a Lula (+1 voto)
22:28:43 [INFO] voz: 🗣 "Lulinha ganhou um voto! Valeu, Painel!"
```

Ele nasceu de um defeito de verdade: **o Leonardo mandou uma Rosa pelo painel
e não falou nada.** O presente chegou, o motor recusou — a rodada estava
fechada —, e não havia um lugar no mundo que dissesse isso. Passou a haver.

Toda fala da voz sai no log **antes** de virar som (`🗣`), e o resto da
história tem linha própria:

| Linha | Quer dizer |
|---|---|
| `👋 👤 ❤️ 🔁 💎 🎁` | Um evento chegou da live, com quem e quanto |
| `✅ Fulano mandou 3x Rosa para a Urna 2 (+3 votos)` | O voto contou |
| `⛔ Rodada fechada: o presente Rosa de Fulano não contou` | O voto **não** contou, e por quê |
| `⏳ ... esperando o número da urna no chat` | Presente fora do mapeamento |
| `✅ Fulano votou no chat: 22 · Flavio (+1 voto)` | O comentário virou voto |
| `⏱ o voto do chat tem intervalo de 3s` | A pessoa escreveu de novo antes da hora |
| `🗣 "..."` | A frase que está indo ao ar |
| `🤐 silêncio: ...` | O narrador ficou quieto, e por quê |
| `⚠️ nenhuma tela conectada` | Ninguém ia ouvir a fala |
| `a voz falhou em "..."` | O sintetizador caiu; a faixa saiu sem áudio |
| `▶️ ⏰ 🧹 rodada` | A rodada abriu, fechou ou foi zerada |

A pergunta "por que não falou nada?" tem, agora, uma resposta escrita — e são
poucas as possibilidades: rodada fechada, narração desligada no painel, voz
quebrada, nenhuma tela conectada, fila cheia, ou cooldown da pessoa. Cada uma
delas deixa a sua linha.

---

## A cena

O cenário é uma SALA, e não um desenho, e quem manda em tudo é uma lâmpada
só — no teto, à frente da mesa. A parede é clara em cima e escura embaixo, a
quina do tampo pega a luz, a saia fica na sombra dele, o piso tem uma poça de
luz no meio e os quatro cantos escurecem. Os tokens de `tokens.css` dizem isso
um por um, e é a primeira coisa a consultar antes de mexer em qualquer cor
deles: quando alguém troca um valor sem saber de onde a luz vem, a peça fica
bonita sozinha e errada no conjunto.

**A urna é uma caixa.** O gabinete tem quatro faces desenhadas — frente, topo,
lateral e a sombra de contato —, e a profundidade é `--urna-profundidade`
(80px, contra 54 antes: a 22px de topo o olho não lê superfície, lê cartaz). A
lateral só existe de um lado, e é o `ladoVisivel()` do `urna.js` que decide
qual, a partir da posição e do giro da urna. **`.camada--urnas` declara
`transform-style: preserve-3d`**: sem isso o navegador achata a subárvore e as
duas urnas passam a mostrar exatamente a mesma face, o que parece certo em
cada uma e errado no par.

**As três faces ganharam luz própria** (2026-10-16), e a regra de como mexer
nelas é a que fecha o assunto: a forma e o degrau de valor entre frente, topo e
lateral já estavam certos, e o que faltava era a luz da sala em cada uma. Isso
entra sempre em `::before` / `::after` — **`::before`/`::after` novos, nenhuma
declaração do Leonardo reescrita** —, porque o fundo de cada face é um valor que
ele ajustou na mão e conferiu na foto. A camada nova é por CIMA, nunca no lugar.

Três defeitos de direção, um por face: a **lateral** era um degradê de 90° e SÓ,
então tinha o mesmo valor na aresta do tampo e na mesa — face de valor constante
não é superfície de pé, é adesivo colado na quina (`.urna__lado::before`, a luz
do teto caindo pela altura, o pé afundando, e o rebote laranja da mesa por baixo
da sombra); o **tampo** era claro e uniforme, e plano claro e uniforme lê como
papel, não como verniz (`.urna__topo::after`, o reflexo da lâmpada esticado no
sentido da **profundidade** — comprido lê como verniz, redondo leria como
lustre); e o **pé** tem os cantos redondos desenhados com a mesma cor de ponta a
ponta, quando é justamente onde a superfície curva para trás e chega menos luz
(`.urna__base::before`, os dois extremos escurecendo — é o que faz o contorno e
a luz contarem a mesma história).

`tests/css.test.js` prende as três coisas que, faltando, viram defeito de
verdade: a camada não participa do layout (`position: absolute` + `inset: 0`), a
camada não pega o clique (`pointer-events: none`) e as cores de fundo originais
das três faces continuam no arquivo. O valor de cada camada é gosto e muda com a
foto; a sonda é quem julga isso (`node .superpowers/sonda/urna.js <nome> 3311`).

**O placar são duas televisões penduradas na parede**, uma por candidato, e o
cronômetro é o relógio de parede acima delas. Não é enfeite: quem faz o olho
ler "aparelho" é o conjunto — a moldura fina com um queixo grosso embaixo
(onde ficam a marca `ARENA` e o LED de presença na cor do candidato), a luz da
tela vazando na parede cor-de-rosa em volta, o reflexo do vidro atravessando o
painel, a malha de subpixels RGB e as linhas de varredura na tela. As
opacidades da malha são baixas de propósito (0,03 a 0,06): listras finas num
vídeo são um moiré esperando a hora de aparecer na transmissão.

Duas medidas desta reforma estão presas por cópia e merecem atenção de quem
for mexer: o `inset` do `.cartao::after` (o vidro) repete o `padding` do
`.cartao`, porque o vidro cobre a tela e não o queixo; e o miolo do cartão
ficou 20px mais baixo por causa da moldura, com **10px de folga** entre o
rodapé e a borda de dentro. Se essa folga virar negativa, o `overflow: hidden`
corta o rodapé em silêncio.

Foi essa mesma folga que revelou outro defeito, e ele é mais antigo que a TV:
com o selo "na frente" no cartão de quem lidera e o nome mais longo da
configuração, o nome pedia 194px e recebia 140 — no ar, "FLAVIO BOLSON…". O
`.cartao__nome` passou a quebrar em duas linhas, e é a sonda que mostra isso,
não o olho.

**Os postes das laterais saíram** (2026-10-15). Eram duas colunas escuras que
"fechavam a composição" na referência, e no enquadramento de 9:16 liam como
duas barras pretas coladas na parede — nada a ver com a cena. Com eles saíram
os tokens `--cabine-poste` e `--cabine-poste-2`.

**A ficha do voto.** Quando alguém vota, sai do dedo da mão uma etiqueta com
duas linhas — quem votou, e o que aquilo foi: o desenho e o nome do presente,
ou o número que a pessoa escreveu no chat (`public/css/hand.css`,
`mao__badge`). Na ponta direita, o peso num selo de duas linhas: **`+5` sobre
`VOTOS`**, em maiúsculas espaçadas — e `+1` sobre `VOTO`, no singular, porque
uma etiqueta que diz "+1 votos" é a etiqueta contando errado na frente de todo
mundo. Depois do CONFIRMA o selo vira **`NO PLACAR`**, que é a informação que
o número sozinho não dava: o voto já entrou, não está a caminho. Um voto sem
peso nenhum esconde o selo (`mao__badge--sem-peso`) em vez de mostrar `+0`.

A etiqueta é **irmã** da mão, e não filha (`hand-svg.js`): dentro de `.mao` o
nome herdaria a rotação do pulso e a escala de 0,8 e sairia torto e ilegível
exatamente no quadro em que a mão pousa na tecla. A âncora é a borda DIREITA,
na ponta do dedo — por isso ela cresce para a esquerda, para longe da mão.

Ela é a mesma peça da faixa do presente, de propósito: mesmo raio de 30px
(contra os 999px das pílulas), mesmo fundo quase-preto, mesma lombada clara.
As duas falam do mesmo voto no mesmo segundo, e parecerem uma peça só é o que
faz a cena inteira ler como uma coisa em vez de duas.

Três armadilhas estão presas por comentário no CSS, e as três são invisíveis
até alguém mexer: **nada pode animar o `transform` da própria etiqueta** (o
`posicionar` reescreve o `--bx/--by` a cada quadro, e uma transição ali
deixaria a ficha atrás do dedo), então a entrada mora no `-conteudo` e o
reflexo que atravessa a chapa mora no `::after`; e a figura tem **largura fixa
no CSS**, porque a etiqueta é medida uma vez, no nascimento, e uma imagem
ainda não carregada mediria zero — a ficha sairia do enquadramento e ninguém
saberia por quê.

**A faixa da narração fica em cima do rodapé, e a altura é medida.** O painel
do rodapé tem uma linha quando só há ranking, duas quando há fila e nenhuma
quando não há voto nenhum; a faixa tem `bottom: calc(var(--rodape-altura,
186px) + 22px)`, e quem escreve a variável é o `painel.js`, a cada redesenho,
medindo o palco. Com o `bottom: 186px` fixo que existia antes, a lista de quem
mais presenteou crescia para cima e **passava por cima do aviso do presente**,
cortando a frase no meio — no ar.

E essa medida é **dividida pela escala do palco**. O `getBoundingClientRect`
devolve pixel de TELA, o `--rodape-altura` é lido pelo CSS em pixel de PALCO, e
o palco é desenhado em 1080x1920 e escalado para caber na janela (`scene.js`:
0,56 numa janela deitada, 0,38 conferindo). Sem a divisão, a mesma cena media
251px na sonda em tela cheia e **95px na janela pequena** — e a faixa descia
para dentro do painel, que é `z 60` contra o `z 50` dela: a camada de efeitos
sendo coberta pelo placar inferior, no ar, sem nada no console. É o mesmo
`paraCoordenadasDoPalco` da urna, aqui sem importar ninguém: a escala sai do
próprio retângulo. A conta é uma função pura (`alturaDoRodape`, no `painel.js`)
para dar para conferir sem navegador, e a medida é refeita em `resize` e em
`palco:redimensionado` — redimensionar troca a escala e invalida o número que
está na variável.

**A faixa do presente é pintada com a cor da urna.** Não existe mais o dourado
fixo: numa cena em que toda cor quer dizer uma urna — o placar, a etiqueta na
mão, o pop-up —, uma cor que não quer dizer nada é ruído. Quem escreve
`--narracao-cor` é o `narrador.js`, a cada fala, a partir do `presente.cor`
que o servidor já manda; ausente ou inválida, a propriedade é REMOVIDA e vale
a reserva cinza do CSS. A peneira (`COR_VALIDA`) é **importada** do
`popup-presente.js`, não copiada: os dois escrevem a mesma cor no `style`, e
duas cópias da expressão é uma cópia a mais para esquecer.

O que se mede, e como:

```powershell
node .superpowers/sonda/cenario.js antes           # parede, piso e mesa
node .superpowers/sonda/urna.js antes 3311         # as duas urnas, de perto
node .superpowers/sonda/placar.js antes 3311       # o relógio e as duas TVs
```

A `placar.js` tira a régua de tudo o que está acima da mesa, a folga do rodapé
de cada cartão e o pior caso do cabeçalho; e fotografa o alto do palco, o
queixo de uma TV e a malha de pixels ampliada. Precisa do servidor descartável
em `3311` — **nunca a `3000`**, que é a mesa do Leonardo.

---

## O rodapé

São **três estados**, e o rodapé escolhe sozinho entre eles:

| Estado | O que aparece |
|---|---|
| Ninguém presenteou | Nada. `.painel-area--vazio`, e nenhuma caixa no quadro |
| Tem gente na fila | **Um** aparelho só, de ponta a ponta: `NA FILA`, com o `+N` do que sobrou |
| Fila vazia, com histórico | **Dois** aparelhos lado a lado: `QUEM MAIS PRESENTEOU` e `ÚLTIMOS VOTOS` |

A troca é pelo mesmo fato que move a mão: enquanto há voto esperando, o que
interessa a quem assiste é quem vem a seguir; quando a fila esvazia, o que
interessa é o que já aconteceu.

**A fila manda.** O painel não guarda estado nenhum — ele desenha o que lhe
derem, e o `atualizarPainel()` de `ao-vivo.js` recalcula a partir da fila do
ator, do ranking do servidor e da janela dos últimos votos. Ele é chamado no
**ticker da mão**, e não num `setInterval` próprio: um segundo laço de quadro
para desenhar texto brigaria com o único `requestAnimationFrame` do projeto e
deixaria a fila um quadro atrás da mão. E há uma **assinatura** — o texto de
tudo o que seria desenhado — comparada antes de escrever: sem ela o `innerHTML`
seria reescrito sessenta vezes por segundo para desenhar exatamente o mesmo.

**ÚLTIMOS VOTOS são quatro linhas, e a janela é do tamanho da tela.** O nome de
quem mandou o presente, uma seta na cor do candidato e o número da urna que
recebeu o voto — o nome e o número só andam juntos neste instante, e é por isso
que o `aoContarVoto` do `hand-actor.js` leva o `usuario` junto da contagem. Um
voto sem nome não entra: uma linha vazia no painel é um defeito visível. A
lista vive em `ao-vivo.js`, e não no painel, pela mesma razão que a fila vive
no ator — quem tem o fato guarda o fato, quem desenha não guarda nada.

As quatro linhas são o **tamanho exato** do que cabe, e é por isso que este
monitor não tem `+N`, ao contrário do da fila: ele é uma janela que anda, e não
uma lista que transborda. O voto seguinte empurra o mais velho para fora.

**O que faz o olho ler "aparelho", e não "caixa de texto"** é o mesmo conjunto
das TVs do placar: a marca `ARENA` no pé, o LED de presença aceso na cor do
candidato, o pé que apoia o aparelho no chão e a sombra no piso. Quando o
rodapé passou a ter dois aparelhos, tudo isso **saiu da área e entrou em cada
`.painel`** como nó de verdade: um pseudo-elemento da área esticaria por cima
dos dois, e o segundo aparelho ficaria sem pé e sem marca.

> Duas medidas ficaram presas por cópia e são a primeira coisa a conferir se
> alguém mexer no rodapé: a área ganhou `align-items: flex-end`, que é o que
> põe os **pés dos dois na mesma linha do chão** mesmo com alturas diferentes
> (o da fila, com o `+N`, é mais baixo), e o `.painel` ganhou `min-width: 0`,
> sem o qual o texto de uma linha só — que não quebra — empurra o aparelho
> para fora da tela em vez de deixá-lo encolher.

O que se mede, e como:

```powershell
node .superpowers/sonda/monitores.js v1 3311
```

Ela manda **quatro presentes de verdade** pelo canal do painel (`sim.gift`,
`papel=admin`) com quatro nomes diferentes, espera a mão contar os quatro — a
espera é por LINHA na tela, e não por relógio —, e então mede: os dois
aparelhos existem, um não fica por cima do outro, os dois cabem na largura do
palco, os pés estão na mesma linha, e nenhum sobe por cima da vitrine de
presentes. Confere também a ordem das linhas (o último a votar é o primeiro da
lista), a cor da seta de cada uma, e que o console da transmissão ficou limpo.

### O clique do CONFIRMA

O único som da cena que é **arquivo**, e não nota sintetizada:
`public/sound/confirm.mp3`, trazido pelo Leonardo. Ele toca no instante em que
o voto passa a valer — o mesmo `aoContarVoto` que conta o voto e escreve a
linha dos últimos votos.

Três decisões, e cada uma tem um número medido atrás:

- **`VOLUME_CONFIRMA = 0.15`** em `som.js`, e é o único número a mexer se um
  dia ele achar que ficou alto ou baixo. O arquivo é um mp3 masterizado, medido
  em **-0,7dB de pico e -10,2dB de média** (`ffmpeg -af volumedetect`): ele
  chega alto. A 0,15 a média cai para perto de -26dB, que é o volume de um bip
  de teclado **debaixo** da narração. Já foi 0,25, e ele pediu para descer mais
  um pouco — o caminho é este número, nunca o volume do arquivo, que é dele.
- **O arquivo é buscado uma vez, na criação do som.** Buscar na hora do
  primeiro voto faria o clique chegar atrasado, e um som sem causa visível é
  pior do que silêncio; buscar a cada voto seria uma requisição por voto, a
  noite inteira. Enquanto o buffer não estiver decodificado, `tocarConfirmacao`
  não faz nada, em silêncio.
- **Um clique por vez.** O arquivo tem 1,5s e o modo lote dispara um voto a
  cada 260ms por mão: sem desligar o anterior, cem votos em rajada viram cem
  cópias sobrepostas — um zumbido, e o clique some dentro dele. O anterior sai
  com uma **queda de 30ms** antes do `stop`, porque cortar uma onda no meio
  estala, e o estalo é mais audível que o próprio clique.

Todo caminho de falha é mudo: sem Web Audio, com o arquivo faltando ou com a
mesa calada, a cena segue idêntica. Nenhuma falha de áudio pode chegar ao
console como erro — a tela do OBS não tem onde escrever log.

---

## Os testes

```powershell
npm test                              # tudo
node --test tests/voz.test.js         # um arquivo
```

**863 testes**, `node --test`, sem navegador. A regra do projeto é **TDD**:
teste que falha primeiro, pelo motivo certo, depois o código.

**Nada de DOM falso.** As funções puras são testadas direto. O que só existe
dentro de um navegador é conferido pelas **sondas** em `.superpowers/sonda/`,
que abrem o Chrome e medem a página por dentro do protocolo de depuração
(CDP). Elas não rodam no `npm test` porque precisam de um navegador instalado.

### Onde estão os testes que prendem as costuras

Vale conhecer estes cinco, porque são os que quebram quando alguém mexe em
duas coisas ao mesmo tempo:

| Teste | O que ele prende |
|---|---|
| `tests/admin-abas.test.js` | Todo caminho de aba existe no `PADRAO` do servidor |
| `tests/presentes.test.js` | O desenho do presente aponta para um arquivo que o servidor entrega |
| `tests/porta.test.js` | A mensagem de porta ocupada oferece o `npm run reiniciar` |
| `tests/urna-bocal.test.js` | A geometria da boca da urna contra a foto de referência |
| `tests/narrador.test.js` | O `wav` só vem da rota da voz — nos **dois** formatos |

---

## A receita de cada mudança comum

### Quero mudar uma frase da voz
`config/local.json` → `narracao.falas` → a lista do tipo. **Uma frase por
linha.** Elas são sorteadas sem repetir a anterior, e é a lista que carrega
essa alternância — escritas numa linha só, elas virariam uma fala comprida que
ninguém quer ouvir.

Os marcadores são seis, e só existem esses: `{nome}` (o apelido de quem
mandou, ou `Alguém` quando não há apelido), `{quantidade}` (o número de
curtidas, só na `curtida`), `{presente}` (o nome do presente), `{urna}` (o
nome da urna que recebeu o voto), `{vezes}` (o combo do presente, que chega
pronto como `5x ` — com espaço — e **vazio** quando é um presente só, porque
"1x Rosa" não é como uma pessoa fala) e `{apelido}` (o apelido da **urna**,
não o de quem mandou: é o "Lulinha" de "Lulinha ganhou um voto", e ele cai
para o nome da urna quando o campo está vazio). Um marcador fora dessa lista
não é trocado por ninguém: a voz **fala o nome dele**.

O arquivo é lido na **subida** do servidor: depois de salvar, reinicie.

### Quero mudar a voz
`config/local.json` → `narracao.motor`, `narracao.voz` e `narracao.vozes`. O
nome da voz é diferente em cada motor: a neural é `pt-BR-FranciscaNeural`, a
do Windows é `Microsoft Maria Desktop`. `narracao.voz` vazia escolhe a melhor
do motor; `narracao.vozes` é a lista do rodízio, e uma lista **vazia** deixa a
live com uma voz só (a de `voz`).

### Quero cadastrar um presente novo
`config/local.json` → `presentes`, um objeto por presente. O `giftId` é o
número que o presente tem na TikTok.

**Para desligar um presente**, `"ativo": false` — ou `"urnaId": null`, que dá
no mesmo. Nenhum dos dois abre a espera pelo número no chat: isso é só para
presente que **não está no arquivo**, e a diferença é de propósito. Um
presente desligado é uma decisão sua, e abrir uma janela para ele seria
desfazer pelo chat o que você decidiu no arquivo.

O `id` (`p1`, `p2`) é a identidade do presente: é por ele que o log e o banco
o chamam, e trocá-lo renomearia votos que já aconteceram. Para acrescentar um
terceiro, invente um id novo em vez de reaproveitar um que já existe.

**`"desenho": "rose"`** é o desenho que aparece na faixa do presente quando
ele chega — o nome do arquivo em `public/img/`, **sem a extensão**.
Vazio (o caso de hoje) deixa a faixa sem figura; um nome que não existe não
quebra nada, a figura simplesmente não aparece.

### Quero mudar o apelido que a voz usa para um candidato
Painel → aba **Urnas** → **Apelido na fala**. É o `{apelido}` das frases: a
urna 13 pode ser "Lula" no palco e "Lulinha" na boca do narrador. Em branco,
a fala usa o nome da urna — é por isso que este campo pode ficar vazio sem
quebrar frase nenhuma.

### Quero mudar a cor de uma urna
Painel → aba **Urnas**. As teclas BRANCO, CORRIGE e CONFIRMA mantêm as cores da
urna brasileira **de propósito**: mexer nelas faria a urna deixar de parecer
uma urna.

### Quero mudar o desenho da mão
`public/js/hand/esqueleto.js` é a **única fonte** dos pivôs. O desenho do SVG
vem dele (`hand-svg.js`), e as rotações também. Enquanto os pivôs estavam
escritos em dois lugares, o desenho e o movimento podiam divergir **sem erro
nenhum no console**.

### Quero mudar um texto que aparece na tela
`public/js/urna.js` e `public/js/placar.js` montam a marcação. Os testes de
`tests/tela.test.js` e `tests/placar.test.js` leem o **CSS e o JS como texto**
e conferem o que foi declarado — é assim que a suíte confere geometria e cor
sem abrir um navegador.

### Quero adicionar um tipo de fala novo
1. `server/narracao.js` → `FALAS_PADRAO`, com as frases;
2. `server/sources/base.js` → `TIPOS_SOCIAIS`, se ele vem de um evento;
3. `config/local.json` → a lista do tipo, em `narracao.falas` — se você quiser
   frases suas em vez das do código.

Era um quarto passo até 2026-10-15: um rótulo humano no `ROTULO_DA_FALA` do
painel, porque a aba Textos montava uma caixa por tipo. Sem a aba, o que
sobrou é o passo 3 — e `tests/narracao.test.js` prende que o padrão tem frase
para todo tipo social, para nenhum tipo novo nascer mudo.

### Quero mexer no CSS
Ver [As edições visuais são do Leonardo](#as-edições-visuais-são-do-leonardo)
antes: `urna.css` e `urna.js` são os arquivos dele, e têm edições à mão.

---

## As armadilhas

### Uma edição à mão que parece um processo fantasma

Duas linhas de `public/css/` mudaram sozinhas uma vez, sem commit e sem teste,
e a suíte ficou vermelha **do nada**. Passou-se um bom tempo caçando um
processo que estivesse reescrevendo o arquivo — e não havia processo nenhum:
era o Leonardo editando o visual à mão.

O sintoma engana porque a edição é **pequena e específica**, e é exatamente
assim que um bug de verdade se pareceria. A saída não é investigar mais
fundo, é **perguntar**: `urna.css` e `urna.js` são os arquivos onde ele
mexe, e quem tem a palavra final sobre eles é ele.

`.superpowers/linhas-estranhas/` guarda uma cópia do estado de antes — só para
comparar, nunca para restaurar por cima.

### O OBS embarca um navegador velho

O OBS 30 traz **CEF/Chromium 103**. Isso significa:

- **`color-mix()` não existe.** Use hexadecimal e `rgba()`.
- **O CSS `cos()` não existe.** A matemática tem que sair do JS.
- **A `speechSynthesis` não funciona.** É por isso que a voz é um arquivo.

### O arquivo de configuração não é a fonte da verdade

`config/local.json` pode estar velho, incompleto ou errado. Quem decide é o
`normalizar` do servidor. Se um campo do painel não faz nada, a primeira
pergunta é **se o `normalizar` conhece aquela chave** — e
`tests/admin-abas.test.js` responde isso em um segundo.

### `npm start` não derruba ninguém

Isso é de propósito. A porta 3000 **não é deste projeto por decreto**: no dia
em que outra coisa estiver escutando ali, um `npm start` que mata por conta
própria derrubaria o programa de outra pessoa sem perguntar. Quem escolhe é
quem digita `npm run reiniciar`.

---

## Estado atual

**Etapas 1 a 7 prontas e validadas.** Falta a **Etapa 8**: fechar o modo
transmissão com as instruções de captura no OBS.

### O que a suíte diz hoje

```
ℹ tests 863
ℹ pass 863
ℹ fail 0
```

Tudo verde. Se um dia não estiver, veja
[As edições visuais são do Leonardo](#as-edições-visuais-são-do-leonardo)
antes de sair procurando defeito.

### As edições visuais são do Leonardo

`public/css/urna.css` e `public/js/urna.js` têm edições feitas à mão por ele,
para legibilidade e para o painel pegar luz. São reconhecíveis:

- fontes maiores na tela da urna (`8px`→`12px`, `10px`→`16px`, `9px`→`12px`);
- um `text-shadow` claro no nome do candidato, no lugar da sombra preta;
- o fim do gradiente do teclado em `#363a43`, e não mais preto chapado — é o
  pé do painel pegando luz, e as teclas assentam numa superfície em vez de
  flutuar num vazio;
- o rótulo "Nome:" da tela da urna comentado em `urna.js`;
- o algarismo da tecla centralizado, em vez de no alto à esquerda.

**Uma dessas edições já apareceu como "a suíte ficou vermelha do nada"**, e a
caçada foi atrás de um processo fantasma que não existia. Não era nada disso:
era uma decisão visual dele que um teste escrito contra a foto não conhecia.

O teto de luminância do painel do teclado subiu de `0.03` para `0.09` por
causa disso. O `0.09` não saiu do valor que ele escolheu — saiu de ser cerca
de 4× mais escuro que o plástico mais escuro do corpo da urna
(`--urna-plastico-3`, `0.3727`), que é onde uma superfície deixa de ler como
massa escura. Um painel em `#5a5f6a` (`0.1140`) ou mais claro ainda reprova.

**Ao mexer nesses dois arquivos: são dele.** Não reverta uma linha por conta
própria, e se um teste de geometria ou de cor ficar vermelho, a primeira
pergunta é se a foto ainda é a referência certa — não se ele errou.

### O que ficou de fora de propósito

**As três políticas de fechamento da rodada** (spec, seção 6.3). O servidor
**aceita** os três nomes — `processar-recebidos`, `corte-exato` e
`tolerancia-2s` — mas **só honra o primeiro**: o `fecharRodada` do
`server/tally.js` processa o que chegou e não consulta a política em lugar
nenhum; `rodada.toleranciaMs` não é lida por ninguém.

Os dois campos saíram da aba **Rodada** por causa disso, e é a regra do
próprio painel: *só entra campo que o servidor honra*. Antes disso eles
estavam lá, e pior — a lista do painel oferecia `descartar-atrasados`, que o
servidor **recusa**, no lugar de duas das três que ele conhece. Escolher essa
opção era o defeito clássico: o painel dizia "salvo", o `normalizar` avisava
baixinho, e nada mudava.

Para implementar: as políticas só querem dizer alguma coisa quando o evento
traz o **instante em que aconteceu** e o fechamento tem uma janela. É uma
decisão de desenho (o que fazer com o evento que chega durante a janela, e
como ele se relaciona com o relógio do servidor), e não um remendo. Quando
entrar, as opções do painel devem sair de `POLITICAS_DE_ENCERRAMENTO` — a
lista do servidor — e não de uma lista escrita no painel, que foi como
`descartar-atrasados` nasceu.

`tests/admin-abas.test.js` prende os dois campos fora do painel até lá.

> A **rotação de vozes** esteve nesta lista até 2026-10-15, e saiu: ela existe
> agora, com duas vozes neurais alternando a cada frase. Está em
> [O rodízio de vozes](#o-rodízio-de-vozes), na seção da voz.

### O ramo

O trabalho está no ramo **`feat/etapas-1-3-visual`**. O merge e o push
esperam você — não foram feitos.

---

## Convenções do projeto

Estas não são regras de estilo. São o que mantém o código legível daqui a
seis meses.

**Comentários em português, e explicam o PORQUÊ.** O código já diz o que faz.
O comentário diz por que aquilo está ali e o que acontece se mudar — de
preferência citando o caso concreto que obrigou a decisão.

**Zero dependências de runtime no Node.** `package.json` não tem
`dependencies`. O WebSocket, o SQLite e o servidor HTTP são escritos à mão ou
vêm do próprio Node.

**Nada de coordenada de tecla fixada em código.** A mão mira o que o
navegador mede (`getBoundingClientRect`), convertido para as coordenadas do
palco. Se o layout mudar de tamanho, a mão continua acertando a tecla sem
ninguém tocar na mão.

**Nada de emoji como representação.** Nem das urnas, nem das mãos, nem do
teclado.

**O que é puro fica puro.** `markupPainel`, `markupTeclado`, `falaDoServidor`
e todo o `admin/campos.js` devolvem texto e não tocam no DOM — é isso que
deixa a suíte testá-los sem navegador. Vale a pena manter assim.
