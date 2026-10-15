# Live Vote Arena — urnas eletrônicas para TikTok LIVE

Uma arena de votação para rodar durante a sua live. Cada presente do TikTok
vale um voto, e cada voto é **uma mão humana que digita o número na urna
eletrônica brasileira, aperta CONFIRMA e deposita a cédula na boca da
impressora.**

Tudo em HTML, CSS e JavaScript puros — sem Three.js, Unity ou Unreal. O
servidor é Node.js sem nenhuma dependência instalada.

---

## Estado atual

O projeto está sendo construído em 8 etapas. **As Etapas 1 a 3 estão
prontas e validadas:**

| Etapa | O que entrega | Situação |
|---|---|---|
| 1 | Cenário, palco 1080×1920 e escala | ✅ pronta |
| 2 | A urna eletrônica (gabinete, tela, teclado, cédula) | ✅ pronta |
| 3 | A mão articulada e a coreografia do voto | ✅ pronta |
| 4 | Motor de votos, fila e placar | ⏳ a fazer |
| 5 | Painel administrativo (rota separada) | ⏳ a fazer |
| 6 | Modo de teste com o mesmo caminho do evento real | ⏳ a fazer |
| 7 | Integração com os presentes da TikTok LIVE | ⏳ a fazer |
| 8 | Modo transmissão para OBS e README final | ⏳ a fazer |

**O que já dá para fazer hoje:** abrir a cena, ver as duas urnas e assistir
a coreografia completa de um voto — a mão aparece, digita, aperta CONFIRMA,
a cédula sai da boca da impressora e a urna volta ao repouso.

**O que ainda não existe:** placar, painel administrativo e a conexão com a
TikTok. Os votos de hoje são disparados pelos botões de demonstração, e a
tela **avisa que está em demonstração** — nada aqui finge ser um evento real
da live.

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
Live Vote Arena no ar em http://localhost:3000
```

**Deixe essa janela aberta.** Ela é o servidor — se você fechar, a cena sai
do ar.

### 3. Abrir a cena no navegador

Acesse <http://localhost:3000>. Você vê o palco com as duas urnas e a mão
recolhida na parte de baixo.

### 4. Disparar um voto

**Mexa o mouse na página.** Uma barra aparece no rodapé com os botões:

- **`Rosa → URNA 1`** — um voto na Urna 1
- **`Heart Me → URNA 2`** — um voto na Urna 2
- **`Rajada de 12`** — doze votos alternados, para ver a fila em ação

Clique em um deles e assista. A barra **some sozinha depois de 3 segundos**
parada, e ela nunca aparece se ninguém mexer o mouse — é assim que ela fica
fora do enquadramento quando o OBS estiver capturando.

### 5. Parar o servidor

Volte à janela do PowerShell e aperte **Ctrl+C**.

---

## Rodar os testes

```powershell
npm test
```

São **174 testes** cobrindo a geometria da cena, a matemática da animação, a
fila, as poses da mão e a tela da urna. A suíte roda em menos de meio segundo
e não precisa de navegador.

---

## Como o projeto está organizado

```
public/
  broadcast.html        A página que o OBS captura (nada de painel aqui)
  css/
    tokens.css          Cores, medidas e camadas de toda a cena
    scene.css           O cenário: parede, mesa, piso
    urna.css            A urna eletrônica inteira
    hand.css            A mão e a sombra dela
    demo.css            A barra de demonstração (sai na Etapa 6)
  js/
    scene.js            Monta o palco e escala para o tamanho da janela
    urna.js             A urna: gabinete, tela, teclado e cédula
    hand-actor.js       A mão em cena: recebe um voto e o encena
    demo.js             Ponto de entrada + os botões de demonstração
    vote-sequence.js    A coreografia de um voto, em passos
    anim/
      timeline.js       Linha do tempo com tweens nomeados
      easing.js         Curvas de aceleração
      queue.js          A fila — nenhum voto válido é descartado
    hand/
      esqueleto.js      O esqueleto da mão: a fonte única dos pivôs
      hand-svg.js       O desenho do SVG, gerado do esqueleto
      poses.js          As poses nomeadas (apontar, pressionar, segurar…)
server/
  index.js              Servidor estático, sem dependências
tests/                  174 testes, rodando no `node --test`
docs/superpowers/       A spec do produto e o plano de implementação
```

### Duas regras que sustentam o código

**Nada de coordenada de tecla fixada em código.** A mão mira o que o
navegador mede (`getBoundingClientRect`), convertido para as coordenadas do
palco. Se o layout mudar de tamanho, a mão continua acertando a tecla sem
ninguém tocar na mão.

**O esqueleto da mão é uma tabela só.** `hand/esqueleto.js` é a única fonte
dos pivôs; o desenho do SVG e as rotações saem os dois de lá. Enquanto os
pivôs estavam escritos em dois lugares, o desenho e o movimento podiam
divergir sem erro nenhum no console.

---

## Perguntas que costumam aparecer

**A barra de botões aparece na transmissão?**
Não. Ela só aparece quando alguém mexe o mouse na página, e o OBS captura
sem enviar evento nenhum de ponteiro. Mesmo que você mexa, ela se esconde
sozinha em 3 segundos.

**Preciso de internet para rodar?**
Para as Etapas 1 a 3, não. O servidor é local. A partir da Etapa 7, a conexão
com a TikTok LIVE vai precisar de internet.

**Funciona no OBS?**
A cena é feita para o formato vertical do celular: **1080×1920**, sem barra de
rolagem e sem controle administrativo no quadro. O modo de transmissão
dedicado chega na Etapa 8.

**Dá para usar mais de duas urnas?**
A cena de hoje tem duas, que é o pedido. O número de urnas é configuração
(`CONFIG_URNAS` em `public/js/demo.js`), mas o layout do palco foi desenhado
para duas.

**Posso mexer nas cores das urnas?**
Sim — `corPrimaria` e `corSecundaria` de cada urna em `public/js/demo.js`.
As teclas BRANCO, CORRIGE e CONFIRMA mantêm as cores da urna brasileira de
propósito.

---

## Próximos passos

As Etapas 4 a 8 estão especificadas em
`docs/superpowers/specs/2026-10-15-urna-tiktok-live-design.md`. O caminho é:
motor de votos e placar (4), painel administrativo em rota separada (5),
modo de teste usando exatamente o mesmo processamento do evento real (6),
integração com os presentes da TikTok LIVE (7) e o modo transmissão com as
instruções finais do OBS (8).
