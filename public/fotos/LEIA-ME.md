# Fotos dos candidatos

Jogue aqui os retratos que a urna vai mostrar, e aponte para eles no
`config/local.json` escrevendo só o nome do arquivo:

```json
"candidato": { "foto": "ana.jpg" }
```

Esta pasta é servida em `/fotos/`, então o mesmo arquivo também atende por
`/fotos/ana.jpg` — dá no mesmo, é só a forma mais longa.

**Se a imagem não carregar, a urna desenha o retrato no lugar.** Um nome
errado não deixa o ícone de imagem quebrada na tela.

## Tamanho

O retrato é desenhado numa moldura de **88 × 108 pixels**, em pé, e a imagem
é recortada para preencher essa moldura (`object-fit: cover` — o que passar
das proporções é cortado, sem esticar).

O visor inteiro tem 268 pixels de largura, e é capturado a 1080 × 1920 de
palco. Uma foto quadrada grande funciona bem, mas prefira:

- **proporção em pé**, perto de 4:5 — uma foto deitada perde as laterais;
- **o rosto no centro e um pouco acima do meio** — é o que sobra depois do
  recorte;
- **pelo menos 264 × 324 pixels** (o triplo da moldura), para não serrilhar
  quando a captura for assistida numa TV;
- **fundo claro**, se puder: a moldura tem fundo azul-acinzentado, e um
  retrato escuro colado nela fica pesado.

A imagem é buscada pelo navegador, então `http://` e `https://` também
funcionam — mas um arquivo aqui é mais rápido e não depende de internet no
dia da live.
