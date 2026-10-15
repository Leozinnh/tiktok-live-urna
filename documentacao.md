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
npm test           # a suíte inteira (701 testes, poucos segundos)
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
| `painel.js` | A fila e o ranking do rodapé, um de cada vez |
| `narrador.js` | A voz e a faixa: toca o áudio que o servidor gravou |
| `resultado.js` | O cartão de fim de rodada |
| `cronometro.js` | O relógio, que **obedece ao servidor** |
| `presentes.js` | O aviso de presente que entra na tela |
| `som.js` | Os sons da urna |
| `config.js` | A configuração que chega do servidor |
| `net.js` | O canal WebSocket, dos dois lados |
| `admin.js` | Ponto de entrada do **painel** |
| `admin/abas.js` | As sete abas, declaradas como **dado** |
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
| `narracao.js` | As frases da voz: sorteia sem repetir e troca `{nome}` |
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

### As sete abas

| Aba | O que edita |
|---|---|
| **Urnas** | Nome, número, cargo, partido, cores, multiplicador, retrato |
| **Presentes** | Qual presente vale voto, em qual urna, quantos votos, cooldown |
| **Rodada** | A duração. (A política de fechamento ainda não — ver [o que ficou de fora](#o-que-ficou-de-fora-de-propósito)) |
| **Animação** | A velocidade da mão |
| **Teste** | Dispara presente, rajada, presente **sem urna** e o número no chat |
| **Integração** | Simulador ou TikTok ao vivo, e o tempo de espera do número |
| **Textos** | As frases do placar, as da voz, o motor e a voz |

Os campos vivem em `public/js/admin/abas.js`, **declarados como dado** — não
como marcação. É essa separação que deixa um teste conferir, sem navegador,
que todo caminho existe do outro lado.

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
  entrada   <id>\t<texto>
  saída     ok\t<id>\t<ext>\t<texto>     (o texto volta como ECO)
            erro\t<id>\t<motivo>
```

A **extensão** vai na resposta porque são dois sintetizadores e o servidor não
pode adivinhar: um `readFile` no nome errado devolveria `ENOENT` e a fala
sumiria com o sintetizador tendo funcionado perfeitamente.

O **eco** existe para conferir que o acento chegou inteiro. O stdin do Windows
PowerShell 5.1 não é UTF-8 por padrão, e "Conceição" vira "Concei??o" **sem
erro nenhum** — sai som, sai bonito, sai errado.

### O processo é de vida longa

Um processo novo leva **~1,9 s** só para carregar o .NET e a voz. Quase dois
segundos entre alguém seguir e a narração sair, que no meio de uma live é uma
eternidade. Reaproveitado, cada frase custa **~90 ms**.

É por isso que `voz.js` mantém um `Map` de máquinas (uma por motor), cada uma
com o seu processo, a sua espera e o seu estado.

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

## Os testes

```powershell
npm test                              # tudo
node --test tests/voz.test.js         # um arquivo
```

**701 testes**, `node --test`, sem navegador. A regra do projeto é **TDD**:
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
| `tests/narracao.test.js` | Toda fala que o narrador sabe dizer é editável no painel |
| `tests/porta.test.js` | A mensagem de porta ocupada oferece o `npm run reiniciar` |
| `tests/urna-bocal.test.js` | A geometria da boca da urna contra a foto de referência |
| `tests/narrador.test.js` | O `wav` só vem da rota da voz — nos **dois** formatos |

---

## A receita de cada mudança comum

### Quero mudar uma frase da voz
Painel → aba **Textos** → a caixa do tipo. **Uma frase por linha.** Elas são
sorteadas sem repetir a anterior, e é a lista que carrega essa alternância —
escritas numa linha só, elas virariam uma fala comprida que ninguém quer ouvir.

`{nome}` é trocado pelo apelido (e por `Alguém` quando não há apelido),
`{quantidade}` pelo número.

### Quero mudar a voz
Painel → aba **Textos** → **Motor da voz** e **Voz**. O nome da voz é
diferente em cada motor: a neural é `pt-BR-FranciscaNeural`, a do Windows é
`Microsoft Maria Desktop`. Campo **Voz** vazio escolhe a melhor do motor.

### Quero cadastrar um presente novo
Painel → aba **Presentes** → edite um cartão (ou o presente 3, quando
existir). O `giftId` é o número que o presente tem na TikTok. **Presente sem
urna não conta voto** — é assim que se desliga um presente.

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
3. `public/js/admin/abas.js` → `ROTULO_DA_FALA` com um rótulo humano.

O painel **ganha a caixa sozinho** — ele monta os campos a partir da
configuração. E `tests/admin-abas.test.js` fica vermelho se faltar o rótulo,
porque um tipo sem rótulo aparece com o nome técnico e o operador não faz
ideia de para que serve.

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
ℹ tests 701
ℹ pass 701
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

**Rotação de vozes.** O projeto dos cavalos (`tiktok-live-horse`) alterna
entre três vozes neurais a cada fala. Aqui não: isso pede mais superfície de
configuração e triplica a rotatividade do cache, e o que o pedido original
queria era a **qualidade** da voz neural. Se você quiser a rotação, ela é um
acréscimo em `voz.js` — a tabela `MOTORES` já é o lugar onde a voz se escolhe.

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
