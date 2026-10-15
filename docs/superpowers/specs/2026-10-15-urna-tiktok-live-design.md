# Live Vote Arena — Urnas Eletrônicas com Integração TikTok LIVE

**Data:** 2026-10-15
**Status:** Design aprovado, aguardando plano de implementação

---

## 1. Objetivo

Um site para exibição durante transmissões ao vivo no TikTok, capturado pelo OBS em
1080×1920 (9:16). Presentes enviados pelos espectadores viram votos. Cada voto é
representado por uma **mão humana animada** que digita o número da urna, pressiona
CONFIRMA e deposita uma cédula na abertura superior de uma **urna eletrônica com
aparência de equipamento físico real**.

O resultado precisa parecer um equipamento de verdade em uma cabine de votação — não
caixas coloridas desenhadas com CSS básico.

### Critério de sucesso

O projeto está pronto quando for possível:

1. Abrir o site no PC e ver urnas com aparência de equipamento real
2. Simular o recebimento de uma Rosa e ver a mão ir até a Urna 1
3. Ver o dedo digitar o número, pressionando as teclas
4. Ver a mão pressionar CONFIRMA
5. Ver a cédula entrar fisicamente na urna
6. Ver o placar atualizar
7. Simular Heart Me e ver a animação ocorrer na Urna 2
8. Cadastrar presentes e associá-los a urnas sem tocar em código
9. Rodar com eventos reais do TikTok LIVE
10. Capturar no OBS sem nenhum controle administrativo na tela

---

## 2. Escopo

### Dentro do escopo

- **2 urnas** — este é o caso principal e recebe todo o esforço visual
- Configuração de 2 a 6 urnas (3+ cai em grade simples, sem maquinaria dedicada)
- Cenário de cabine eleitoral
- Mão humana articulada com sequência completa de votação
- Motor de votação com ledger persistente
- Fila de animação com priorização e modo lote
- Painel administrativo
- Modo de teste usando o mesmo pipeline do evento real
- Adaptador TikTok LIVE isolado (implementado na Etapa 7)

### Fora do escopo

- Three.js, Unity, Unreal — proibidos
- Múltiplas câmeras, carrossel de urnas, panning
- Múltiplas salas ou múltiplos streamers simultâneos
- Login/autenticação multiusuário
- Sprites fotorrealistas da mão (a arquitetura fica pronta, os assets não são produzidos)

### Decisões já tomadas

| Decisão | Escolha | Justificativa |
|---|---|---|
| Renderização da urna | CSS 3D (volume) + SVG/DOM (face frontal) | A mão precisa da coordenada exata de cada tecla; teclas como elementos DOM dão isso de graça em qualquer resolução |
| Mão | SVG articulado, com camada de render trocável | Melhor realismo possível sem assets externos; sprites entram depois sem reescrever a coreografia |
| Estilo da urna | Urna eletrônica brasileira (TSE) | Silhueta reconhecível, teclado com relevo, fileira BRANCO/CORRIGE/CONFIRMA |
| Backend | Node.js | `tiktok-live-connector` é Node; servidor estático e WebSocket na mesma porta |
| Persistência | `node:sqlite` (nativo do Node 24) | Zero dependência nativa, sem compilação no Windows |
| Integração TikTok | Adaptador isolado, implementado na Etapa 7 | Permite entregar e validar todo o resto antes |

---

## 3. Arquitetura

```
TikTok LIVE  ─┐
              ├─→ EventSource ─→ normaliza ─→ deduplica ─→ mapeia presente→urna
Simulador   ─┘                                                │
                                                              ▼
                                                    ┌─────────────────┐
                                                    │  LEDGER SQLite  │  ← verdade
                                                    │  + tally em RAM │
                                                    └────────┬────────┘
                                                             │
                              ┌──────────────────────────────┼──────────────────────────┐
                              ▼                              ▼                          ▼
                     ws: tally.update              ws: vote.animate            ws: lead.changed
                     (placar atualiza NA HORA)     (entra na fila visual)      (evento de ultrapassagem)
                              │                              │
                              ▼                              ▼
                     ┌────────────────┐            ┌──────────────────┐
                     │   PLACAR       │            │  FILA DE ANIMAÇÃO │
                     │  (imediato)    │            │  (1 por vez)      │
                     └────────────────┘            └────────┬─────────┘
                                                              ▼
                                                    ┌──────────────────┐
                                                    │ CENA + MÃO + URNA│
                                                    └──────────────────┘
```

**Princípio central:** verdade e teatro são separados. O placar nunca espera a
animação. A fila controla apenas o espetáculo. Um voto jamais é perdido porque a
fila visual está cheia — nesse caso a *animação* degrada, o voto não.

---

## 4. Componentes

### 4.1 Cenário (`scene.js` + `scene.css`)

Cabine eleitoral em perspectiva frontal, sem movimento de deslocamento.

- Parede creme com painéis (gradientes verticais + linhas de junção)
- Mesa de madeira com veio sutil (`repeating-linear-gradient` de baixa opacidade)
- Piso claro com reflexo tênue das urnas
- Armário/bircot ao fundo
- Iluminação ambiente de cima para baixo: vinheta radial escurecendo os cantos
- Sombras de contato elípticas sob cada urna e sob a mão
- Desfoque de fundo (`filter: blur()`) nos elementos traseiros para profundidade de campo

Movimentos de câmera permitidos (apenas estes):

- Push-in sutil (~2% de escala, 900ms) na troca de liderança
- Push-in + leve rotação na vitória
- Micro-recuo na confirmação de voto raro

### 4.2 Urna (`urna.js` + `urna.css`)

Estrutura de cada urna:

```
.perspectiva
└── .urna                          transform-style: preserve-3d
    ├── .urna__lado                plano lateral
    ├── .urna__topo                plano superior + abertura de cédula
    ├── .urna__face                painel frontal inclinado
    │   ├── .urna__tela            LCD
    │   ├── .urna__teclado         10 teclas numéricas + 3 de ação
    │   │   └── .tecla             tecla real (DOM), com LED
    │   ├── .urna__slot            abertura de cédula
    │   └── .urna__placa           placa, parafusos, frisos, respiros
    ├── .urna__glow                luz colorida vazando na mesa
    └── .urna__sombra              sombra de contato
```

**Layout do teclado:**

```
      ┌───┬───┬───┐
      │ 1 │ 2 │ 3 │
      ├───┼───┼───┤
      │ 4 │ 5 │ 6 │
      ├───┼───┼───┤
      │ 7 │ 8 │ 9 │
      ├───┼───┼───┤
      │   │ 0 │   │
      └───┴───┴───┘
   ┌──────┬─────────┬──────────┐
   │BRANCO│ CORRIGE │ CONFIRMA │
   └──────┴─────────┴──────────┘
```

**Materiais sem imagem:**

| Material | Técnica |
|---|---|
| Plástico do gabinete | `linear-gradient` a 160° com 5 paradas + `repeating-linear-gradient` a 3% para grão |
| Metal | gradiente de alto contraste, bandas claras/escuras alternadas |
| Parafusos | `radial-gradient` circular + fenda rotacionada |
| Respiros | `repeating-linear-gradient` de linhas escuras |
| Vidro da tela | `::after` com gradiente diagonal branco a 8% |
| Brilho da tela | `box-shadow` com a cor da urna em baixa opacidade |

**Estados da tecla:**

- `repouso` — relevo, gradiente, luz superior, sombra projetada
- `pressionada` — `translateZ` para dentro, sombra encolhe, sombra interna
- LED individual sob cada tecla, apagado/aceso

**Tela LCD:**

| Situação | Conteúdo |
|---|---|
| Ocioso | Número da urna, nome, ícone, total de votos |
| Digitando | Dígitos aparecem um a um |
| Confirmado | `VOTO CONFIRMADO` + contagem + flash |
| Erro | `VOTO NULO` ou `CORRIJA` |

Sobreposições da tela: scanlines horizontais, brilho radial, reflexo de vidro.

### 4.3 Mão (`hand/`)

**Estrutura SVG:**

```
.mão
└── .mão__antebraço              manga azul
    └── .mão__punho
        └── .mão__palma          vincos, tenar/hipotenar, tendões
            ├── .dedo--polegar   3 falanges
            ├── .dedo--indicador 3 falanges
            ├── .dedo--médio     3 falanges
            ├── .dedo--anel      3 falanges
            └── .dedo--mindinho  3 falanges
```

Cada falange é um `<g>` com `transform-origin` no pivô da junta.

**Realismo sem foto:**

- Gradiente de pele: mais claro nas juntas, mais escuro nos vincos
- Linhas de tendão no dorso (bezier finos, baixa opacidade)
- Unha: gradiente vertical + lúnula + ponto especular
- 2–3 arcos de vinco por junta a ~12% de opacidade
- Oclusão ambiente onde os dedos se sobrepõem
- **Sombra projetada separada** — elipse desfocada que acompanha a mão e se afasta
  quando ela levanta. É o elemento que mais vende o volume.

**Camada de render trocável:**

```
HandRenderer (interface)
├── SvgHandRenderer      ← implementado agora
└── SpriteHandRenderer   ← implementado depois, consome PNGs nomeados
```

A coreografia emite **poses nomeadas**, nunca ângulos. Trocar o renderizador não
altera a animação.

Poses: `repouso`, `apontando`, `pressionando`, `segurando`, `inserindo`, `retraindo`.

### 4.4 Motor de animação (`anim/`)

**`timeline.js`** — motor de keyframes próprio, sem biblioteca externa.

- Um único `requestAnimationFrame` para toda a aplicação, não um por animação
- Presets de easing: `easeInOutCubic`, `easeOutBack` (pressão), `easeOutElastic` (contador)
- `Timeline.speed(multiplicador)` para aceleração em picos
- Timelines são recicladas após uso (evita pressão de GC em lives longas)

**`queue.js`** — fila de animação.

- `maxSimultaneas = 1` — só existe uma mão, ela só pode estar em um lugar
- Prioridade: presentes raros furam a fila
- **Modo lote:** quando a fila passa de `limiteFila` (padrão 8), os excedentes viram
  um selo rápido na urna em vez da sequência completa
- Watchdog: timeline que passar de 2× a duração esperada é forçada a terminar e a
  fila segue

**`vote-sequence.js`** — as 17 etapas do seu fluxo, em 9 fases:

| Fase | Duração (1×) | O que acontece |
|---|---|---|
| P0 Anúncio | 600ms | Ícone do presente voa até a urna, LEDs acendem |
| P1 Aproximação | 700ms | Mão entra por baixo em arco |
| P2 Digitação | 450ms/dígito | Mão vai à tecla, dedo estende, tecla afunda, LCD mostra o dígito |
| P3 Confirma | 700ms | Mão vai ao CONFIRMA, pressiona, LED verde |
| P4 Confirmado | 600ms | LCD mostra `VOTO CONFIRMADO`, flash na tela |
| P5 Cédula | 700ms | Papel sai da impressora |
| P6 Depósito | 900ms | Mão pega, leva até o slot superior, insere |
| P7 Contagem | 600ms | Contador rola, barra anima, explosão de efeito |
| P8 Retirada | 400ms | Mão se retira |

**Total ≈ 4,5s a 1×.** Multiplicadores: 1×, 1,5×, 2×, 4×.

### 4.5 Motor de votação (`server/tally.js`)

Ordem de processamento, sem exceção:

1. Evento chega da fonte (simulador ou TikTok)
2. Normaliza para formato comum
3. **Deduplica** pela chave `plataforma:userId:giftId:timestamp:comboIndex`
4. Mapeia o presente para a urna conforme configuração
5. Grava no ledger SQLite
6. Aplica ao tally em memória
7. Verifica troca de liderança / empate
8. Faz broadcast de `tally.update` (imediato) e `vote.animate` (enfileirado)

Se o passo 5 falhar, o tally em memória é mantido, a escrita é retentada e o erro é
registrado. A contagem nunca é perdida por falha de disco.

**Encerramento de rodada:** votos recebidos antes do fechamento são sempre contados.
A fila visual é drenada até o fim antes de exibir o resultado. Nenhum voto é perdido
por animação em andamento.

### 4.6 Placar (`scoreboard.js`)

Barra superior fixa, no estilo da referência:

- Título da disputa (configurável)
- Cronômetro grande
- `TOTAL` de votos · `APOIADORES` únicos
- Selo `{urna} À FRENTE` que muda de lado conforme a liderança
- Diferença entre primeiro e segundo

Dois cartões grandes, um por urna:

- Número e nome
- Total de votos em display gigante
- Percentual
- Barra de progresso na cor da urna
- Posição (1º / 2º)
- Último voto recebido (presente + usuário)
- Selo `% À FRENTE` no líder

Quando 3+ urnas estão ativas, os cartões viram linhas compactas com mini-barras.

**Animações de placar:**

| Evento | Texto padrão (configurável) |
|---|---|
| Ultrapassagem | `{urna} ASSUMIU A LIDERANÇA!` |
| Empate | `EMPATE NA DISPUTA!` |
| Vitória | `{urna} VENCEU!` |

### 4.7 Backend (`server/`)

- `index.js` — HTTP estático + hub WebSocket (`ws`), porta única (padrão 3000)
- `db.js` — esquema e acesso ao `node:sqlite`
- `tally.js` — contagem autoritativa
- `config.js` — carrega/valida/salva configuração, com fallback para o padrão
- `sources/base.js` — interface `EventSource`
- `sources/simulator.js` — modo de teste
- `sources/tiktok.js` — adaptador real (Etapa 7)

### 4.8 Painel administrativo (`admin.html` + `admin.js`)

Rota separada, nunca visível na captura de transmissão.

**Aba Urnas** — por urna: número, nome, cor primária, cor secundária, ícone,
imagem opcional, ordem, ativo/inativo, multiplicador de pontuação.

**Aba Mapeamento de Presentes** — por presente: nome, `giftId`, valor de referência
em moedas, urna de destino, quantidade de votos, ativo/inativo, efeito visual,
prioridade de animação, cooldown. Tabela editável com adicionar/remover/duplicar.

**Aba Rodada** — duração, início/encerramento manual, reset de contadores,
auto-iniciar próxima, política de fechamento.

**Aba Animação** — velocidade, aceleração automática em picos, limite da fila,
modo lote, movimento de câmera on/off.

**Aba Teste** — um botão por presente cadastrado, seletor de urna de destino,
seletor de usuário simulado, envio em lote, iniciar/encerrar rodada, reset.

**Aba Integração** — modo (simulador / TikTok), `@usuário`, chave de assinatura,
status da conexão, log de eventos ao vivo.

**Aba Textos** — todas as mensagens dinâmicas editáveis.

---

## 5. Fluxo de dados

### Protocolo WebSocket

**Cliente → Servidor:**

| Mensagem | Payload |
|---|---|
| `hello` | `{ tipo: 'broadcast' \| 'admin' }` |
| `state.request` | — (ressincronização completa) |
| `sim.gift` | `{ giftId, userId, userName, combo }` |
| `round.start` / `round.stop` / `round.reset` | — |
| `config.update` | `{ config }` |
| `anim.speed` | `{ velocidade }` |

**Servidor → Cliente:**

| Mensagem | Payload |
|---|---|
| `state.full` | `{ config, tally, rodada, votosRecentes, fonte }` |
| `vote.counted` | `{ id, urnaId, userId, userNome, giftNome, votos, ts }` |
| `vote.animate` | `{ id, urnaId, giftId, userNome, votos, prioridade }` |
| `tally.update` | `{ urnas: [...], total, apoiadores, lider, diferenca }` |
| `round.update` | `{ estado, terminaEm, restante }` |
| `round.finished` | `{ resultado: [...] }` |
| `lead.changed` | `{ urnaId, anteriorId, empate }` |
| `source.status` | `{ modo, conectado, detalhe }` |
| `config.changed` | `{ config }` |

### Esquema do banco

```sql
CREATE TABLE rodadas (
  id                 TEXT PRIMARY KEY,
  numero             INTEGER NOT NULL,
  iniciada_em        INTEGER NOT NULL,
  encerrada_em       INTEGER,
  duracao_segundos   INTEGER NOT NULL
);

CREATE TABLE votos (
  id           TEXT PRIMARY KEY,   -- chave de deduplicação
  ts           INTEGER NOT NULL,
  rodada_id    TEXT NOT NULL,
  urna_id      TEXT NOT NULL,
  plataforma   TEXT NOT NULL,      -- 'simulador' | 'tiktok'
  user_id      TEXT NOT NULL,
  user_nome    TEXT NOT NULL,
  gift_id      TEXT NOT NULL,
  gift_nome    TEXT NOT NULL,
  combo        INTEGER NOT NULL DEFAULT 1,
  votos        INTEGER NOT NULL,
  moedas       INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (rodada_id) REFERENCES rodadas(id)
);

CREATE INDEX idx_votos_rodada ON votos(rodada_id);
CREATE INDEX idx_votos_urna   ON votos(rodada_id, urna_id);
```

Ao carregar, o cliente pede `state.request` e recebe o tally completo reconstruído do
banco. Recarregar a página no meio de uma rodada não perde nada.

---

## 6. Configuração

`config/default.json` — todos os valores editáveis pelo painel, nenhuma associação
fixa no código.

```json
{
  "urnas": [
    {
      "id": "u1",
      "numero": "22",
      "nome": "URNA 1",
      "corPrimaria": "#1a5fd0",
      "corSecundaria": "#0d3a8f",
      "corTexto": "#ffffff",
      "icone": "estrela",
      "imagem": null,
      "ordem": 1,
      "ativo": true,
      "multiplicador": 1
    },
    {
      "id": "u2",
      "numero": "13",
      "nome": "URNA 2",
      "corPrimaria": "#e02020",
      "corSecundaria": "#8f0d0d",
      "corTexto": "#ffffff",
      "icone": "coracao",
      "imagem": null,
      "ordem": 2,
      "ativo": true,
      "multiplicador": 1
    }
  ],
  "presentes": [
    { "id": "rosa",     "nome": "Rosa",     "giftId": 5655, "moedas": 1,  "urnaId": "u1",
      "votos": 1,  "ativo": true, "efeito": "flores",  "prioridade": "normal", "cooldownMs": 0 },
    { "id": "heartme",  "nome": "Heart Me", "giftId": 7934, "moedas": 1,  "urnaId": "u2",
      "votos": 1,  "ativo": true, "efeito": "coracoes","prioridade": "normal", "cooldownMs": 0 },
    { "id": "especial", "nome": "Presente Especial", "giftId": null, "moedas": 100, "urnaId": "u1",
      "votos": 5,  "ativo": true, "efeito": "explosao","prioridade": "alta",   "cooldownMs": 0 },
    { "id": "raro",     "nome": "Presente Raro",     "giftId": null, "moedas": 500, "urnaId": "u2",
      "votos": 10, "ativo": true, "efeito": "lendario","prioridade": "maxima", "cooldownMs": 0 }
  ],
  "rodada": {
    "duracaoSegundos": 300,
    "autoIniciar": true,
    "autoProximaRodada": false,
    "politicaFechamento": "processar-recebidos"
  },
  "animacao": {
    "velocidade": 1.0,
    "aceleracaoAutomatica": true,
    "limiteFila": 8,
    "maxSimultaneas": 1,
    "modoLote": true,
    "movimentoCamera": true
  },
  "placar": {
    "titulo": "DISPUTA DE URNAS",
    "mensagemLideranca": "{urna} ASSUMIU A LIDERANÇA!",
    "mensagemEmpate": "EMPATE NA DISPUTA!",
    "mensagemVitoria": "{urna} VENCEU!"
  },
  "integracao": {
    "modo": "simulador",
    "tiktokUsername": "",
    "signatureKey": ""
  }
}
```

Configurações salvas pelo painel vão para `config/local.json`, que sobrepõe o padrão.
O padrão nunca é sobrescrito — dá para restaurar a qualquer momento.

### 6.1 Regra de pontuação

A contagem de votos tem **uma única fórmula**, sem ambiguidade:

```
votos = presente.votos × urna.multiplicador × (combo ?? 1)
```

| Campo | Onde vive | Papel |
|---|---|---|
| `presente.votos` | Mapeamento de Presentes | Quantos votos **aquele presente** vale. É o campo principal. |
| `urna.multiplicador` | Cadastro da Urna | Ajuste fino por urna. Padrão `1`. Serve para, por exemplo, uma urna "difícil" valer em dobro. |
| `combo` | Evento da plataforma | Multiplicador vindo do TikTok quando disponível. Padrão `1`. |

Exemplo: `Presente Raro` (`votos: 10`) enviado 3× em combo para a `Urna 2`
(`multiplicador: 1`) → `10 × 1 × 3 = 30` votos, e **uma única** entrada na fila de
animação.

### 6.2 Conjunto de ícones

Valores aceitos em `urna.icone`. São formas SVG embutidas, não emojis:

`estrela` · `coracao` · `coroa` · `trofeu` · `raio` · `escudo` · `diamante` · `fogo` ·
`folha` · `circulo`

Se `urna.imagem` estiver preenchido, a imagem substitui o ícone. O campo aceita um
caminho dentro de `public/assets/urnas/`.

### 6.3 Política de fechamento

Valores aceitos em `rodada.politicaFechamento`:

| Valor | Comportamento ao chegar a zero |
|---|---|
| `processar-recebidos` (padrão) | Votos já recebidos pelo servidor são contados; novos são recusados |
| `corte-exato` | Só conta o que chegou antes do instante exato do encerramento |
| `tolerancia-2s` | Aceita eventos com até 2s de atraso de rede antes de fechar |

Em qualquer das três, a fila visual é drenada até o fim antes de exibir o resultado.

---

## 7. Tratamento de erros e resiliência

| Situação | Comportamento |
|---|---|
| WebSocket cai | Reconexão com backoff exponencial 500ms → 8s, infinito. Ao reconectar, `state.request` |
| Animação lança exceção | `try/catch` na timeline; voto vira selo rápido e a fila segue |
| Animação trava | Watchdog em 2× a duração esperada força o término |
| Fila acima do limite | Modo lote — votos contam normalmente, animação degrada |
| Falha ao gravar no banco | Tally em memória mantido, escrita retentada, erro registrado |
| Config corrompida | Validação na carga, fallback para o padrão, erro registrado |
| Evento duplicado | Chave de deduplicação descarta a segunda ocorrência |
| Presente sem mapeamento | Registrado no log, não conta voto, admin notificado |
| Página recarregada | `state.request` reconstrói tudo do banco |

**Memória (lives de várias horas):** timelines recicladas, nós de efeito removidos do
DOM ao terminar, histórico de votos recentes limitado em memória, log rotativo.

---

## 8. Testes

Apenas os críticos, conforme sua Etapa 6.

| # | Teste | Resultado esperado |
|---|---|---|
| 1 | Mesmo evento enviado duas vezes | 1 voto contado |
| 2 | Presente com combo = 5 | 5 votos, 1 entrada na fila |
| 3 | 50 votos em rajada | Todos contados, animação degrada para lote |
| 4 | Rodada encerra com animação em andamento | Voto contado, animação termina |
| 5 | Recarregar a página no meio da rodada | Tally restaurado do banco |
| 6 | Derrubar e restabelecer o WebSocket | Nenhum voto contado em dobro |
| 7 | Simulador e TikTok no mesmo pipeline | Mesmo resultado para o mesmo evento |
| 8 | Rodar 6 horas seguidas | Sem crescimento de memória, sem travamento |

---

## 9. Estrutura de arquivos

```
tiktok-live-urna/
├─ package.json
├─ README.md
├─ config/
│  ├─ default.json
│  └─ local.json                  (gerado pelo painel)
├─ docs/superpowers/specs/
│  └─ 2026-10-15-urna-tiktok-live-design.md
├─ server/
│  ├─ index.js                    HTTP + WebSocket
│  ├─ db.js                       node:sqlite
│  ├─ tally.js                    contagem autoritativa
│  ├─ config.js                   carga/validação/persistência
│  └─ sources/
│     ├─ base.js                  interface EventSource
│     ├─ simulator.js             modo de teste
│     └─ tiktok.js                adaptador real (Etapa 7)
└─ public/
   ├─ broadcast.html              ROTA DA LIVE (OBS)
   ├─ admin.html                  ROTA ADMIN
   ├─ css/
   │  ├─ tokens.css               cores, medidas, tipografia
   │  ├─ scene.css                cenário e iluminação
   │  ├─ urna.css                 a urna em CSS 3D
   │  ├─ hand.css                 mão e sombra projetada
   │  ├─ scoreboard.css           placar
   │  └─ animations.css           keyframes e efeitos
   ├─ js/
   │  ├─ net.js                   WebSocket + reconexão
   │  ├─ scene.js                 cenário, câmera, layouts
   │  ├─ urna.js                  componente urna
   │  ├─ scoreboard.js            placar
   │  ├─ broadcast.js             orquestração da rota da live
   │  ├─ admin.js                 painel
   │  ├─ effects.js               partículas e explosões
   │  ├─ hand/
   │  │  ├─ hand-renderer.js      interface
   │  │  ├─ hand-svg.js           mão SVG articulada
   │  │  └─ hand-sprite.js        (stub documentado)
   │  └─ anim/
   │     ├─ timeline.js           motor de keyframes
   │     ├─ queue.js              fila de animação
   │     └─ vote-sequence.js      as 9 fases do voto
   └─ assets/
      ├─ hand/                    SVG da mão (e futuros sprites)
      └─ sfx/                     sons opcionais
```

---

## 10. Etapas de entrega

| # | Entrega | Marco de verificação |
|---|---|---|
| 1 | Cenário + **uma** urna realista | Abrir e acreditar que é equipamento |
| 2 | Mão digitando, confirmando, depositando | Sequência completa das 17 etapas |
| 3 | Mão navega entre as duas urnas | Voto na Urna 2 acontece na Urna 2 |
| 4 | Motor de votação, placar, ranking | Números ao vivo, ultrapassagem animada |
| 5 | Admin: urnas + mapeamento de presentes | Configurar tudo sem tocar em código |
| 6 | Testes críticos da seção 8 | Os 8 testes passando |
| 7 | TikTok LIVE | Adaptador real + documentação de limitações |
| 8 | OBS | 1080×1920 limpo, sem UI de admin |

**Pausa obrigatória após a Etapa 2** para validação visual antes de construir o resto.

---

## 11. Execução no Windows

```
npm install
npm start
```

- Live:  http://localhost:3000
- Admin: http://localhost:3000/admin

No OBS: fonte de navegador apontando para `http://localhost:3000`, 1080×1920,
com `?clean=1` para garantir a ausência de qualquer elemento administrativo.

Sem build, sem bundler, sem Apache. O servidor Node entrega os arquivos estáticos e o
WebSocket na mesma porta.

---

## 12. Riscos conhecidos

| Risco | Mitigação |
|---|---|
| Mão SVG não atingir realismo fotográfico | Camada de render trocável; sprites PNG entram sem reescrever a animação |
| `tiktok-live-connector` exigir chave de assinatura paga | Documentado no README; modo simulador continua funcional sem ela |
| TikTok mudar o protocolo interno | Adaptador isolado em um único arquivo; falha não afeta o resto |
| Muitos presentes em pico derrubarem o visual | Modo lote + aceleração automática + watchdog |
| Live longa vazar memória | Reciclagem de timelines, limpeza de DOM, teste de 6 horas |
