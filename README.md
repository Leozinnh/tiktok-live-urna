# Live Vote Arena — urnas eletrônicas para TikTok LIVE

Uma arena de votação para rodar durante a sua live. Cada presente do TikTok
vale um voto, e cada voto é **uma mão humana que digita o número na urna
eletrônica brasileira, aperta CONFIRMA e deposita a cédula na boca da
impressora.**

Tudo em HTML, CSS e JavaScript puros — sem Three.js, Unity ou Unreal. O
servidor é Node.js sem nenhuma dependência instalada.

---

## Estado atual

O projeto está sendo construído em 8 etapas. **As Etapas 1 a 7 estão
prontas e validadas:**

| Etapa | O que entrega | Situação |
|---|---|---|
| 1 | Cenário, palco 1080×1920 e escala | ✅ pronta |
| 2 | A urna eletrônica (gabinete, tela, teclado, cédula) | ✅ pronta |
| 3 | A mão articulada e a coreografia do voto | ✅ pronta |
| 4 | Motor de votos, fila e placar | ✅ pronta |
| 5 | Painel administrativo (rota separada) | ✅ pronta |
| 6 | Modo de teste com o mesmo caminho do evento real | ✅ pronta |
| 7 | Integração com os presentes da TikTok LIVE | ✅ pronta |
| 8 | Modo transmissão para OBS e README final | ⏳ a fazer |

**O que já dá para fazer hoje:** abrir a cena, ver as duas urnas e assistir
a coreografia completa de cada voto — a mão aparece, digita, aperta
CONFIRMA, a cédula cai e o placar sobe. Dois votos ao mesmo tempo viram
**duas mãos**, uma em cada urna, cada uma com o nome de quem presenteou.
A rodada tem relógio, e quem o abre e o fecha é o servidor.

**O que o placar faz:** ele é de propósito mais lento que o servidor. O
número da tela só sobe quando a cédula cai, e não quando o presente chega.
Assim o público vê o voto acontecer em vez de ver um dígito pular sozinho —
e a tela se corrige sozinha contra o servidor sempre que não há voto em voo.

**Onde ficam as coisas:** a tela do ar é <http://localhost:3000>, e não tem
um único botão. O painel é <http://localhost:3000/admin>, numa rota
separada, em outra aba do navegador — nada que se clica nele pode cair no
enquadramento do OBS.

**A narração.** Além das urnas, o sistema tem um narrador: quando alguém
segue, curte, entra, compartilha, assina **ou manda um presente**, ele
**fala** e mostra uma faixa na tela. As frases são suas, em
`config/local.json`, na chave `narracao.falas` — uma frase por linha. Sem
essa chave, valem as frases que já vêm no código (dezenas por tipo, sorteadas
sem repetir).

**São duas vozes**, alternando a cada fala — de fábrica, a
`pt-BR-FranciscaNeural` e a `pt-BR-AntonioNeural` —, porque uma voz só
dizendo quarenta frases por noite soa automática. Como trocar isso está logo
abaixo, com o resto da voz.

**O presente é o aviso que mais aparece na tela.** Ele sai numa faixa **maior
que as outras, pintada com a cor da urna que recebeu o voto** — azul no 22,
vermelho na 13 —, com o **desenho do presente que chegou** (a rosa, o coração
— `"desenho": "rose"` no presente) e com um bloco de frases que dizem para
quem o voto foi: *"Lulinha ganhou um voto! Valeu, Fulano!"*. O "Lulinha" é o
**Apelido na fala** da urna, na aba **Urnas**; em branco, a frase usa o nome
da urna.

**Quanto mais caro o presente, mais voto ele vale.** A conta é
`5 × round(√moedas)`: o Heart Me de 1 moeda vale **5** votos, um de 25 vale
**25**, um de 100 vale **50**. A raiz, e não o preço cheio, é o que impede um
presente de 1 moeda de virar enfeite e um de 1.000 de decidir a rodada
sozinho. Quem manda no número é o campo **Moedas** do presente, na aba
**Presentes** — e um campo **Votos** preenchido à mão vence a conta, para o
dia em que você quiser um presente com peso próprio.

**Quem escreve o nome do candidato no chat também vota.** Sem mandar nada:
basta comentar *"bolsonaro, 22, flavio e tal"* e o voto de **1 ponto** entra
para aquela urna. Vale o número (`22`, `13`) e vale o nome ou o apelido
(`flavio`, `lulinha`), sem acento e sem maiúscula. Citar **duas** urnas no
mesmo comentário não vale nada — na dúvida o sistema fica quieto —, e cada
pessoa só vota assim **uma vez a cada 3 segundos**. Esse voto não é narrado:
a fila da voz é o gargalo da cena, e um voto de 1 ponto não pode atrasar a
fala de um presente de 50.

**A etiqueta que sai do dedo diz quem votou — e de quanto foi o voto.** Ela
aparece junto com a mão, cresce para a esquerda a partir da ponta do
indicador, na **cor da urna** que está recebendo, e traz duas linhas: quem
mandou, e o que aquilo foi — o **desenho e o nome do presente**, ou o
**número que a pessoa escreveu no chat**. Na ponta direita vai o peso
(`+5`, `+1`, `+50`), que se acende cheio no instante em que o dedo aperta
CONFIRMA e o voto entra no placar.

**No rodapé há dois monitores, e eles contam a noite.** Enquanto tem voto
esperando, aparece **um** aparelho só, de ponta a ponta, com a fila: quem
presenteou e qual urna vai receber aquele voto. Quando a fila esvazia, ele vira
**dois**, lado a lado: **QUEM MAIS PRESENTEOU**, com os três que mais mandaram
presente, e **ÚLTIMOS VOTOS**, com as quatro últimas pessoas que votaram —
o nome de quem mandou e o número da urna que recebeu, com uma seta na cor
daquele candidato. O último a votar é sempre a primeira linha.

**Quando o voto é confirmado, a urna clica.** Um clique curto, baixo, que sai
por cima da narração sem competir com ela — é o `public/sound/confirm.mp3`,
tocado no exato instante em que o dedo aperta a tecla verde. Numa rajada de
presentes os cliques saem um de cada vez, em vez de virarem um zumbido. Se o
som do navegador estiver bloqueado ou o arquivo faltar, a live segue igual e
muda: **nenhuma falha de áudio vira erro no console**.

**Tudo o que acontece fica escrito no log.** O servidor escreve no console
**e** em `dados/logs/AAAA-MM-DD.log` cada evento que chega da live, cada voto
contado, cada presente que **não** contou (com o motivo) e **toda frase que a
voz fala**, antes de virar som. É ali que se descobre, em dez segundos, por
que uma Rosa mandada pelo painel não falou nada — rodada fechada, narração
desligada, voz quebrada, nenhuma tela conectada.

A voz sai pelo **servidor**, e não pela página: o navegador que o OBS embarca
não fala, então quem sintetiza é o Node, que guarda o áudio em arquivo e manda
a página tocar. Se a voz não sair, o problema está no motor escolhido ou no
volume — e não na live. Para descobrir isso sem esperar alguém seguir de
verdade, a aba **Teste** tem um botão para cada aviso: os cinco sociais, os
presentes cadastrados (com o campo do combo ao lado), o presente órfão e o
número escrito no chat.

**São dois motores de voz, e você escolhe em `narracao.motor`, no
`config/local.json`:**

| Motor | Como soa | Precisa de |
|---|---|---|
| **Neural** (padrão) | Como gente. É a voz `pt-BR-FranciscaNeural` | Internet |
| **Do Windows** | Robótica, mas inteligível | Nada além do Windows |

O neural é o padrão porque é o que soa como uma pessoa narrando. O do Windows
existe para o dia em que a internet cair no meio da live — e **o sistema troca
sozinho**: se o motor escolhido falhar, ele avisa uma vez no console e fala com
a voz do Windows em vez de ficar mudo. A troca é por frase, então a live não
para.

Um nome de voz se escreve diferente em cada motor (a neural se chama
`pt-BR-FranciscaNeural`, a do Windows é `Microsoft Maria Desktop`). Deixar o
campo **Voz** vazio escolhe a melhor voz do motor — que é o que você quer, a
não ser que tenha uma preferida.

O **rodízio** é a lista `narracao.vozes`, e ela é do motor neural — os nomes
que estão lá só existem nele. Esvaziar a lista (ou tirar o campo) desliga a
alternância e deixa a live com uma voz só, a do campo `voz`. Cada fala pega a
voz da vez, e cada voz guarda o seu áudio em cache: a mesma frase sai nas
duas, e não sempre na primeira.

**A live de verdade (Etapa 7).** Na aba **Integração**, troque o modo para
**TikTok ao vivo**, escreva o nome da sua live (sem o `@`) e salve. A troca
vale na hora: **não precisa reiniciar o servidor**. O topo do painel passa a
mostrar de onde vêm os eventos e o que está acontecendo com a fonte —
inclusive o motivo, quando ela não conecta.

Para isso o projeto ganhou **uma ponte em Python**, que é a única coisa aqui
que precisa de algo além do Node. Veja
[Preciso instalar mais alguma coisa?](#preciso-instalar-mais-alguma-coisa).

**O modo de teste não é um atalho.** Na aba **Teste** os votos saem do
painel — e ela dispara pelo **mesmo caminho de um presente de verdade**: o
painel manda um `sim.gift` para o servidor, e o servidor o trata como
trataria o presente de qualquer pessoa. É por isso que ele serve como teste:
é a mesma estrada. Nada aqui finge ser um evento real da live — o que entra
por esse caminho fica gravado com a origem `simulador` no banco, e quem
olhar os votos depois sabe de onde cada um veio.

---

## Como rodar no Windows

Você precisa do [Node.js 22 ou mais novo](https://nodejs.org/). Para
conferir o que está instalado, abra o **PowerShell** e digite:

```powershell
node --version
```

Se aparecer `v22.` ou maior, está pronto.

### 1. Abrir a pasta do projeto

```powershell
cd C:\xampp\htdocs\tiktok-live-urna
```

### 2. Subir o servidor

```powershell
npm start
```

Vai aparecer uma mensagem parecida com esta:

```
  Live Vote Arena
  Live:   http://localhost:3000
  Painel: http://localhost:3000/admin
```

**Deixe essa janela aberta.** Ela é o servidor — se você fechar, a cena sai
do ar.

### 2b. Enquanto estou mexendo no código: `npm run dev`

É o mesmo servidor, com uma diferença: quando um arquivo do servidor é salvo,
ele se derruba e sobe de novo sozinho. Não precisa `Ctrl+C`, não precisa
fechar a janela, não precisa matar processo nenhum.

```powershell
npm run dev
```

**Se a porta 3000 estiver ocupada**, o servidor diz o que fazer — em vez da
pilha de chamadas do Node, que não responde nem uma coisa nem outra:

```
  A porta 3000 já está ocupada.

  Na maioria das vezes é outra instância deste servidor que ficou de pé.
  Para derrubá-la e subir de novo, num comando só:

      npm run reiniciar

  Quem está segurando é o processo 16408. Para derrubá-lo à mão:

      taskkill /PID 16408 /F

  Ou suba em outra porta, sem mexer em nada:

      set PORT=3001 && npm start
```

O caso mais comum de todos é o servidor da tentativa anterior ter ficado de
pé — e para ele existe **`npm run reiniciar`**, que derruba quem está na porta
e sobe o servidor de novo, na mesma janela, com o mesmo Ctrl+C. Não precisa
caçar PID, não precisa colar comando, não precisa abrir outra janela.

```powershell
npm run reiniciar
```

### 3. Abrir a cena no navegador

Acesse <http://localhost:3000>. Você vê o palco com as duas urnas, o placar
e o relógio da rodada. **Esta é a página que o OBS captura, e ela não tem
um único botão.**

### 4. Abrir o painel, em outra aba

Acesse <http://localhost:3000/admin>. O painel tem quatro abas:

| Aba | Para quê |
|---|---|
| Urnas | Nome, número, partido e cores de cada urna |
| Rodada | **A duração da rodada** |
| Teste | Disparar presente, disparar rajada, disparar um presente **sem urna** e o número no chat |
| Integração | De onde vêm os presentes: simulador ou TikTok ao vivo |

Salve e o servidor confirma — o painel só diz **"enviado"** até o servidor
responder, porque quem grava é ele.

> **Eram sete abas.** Presentes, Animação e Textos saíram em 2026-10-15: essas
> três coisas se editam direto no `config/local.json`, e a tela no meio só
> atrapalhava. O que saiu foi a tela, não o recurso — as chaves
> `presentes.*`, `animacao.velocidade` e `narracao.*` continuam valendo
> exatamente como antes. A velocidade da mão deixou de ter controle ao vivo
> junto: mudá-la agora pede reiniciar o servidor.

### 5. Disparar um voto de teste

No painel, na aba **Teste**, clique no nome de um presente. O voto entra no
servidor pelo mesmo caminho de um presente real, e a mão aparece na tela do
ar. Dá também para abrir a rodada, encerrá-la ou zerar e reabrir.

### 6. Parar o servidor

Volte à janela do PowerShell e aperte **Ctrl+C**.

---

## Rodar os testes

```powershell
npm test
```

São **855 testes** cobrindo a geometria da cena, a matemática da animação, a
fila, as poses da mão, a tela da urna, o placar, o rodapé, o som, o protocolo
do servidor, os campos do painel, as duas pontas da voz, o narrador, o log da
live e o desenho da urna contra a foto. A suíte roda em poucos segundos e não
precisa de navegador.

O que a suíte **não** cobre sozinha é o que só existe dentro de um navegador
de verdade — se a mão aparece, se o placar sobe na hora certa, se o que o
painel salva chega à tela do ar. Para isso existem as sondas em
`.superpowers/sonda/`, que abrem o Chrome e medem a página por dentro do
protocolo de depuração. Elas não fazem parte do `npm test` porque precisam de
um navegador instalado.

**A suíte está inteira verde: 855 de 855.**

---

## Como o projeto está organizado

```
public/
  broadcast.html        A página que o OBS captura (nada de painel aqui)
  admin.html            O painel do operador, em rota separada
  css/
    tokens.css          Cores, medidas e camadas de toda a cena
    scene.css           O cenário: parede, mesa, piso
    urna.css            A urna eletrônica inteira
    hand.css            A mão e a sombra dela
    placar.css          As duas TVs do placar e a placa de status
    cronometro.css      O relógio de parede da rodada
    presentes.css       Os avisos de presente que entram na tela
    painel.css          A moldura da cena do ar
    resultado.css       O cartão de fim de rodada
    admin.css           O painel — só ele usa este arquivo
  js/
    ao-vivo.js          Ponto de entrada da TELA DO AR
    scene.js            Monta o palco e escala para o tamanho da janela
    urna.js             A urna: gabinete, tela, teclado e cédula
    urnas-livres.js     Qual urna está livre para receber a próxima mão
    hand-actor.js       A mão em cena: recebe um voto e o encena
    hand-team.js        As duas mãos: quem pega o próximo voto da fila
    vote-sequence.js    A coreografia de um voto, em passos
    placar.js           O placar — sobe quando a cédula cai
    resultado.js        O cartão de fim de rodada
    cronometro.js       O relógio, que obedece ao servidor
    presentes.js        O aviso de presente que entra na tela
    som.js              Os sons da urna (as notas e o confirm.mp3)
    painel.js           O rodapé: a fila, ou os dois monitores
    narrador.js         A voz e a faixa: quem toca o áudio que o servidor gravou
    config.js           A configuração que chega do servidor
    net.js              O canal WebSocket, dos dois lados
    admin.js            Ponto de entrada do PAINEL
    admin/
      campos.js         Os campos do painel: puro, testado sem navegador
      abas.js           As quatro abas, montadas a partir da configuração
      medidores.js      Os quatro números do alto do painel
    anim/
      timeline.js       Linha do tempo com tweens nomeados
      easing.js         Curvas de aceleração
      queue.js          A fila — nenhum voto válido é descartado
    hand/
      esqueleto.js      O esqueleto da mão: a fonte única dos pivôs
      hand-svg.js       O desenho do SVG, gerado do esqueleto
      poses.js          As poses nomeadas (apontar, pressionar, segurar…)
server/
  index.js              Servidor HTTP, sem dependências
  hub.js                O canal ao vivo: quem recebe o quê
  tally.js              A contagem e as rodadas
  db.js                 O banco (SQLite, escrito à mão)
  config.js             Lê, normaliza e grava a configuração
  narracao.js           As frases da voz: quem fala, quem fica quieto, e os {marcadores}
  espera.js             A espera do número no chat, e a cobrança por voz
  ws.js                 O protocolo WebSocket, escrito à mão
  porta.js              Porta ocupada: quem está segurando e o que fazer
  reiniciar.js          `npm run reiniciar`: derruba quem está na porta e sobe
  voz.js                A voz do narrador: os dois motores e o processo de cada um
  log.js                O log da live: console e um arquivo por dia
  voz.ps1               O sintetizador do Windows, falado por linhas de texto
  sources/              De onde vêm os presentes
    base.js             O contrato de uma fonte
    simulator.js        O simulador — o que o painel dispara
    tiktok.js           A live de verdade, pela ponte em Python
    troca.js            A fonte que troca de fonte, sem reiniciar o servidor
ponte/
  tiktok.py             A ponte com a TikTok LIVE (precisa do `TikTokLive`)
  voz.py                O motor neural de voz (precisa do `edge-tts`)
config/local.json       A configuração do Leonardo (nasce vazia)
dados/                  O banco, a voz gravada e o log do dia (`dados/logs/`)
fotos/                  Os retratos dos candidatos
tests/                  855 testes, rodando no `node --test`
.superpowers/sonda/     As sondas de navegador (não rodam no `npm test`)
docs/superpowers/       A spec do produto e o plano de implementação
```

### Três regras que sustentam o código

**Nada de coordenada de tecla fixada em código.** A mão mira o que o
navegador mede (`getBoundingClientRect`), convertido para as coordenadas do
palco. Se o layout mudar de tamanho, a mão continua acertando a tecla sem
ninguém tocar na mão.

**O esqueleto da mão é uma tabela só.** `hand/esqueleto.js` é a única fonte
dos pivôs; o desenho do SVG e as rotações saem os dois de lá. Enquanto os
pivôs estavam escritos em dois lugares, o desenho e o movimento podiam
divergir sem erro nenhum no console.

**O placar da tela é de propósito mais lento que o do servidor.** Quem conta
é o servidor; a tela só **mostra**. O número da tela sobe quando a cédula cai,
e não quando o presente chega — e ele se corrige sozinho contra o servidor
sempre que não há voto em voo. Parece um atraso a consertar, e não é: é o que
faz o público ver o voto acontecer. Quem for mexer nisso precisa saber que a
diferença entre os dois é intencional, e que `contagem` (a tela) e `verdade`
(o servidor) são dois números com nomes diferentes justamente para não se
confundirem.

---

## Perguntas que costumam aparecer

**O painel aparece na transmissão?**
Não, e não é por esconder nada. O painel é uma **página separada**, em
`/admin`, carregada em outra aba. A tela do ar não tem um único botão — há um
teste que varre os módulos dela para prender isso. Pode deixar o painel
aberto no segundo monitor durante a live inteira.

**Preciso instalar mais alguma coisa?**

Para as urnas, o placar, a mão e o painel: **não**. O Node sozinho dá conta, e
o projeto não tem uma dependência de Node instalada — nem uma.

Duas coisas pedem um pouco mais, e as duas são opcionais:

| O quê | Para quê | Como |
|---|---|---|
| **Python + `edge-tts`** | A voz **neural**, a que soa como gente | `pip install edge-tts` |
| **Python + `TikTokLive`** | Receber os presentes da **live de verdade** | `pip install TikTokLive` |

Sem elas o projeto continua inteiro: sem o `edge-tts` a voz sai pela do
Windows, e sem o `TikTokLive` o simulador do painel continua funcionando. O
que **não** dá para fazer é fingir: a aba Integração diz o que está faltando
quando a ponte não sobe, em vez de mostrar a live conectada sem estar.

**Preciso de internet para rodar?**
Para as urnas, não: o servidor é local e nada sai da sua máquina. A live de
verdade e a voz neural, sim. A voz do Windows funciona sem internet, e é por
isso que ela existe.

**Funciona no OBS?**
A cena é feita para o formato vertical do celular: **1080×1920**, sem barra de
rolagem e sem controle administrativo no quadro. O modo de transmissão
dedicado, com as instruções de captura, chega na Etapa 8.

**O que acontece se eu fechar o navegador no meio da live?**
Nada no placar. Quem conta é o servidor, e ele continua contando. Quando a
tela voltar, ela se corrige sozinha: pede o retrato ao servidor e se alinha.
Se a rodada acabar com o navegador fechado, ela acabou do mesmo jeito — quem
fecha a rodada é o relógio do servidor, não o da página.

**Dá para usar mais de duas urnas?**
A cena de hoje tem duas, que é o pedido. As urnas são configuração (aba
**Urnas** do painel), mas o layout do palco foi desenhado para duas — e as
duas mãos atendem as duas ao mesmo tempo.

**Posso mexer nas cores das urnas?**
Sim — na aba **Urnas** do painel, campo a campo, com o seletor de cor. As
teclas BRANCO, CORRIGE e CONFIRMA mantêm as cores da urna brasileira de
propósito: mexer nelas faria a urna deixar de parecer uma urna.

**E se eu salvar uma configuração errada?**
O painel recusa antes de mandar: campo em branco, número fora da faixa e
duração impossível são barrados com o motivo escrito ao lado do campo. Se
ainda assim algo chegar estranho ao servidor, ele **cai para o padrão e
avisa** — e o aviso aparece no painel, em vez de o operador achar que salvou
o que não salvou.

---

## Próximos passos

Falta a **Etapa 8**: fechar o modo transmissão com as instruções de captura no
OBS. As Etapas 1 a 7 estão de pé e validadas.

Para mexer no projeto — onde cada coisa mora, como o voto anda de ponta a
ponta, o que já tem teste e o que ainda não tem —, leia
[`documentacao.md`](documentacao.md). A spec do produto está em
`docs/superpowers/specs/2026-10-15-urna-tiktok-live-design.md`.
