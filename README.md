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
segue, curte, entra, compartilha ou assina, ele **fala** e mostra uma faixa
na tela. As frases são suas, editáveis na aba **Textos**, uma por linha.

A voz sai pelo **Windows**, e não pela página: o navegador que o OBS embarca
não fala, então quem sintetiza é o servidor (`voz.ps1`), que guarda o áudio
e manda a página tocar. Se a voz não sair, o problema está no Windows ou no
volume — e não na live. Para descobrir isso sem esperar alguém seguir de
verdade, a aba **Teste** tem um botão para cada um dos cinco avisos.

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

**Se a porta 3000 estiver ocupada**, o servidor diz quem está segurando e o
comando exato para derrubar — em vez da pilha de chamadas do Node, que não
responde nem uma coisa nem outra:

```
  A porta 3000 já está ocupada.

  Quem está segurando é o processo 16408.
  Na maioria das vezes é outra instância deste servidor que ficou de pé.
  Para derrubá-la:

      taskkill /PID 16408 /F

  Ou suba em outra porta, sem mexer em nada:

      set PORT=3001 && npm start
```

O caso mais comum de todos é o servidor da tentativa anterior ter ficado de
pé. O `npm run dev` resolve isso na prática: ele reaproveita a mesma janela.

### 3. Abrir a cena no navegador

Acesse <http://localhost:3000>. Você vê o palco com as duas urnas, o placar
e o relógio da rodada. **Esta é a página que o OBS captura, e ela não tem
um único botão.**

### 4. Abrir o painel, em outra aba

Acesse <http://localhost:3000/admin>. O painel tem sete abas:

| Aba | Para quê |
|---|---|
| Urnas | Nome, número, partido e cores de cada urna |
| Presentes | Qual presente vale voto, e em qual urna ele cai |
| Rodada | **A duração da rodada**, e o que fazer quando ela acaba |
| Animação | A velocidade da mão |
| Teste | Disparar um presente e abrir/encerrar/zerar a rodada |
| Integração | O log ao vivo do que chega do servidor |
| Textos | Os letreiros da tela |

Salve e o servidor confirma — o painel só diz **"enviado"** até o servidor
responder, porque quem grava é ele.

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

São **525 testes** cobrindo a geometria da cena, a matemática da animação, a
fila, as poses da mão, a tela da urna, o placar, o protocolo do servidor e os
campos do painel. A suíte roda em poucos segundos e não precisa de navegador.

O que a suíte **não** cobre sozinha é o que só existe dentro de um navegador
de verdade — se a mão aparece, se o placar sobe na hora certa, se o que o
painel salva chega à tela do ar. Para isso existem as sondas em
`.superpowers/sonda/`, que abrem o Chrome e medem a página por dentro do
protocolo de depuração. Elas não fazem parte do `npm test` porque precisam de
um navegador instalado.

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
    placar.css          O placar e o resultado
    cronometro.css      O relógio da rodada
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
    som.js              Os sons da urna
    config.js           A configuração que chega do servidor
    net.js              O canal WebSocket, dos dois lados
    admin.js            Ponto de entrada do PAINEL
    admin/
      campos.js         Os campos do painel: puro, testado sem navegador
      abas.js           As sete abas, montadas a partir da configuração
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
  ws.js                 O protocolo WebSocket, escrito à mão
  porta.js              Porta ocupada: quem está segurando e o que fazer
  voz.js                A voz do narrador (o lado Node do `voz.ps1`)
  voz.ps1               O sintetizador do Windows, falado por linhas de texto
  sources/              De onde vêm os presentes (hoje, o simulador)
config/local.json       A configuração do Leonardo (nasce vazia)
fotos/                  Os retratos dos candidatos
tests/                  525 testes, rodando no `node --test`
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

**Preciso de internet para rodar?**
Até a Etapa 5, não. O servidor é local e nada sai da sua máquina. A partir da
Etapa 7, a conexão com a TikTok LIVE vai precisar de internet.

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

As Etapas 6 a 8 estão especificadas em
`docs/superpowers/specs/2026-10-15-urna-tiktok-live-design.md`. O caminho é:
modo de teste usando exatamente o mesmo processamento do evento real (6),
integração com os presentes da TikTok LIVE (7) e o modo transmissão com as
instruções finais do OBS (8).
