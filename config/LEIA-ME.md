# Configuração das urnas

Esta pasta é sua. O site não guarda aqui nada que ele precise para funcionar:
o arquivo `local.json` é o que você escreve para trocar o candidato, o número,
o cargo, a cor e a foto de cada urna — sem mexer em código.

## Como usar

1. Copie `local.json.exemplo` para `local.json`, nesta mesma pasta.
2. Edite o que quiser.
3. Recarregue a página (`F5`). O arquivo não é cacheado, então a mudança
   aparece na hora.

Sem `local.json`, o site abre com os candidatos de exemplo — é assim que ele
funciona antes de você configurar nada.

## O que dá para trocar

Tudo é opcional. O que você **não** escrever continua vindo do padrão, campo a
campo: quem só quer trocar a foto escreve só a foto, e nome, partido, cargo,
número e cor continuam como estavam.

| Campo | O que é |
|---|---|
| `nome` | O nome da urna, que aparece na barra de demonstração |
| `numero` | O número que a urna mostra e que a mão digita (1 a 5 dígitos) |
| `cargo` | A linha "SEU VOTO PARA" do visor |
| `corPrimaria` | A cor da urna — `#1a5fd0`, `#e02020`, etc. |
| `candidato.nome` | O nome do candidato, no visor |
| `candidato.partido` | A sigla do partido, no visor |
| `candidato.foto` | O retrato. Ver abaixo |

## A foto

Três formas, e a regra é só o começo do texto:

| Você escreve | O que acontece |
|---|---|
| `ana.jpg` | Busca em `public/fotos/ana.jpg` |
| `/fotos/ana.jpg` | O mesmo arquivo, escrito por inteiro |
| `https://exemplo.com/ana.jpg` | Baixa da internet |

O nome solto é o caso mais provável — é o que se escreve olhando para a pasta
`public/fotos/`. Ponha a imagem lá e escreva só o nome dela.

**Se a imagem não carregar, a urna desenha o retrato dela no lugar.** Um
caminho errado não deixa o ícone de imagem quebrada na tela: você vê o desenho
genérico e sabe que a foto não foi encontrada.

**O retrato só aparece no número do candidato.** Se a urna é a 22 e alguém
digita 21, a foto, o nome e o partido saem da tela — a urna não afirma que o
21 é o seu candidato. Digitando `2`, a ficha continua (o número ainda pode
virar 22); digitando `21`, ela sai.

## Se o arquivo estiver quebrado

Um JSON inválido — uma vírgula sobrando, uma aspa aberta — não derruba a live:
o site abre com os candidatos de exemplo e mostra o erro **na barra de
demonstração**, aquela que só aparece quando você mexe o mouse. Ela é
invisível para o OBS, então o aviso não entra na transmissão.

Na dúvida sobre o que está errado, abra o console do navegador (`F12`): a
mensagem lá diz a linha e a coluna.

## O que este arquivo não faz

- **Não cria nem apaga urna.** O palco é montado para duas; uma chave `u3` no
  arquivo é ignorada.
- **Não valida o que você escreveu.** Um número com letras ou uma cor escrita
  por extenso são ignorados em silêncio, e o padrão fica no lugar.
