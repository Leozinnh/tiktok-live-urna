# Live Vote Arena — Etapas 1–3 (Cenário, Urna, Mão) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o núcleo visual da Live Vote Arena — cenário de cabine, duas urnas eletrônicas com aparência de equipamento real, e uma mão humana que digita, confirma e deposita a cédula na urna correta.

**Architecture:** Motor de animação puro (sem DOM) dirigido por um único `requestAnimationFrame`, com renderizadores finos que aplicam o estado ao DOM/SVG. As teclas da urna são elementos DOM reais, então a geometria para o dedo acertar a tecla vem de `getBoundingClientRect()`, não de um mapa mantido à mão.

**Tech Stack:** HTML5, CSS3 (3D transforms), JavaScript ES Modules, SVG, `node:test` nativo do Node 24. Zero dependências de runtime, zero bundler.

**Spec:** `docs/superpowers/specs/2026-10-15-urna-tiktok-live-design.md`

## Global Constraints

- **Sem Three.js, sem Unity, sem Unreal.** Apenas HTML/CSS/JS/SVG/Canvas 2D.
- **Sem bundler, sem build.** Os arquivos rodam como estão, servidos por `node server/index.js`.
- **Zero dependências de produção.** `package.json` sem `dependencies`. Testes usam `node:test` embutido.
- **Sem emojis** como representação de urnas, mãos, teclas ou ícones. Ícones são formas SVG.
- **Idioma da interface:** português do Brasil. Identificadores de código em português quando o domínio é em português (`urna`, `tecla`, `cedula`, `votos`), inglês para infraestrutura (`queue`, `timeline`, `ticker`).
- **Alvo de exibição:** 1080×1920 (9:16), sem barras de rolagem.
- **Módulos do motor não podem importar nada do DOM.** `easing.js`, `timeline.js`, `queue.js`, `poses.js`, `vote-sequence.js` devem rodar no Node puro.
- **Nenhuma coordenada de tecla pode ser fixada em código.** Toda posição vem de medição do DOM em tempo de execução.
- **Commit ao fim de cada tarefa**, com a linha `Co-Authored-By: Claude Code <noreply@anthropic.com>`.

## Review Focus

Classes de entrada e modos de falha que a spec implica mas nenhum teste cobre diretamente. Cada uma vira um teste na tarefa dona do código.

1. **Aba em segundo plano.** `requestAnimationFrame` para quando a aba perde o foco. Ao voltar, o delta acumulado pode ser de minutos — sem clamp, a mão teleporta e a fila vota tudo de uma vez. Esperado: um delta grande avança no máximo um passo curto.
2. **Evento para a outra urna no meio da sequência.** Chega um voto para a Urna 2 enquanto a mão deposita a cédula na Urna 1. Esperado: a mão nunca abandona a cédula no ar nem teleporta; a nova sequência só começa quando a anterior termina por completo.
3. **Redimensionar a janela / OBS mudando a resolução da fonte.** As coordenadas medidas das teclas ficam obsoletas e o dedo passa a errar a tecla. Esperado: a geometria é remedida quando o tamanho muda.
4. **Sequência que lança exceção no meio.** Um erro na fase de depósito deixa a mão presa e a fila para de andar. Esperado: o erro é capturado, a urna é restaurada ao repouso e a fila avança.
5. **Live longa.** Timelines e nós de efeito acumulando por horas. Esperado: timelines são recicladas num pool limitado e nenhuma referência a nós removidos sobrevive.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `package.json` | Metadados, scripts `start` e `test`. Sem dependências. |
| `server/index.js` | Servidor HTTP estático. Só isto nesta fase — WebSocket vem na Etapa 4. |
| `public/broadcast.html` | Rota da live. Estrutura da cena. |
| `public/css/tokens.css` | Cores, medidas, tipografia, camadas (z-index). |
| `public/css/scene.css` | Cenário: parede, mesa, piso, iluminação, profundidade. |
| `public/css/urna.css` | Gabinete em CSS 3D, tela, teclado, detalhes de fabricação. |
| `public/css/hand.css` | Mão, sombra projetada, posicionamento do ator. |
| `public/js/anim/easing.js` | Funções de easing puras. |
| `public/js/anim/timeline.js` | Motor de keyframes + `Ticker` único + pool. |
| `public/js/anim/queue.js` | Fila de animação: prioridade, modo lote, watchdog. |
| `public/js/hand/poses.js` | Dados de pose, interpolação, mesclagem. |
| `public/js/hand/hand-svg.js` | Renderizador: aplica poses ao SVG. |
| `public/js/urna.js` | Componente urna: criação, estado, medição de geometria. |
| `public/js/scene.js` | Montagem do cenário, câmera, movimento sutil. |
| `public/js/vote-sequence.js` | Constrói a timeline das 17 etapas a partir da geometria. Puro. |
| `public/js/hand-actor.js` | Ator da mão: deslocamento entre urnas, ponte DOM↔motor. |
| `public/js/demo.js` | Controles de demonstração para validar as Etapas 1–3. |
| `tests/*.test.js` | Testes com `node:test`. |

---

### Task 1: Scaffolding e servidor estático

**Files:**
- Create: `package.json`
- Create: `server/index.js`
- Create: `public/broadcast.html`
- Test: `tests/server.test.js`

**Interfaces:**
- Consumes: nada
- Produces: `criarServidor({ raiz })` → `http.Server` (de `server/index.js`); página servida em `http://localhost:3000/`

- [ ] **Step 1: Escrever o teste que falha**

```js
// tests/server.test.js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarServidor } from '../server/index.js';

let servidor;
let base;

before(async () => {
  servidor = criarServidor({ raiz: new URL('../public/', import.meta.url).pathname });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => servidor.close());

test('serve broadcast.html na raiz', async () => {
  const r = await fetch(`${base}/`);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /id="cena"/);
});

test('serve CSS com o content-type correto', async () => {
  const r = await fetch(`${base}/css/tokens.css`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/css/);
});

test('recusa travessia de diretório', async () => {
  const r = await fetch(`${base}/../package.json`);
  assert.ok(r.status === 403 || r.status === 404);
});

test('responde 404 para arquivo inexistente', async () => {
  const r = await fetch(`${base}/nao-existe.js`);
  assert.equal(r.status, 404);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/server.test.js`
Expected: FAIL — `Cannot find module '../server/index.js'`

- [ ] **Step 3: Implementar o servidor**

```js
// server/index.js
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

export function criarServidor({ raiz }) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let caminho = decodeURIComponent(url.pathname);
      if (caminho === '/' || caminho === '/admin') caminho = '/broadcast.html';

      // normalize() resolve '..' antes de juntarmos, e conferimos se o
      // resultado continua dentro da raiz.
      const destino = normalize(join(raiz, caminho));
      const raizNormalizada = normalize(raiz + sep);
      if (!destino.startsWith(raizNormalizada)) {
        res.writeHead(403).end('Proibido');
        return;
      }

      const info = await stat(destino);
      if (!info.isFile()) {
        res.writeHead(404).end('Não encontrado');
        return;
      }

      const corpo = await readFile(destino);
      res.writeHead(200, {
        'content-type': TIPOS[extname(destino)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(corpo);
    } catch {
      res.writeHead(404).end('Não encontrado');
    }
  });
}

// Só sobe o servidor quando executado direto, não quando importado pelo teste.
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const raiz = new URL('../public/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const porta = Number(process.env.PORT ?? 3000);
  criarServidor({ raiz }).listen(porta, () => {
    console.log(`\n  Live Vote Arena`);
    console.log(`  Live:  http://localhost:${porta}\n`);
  });
}
```

```json
// package.json
{
  "name": "tiktok-live-urna",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Live Vote Arena — urnas eletrônicas com animação humana para TikTok LIVE",
  "scripts": {
    "start": "node server/index.js",
    "test": "node --test tests/"
  },
  "engines": { "node": ">=22" }
}
```

- [ ] **Step 4: Criar o HTML mínimo e o CSS placeholder**

```html
<!-- public/broadcast.html -->
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Live Vote Arena</title>
  <link rel="stylesheet" href="/css/tokens.css">
  <link rel="stylesheet" href="/css/scene.css">
  <link rel="stylesheet" href="/css/urna.css">
  <link rel="stylesheet" href="/css/hand.css">
</head>
<body>
  <main id="cena" class="cena" aria-label="Arena de votação"></main>
  <script type="module" src="/js/demo.js"></script>
</body>
</html>
```

```css
/* public/css/tokens.css — versão mínima, expandida na Task 2 */
:root { color-scheme: dark; }
body { margin: 0; background: #0b0b0f; }
```

```css
/* public/css/scene.css, urna.css, hand.css — vazios por enquanto */
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `node --test tests/server.test.js`
Expected: PASS — 4 testes passando

- [ ] **Step 6: Verificar no navegador**

Run: `npm start`
Abra `http://localhost:3000` — deve mostrar uma página escura vazia, sem erro no console.

- [ ] **Step 7: Commit**

```bash
git add package.json server/index.js public tests
git commit -m "feat: servidor estático e scaffolding do projeto

Servidor HTTP sem dependências, com proteção contra travessia de
diretório. Estrutura de pastas de public/ e testes com node:test.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: Tokens e cenário da cabine

**Files:**
- Create: `public/css/tokens.css` (substitui a versão mínima)
- Create: `public/css/scene.css` (substitui a versão vazia)
- Modify: `public/broadcast.html` — adicionar as camadas do cenário
- Create: `public/js/scene.js` — monta o cenário

**Interfaces:**
- Consumes: `#cena` de `broadcast.html`
- Produces: `montarCenario(el)` → `{ el, camadaUrnas, camadaMao, camadaEfeitos }` — as três camadas onde as tarefas seguintes inserem conteúdo

- [ ] **Step 1: Escrever os tokens**

```css
/* public/css/tokens.css */
:root {
  color-scheme: dark;

  /* Paleta do cenário — cabine eleitoral */
  --parede-alta:      #efe4d2;
  --parede-baixa:     #ddceb6;
  --parede-junta:     #c9b89c;
  --mesa-clara:       #d99a4e;
  --mesa-escura:      #a86a28;
  --mesa-veio:        rgba(120, 70, 20, 0.18);
  --piso-claro:       #e6d9c4;
  --piso-escuro:      #c4b299;
  --armario:          #b98a52;
  --armario-escuro:   #8a6033;

  /* Gabinete da urna */
  --urna-plastico:    #e8e6e1;
  --urna-plastico-2:  #cfccc5;
  --urna-plastico-3:  #a8a49c;
  --urna-sombra:      #6f6c66;
  --urna-metal:       #b9bcc0;
  --urna-metal-2:     #7d8186;
  --urna-recesso:     #2a2a2e;
  --urna-recesso-2:   #141416;

  /* Teclado */
  --tecla-base:       #3a3d42;
  --tecla-base-2:     #22242a;
  --tecla-topo:       #55585e;
  --tecla-texto:      #f2f2f4;
  --tecla-branco:     #f4f4f0;
  --tecla-corrige:    #f08a1e;
  --tecla-confirma:   #22a04a;

  /* Tela LCD */
  --tela-fundo:       #1b2a1f;
  --tela-texto:       #b9f5c4;
  --tela-brilho:      rgba(150, 255, 170, 0.22);

  /* Urna 1 (azul) e Urna 2 (vermelha) */
  --u1-primaria:      #1a5fd0;
  --u1-secundaria:    #0d3a8f;
  --u2-primaria:      #e02020;
  --u2-secundaria:    #8f0d0d;

  /* Medidas de palco — base 1080x1920 */
  --palco-largura:    1080px;
  --palco-altura:     1920px;
  --mesa-topo:        62%;      /* onde o tampo da mesa cruza a tela */
  --urna-largura:     460px;
  --urna-altura:      560px;
  --urna-profundidade:70px;
  --perspectiva:      1600px;

  /* Camadas */
  --z-fundo:     10;
  --z-mesa:      20;
  --z-urna:      30;
  --z-mao:       40;
  --z-efeitos:   50;
  --z-placar:    60;

  /* Movimento */
  --transicao-curta:  180ms;
  --transicao-media:  420ms;
  --ease-padrao:      cubic-bezier(0.22, 0.61, 0.36, 1);
  --ease-pressao:     cubic-bezier(0.34, 1.4, 0.64, 1);
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  height: 100%;
  overflow: hidden;
  background: #0b0b0f;
  font-family: "Segoe UI", "Inter", system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 2: Escrever o cenário**

```css
/* public/css/scene.css */

/* O palco mantém 9:16 e escala para caber em qualquer janela.
   Nada de barra de rolagem em nenhum tamanho. */
.cena {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
}

.palco {
  position: relative;
  width: var(--palco-largura);
  height: var(--palco-altura);
  transform-origin: center center;
  /* --escala é escrita pelo JS */
  transform: scale(var(--escala, 0.5));
  perspective: var(--perspectiva);
  perspective-origin: 50% 42%;
  overflow: hidden;
}

/* ---------- Parede ---------- */
.parede {
  position: absolute;
  inset: 0;
  z-index: var(--z-fundo);
  background:
    /* vinheta: escurece os cantos, cria o clima de cabine */
    radial-gradient(120% 80% at 50% 18%,
      rgba(255, 248, 235, 0.35) 0%,
      rgba(140, 120, 95, 0.10) 45%,
      rgba(30, 22, 14, 0.55) 100%),
    linear-gradient(180deg, var(--parede-alta) 0%, var(--parede-baixa) 100%);
}

/* Painéis verticais da parede, com junta e brilho de topo */
.parede__painel {
  position: absolute;
  top: 0;
  bottom: 32%;
  width: 25.5%;
  background: linear-gradient(180deg,
    rgba(255, 255, 255, 0.16) 0%,
    rgba(255, 255, 255, 0.02) 18%,
    rgba(0, 0, 0, 0.05) 100%);
  border-right: 2px solid var(--parede-junta);
  box-shadow: inset -1px 0 2px rgba(255, 255, 255, 0.35);
}
.parede__painel:nth-child(1) { left: 0; }
.parede__painel:nth-child(2) { left: 25.5%; }
.parede__painel:nth-child(3) { left: 51%; }
.parede__painel:nth-child(4) { left: 76.5%; border-right: none; }

/* ---------- Armário ao fundo ---------- */
.armario {
  position: absolute;
  left: 2%;
  bottom: 30%;
  width: 20%;
  height: 30%;
  z-index: var(--z-fundo);
  border-radius: 6px 6px 0 0;
  background:
    repeating-linear-gradient(180deg,
      rgba(0, 0, 0, 0.10) 0 6px,
      rgba(0, 0, 0, 0) 6px 68px),
    linear-gradient(180deg, var(--armario) 0%, var(--armario-escuro) 100%);
  box-shadow:
    inset 0 3px 0 rgba(255, 235, 200, 0.35),
    14px 10px 34px rgba(40, 24, 8, 0.35);
  filter: blur(1.4px);   /* profundidade de campo */
}

/* ---------- Mesa ---------- */
.mesa {
  position: absolute;
  left: -6%;
  right: -6%;
  top: var(--mesa-topo);
  bottom: 0;
  z-index: var(--z-mesa);
}

.mesa__tampo {
  position: absolute;
  inset: 0 0 auto 0;
  height: 13%;
  background:
    repeating-linear-gradient(92deg,
      var(--mesa-veio) 0 3px,
      rgba(0, 0, 0, 0) 3px 26px),
    linear-gradient(180deg, var(--mesa-clara) 0%, var(--mesa-escura) 62%, #8a5316 100%);
  box-shadow:
    inset 0 4px 0 rgba(255, 220, 170, 0.5),
    inset 0 -6px 14px rgba(60, 30, 0, 0.45),
    0 22px 46px rgba(30, 18, 6, 0.5);
}

/* ---------- Piso ---------- */
.piso {
  position: absolute;
  left: -6%;
  right: -6%;
  top: calc(var(--mesa-topo) + 7%);
  bottom: -4%;
  background:
    linear-gradient(180deg, rgba(0, 0, 0, 0.30) 0%, rgba(0, 0, 0, 0) 22%),
    repeating-linear-gradient(88deg,
      rgba(150, 130, 100, 0.16) 0 2px,
      rgba(0, 0, 0, 0) 2px 90px),
    linear-gradient(180deg, var(--piso-escuro) 0%, var(--piso-claro) 100%);
}

/* Reflexo tênue das urnas no piso — preenchido por JS com a cor de cada urna */
.piso__reflexo {
  position: absolute;
  width: 300px;
  height: 120px;
  top: 8%;
  border-radius: 50%;
  filter: blur(28px);
  opacity: 0.18;
  pointer-events: none;
}

/* ---------- Camadas de conteúdo ---------- */
.camada {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
}
.camada--urnas   { z-index: var(--z-urna); }
.camada--mao     { z-index: var(--z-mao); pointer-events: none; }
.camada--efeitos { z-index: var(--z-efeitos); pointer-events: none; }
```

- [ ] **Step 3: Montar o cenário no JS**

```js
// public/js/scene.js
const PAINEIS = 4;

export function montarCenario(raiz) {
  raiz.innerHTML = `
    <div class="palco" id="palco">
      <div class="parede">
        ${Array.from({ length: PAINEIS }, () => '<div class="parede__painel"></div>').join('')}
      </div>
      <div class="armario"></div>
      <div class="mesa"><div class="mesa__tampo"></div></div>
      <div class="piso">
        <div class="piso__reflexo" data-reflexo="u1"></div>
        <div class="piso__reflexo" data-reflexo="u2" style="left:auto; right:12%"></div>
      </div>
      <div class="camada camada--urnas"   id="camada-urnas"></div>
      <div class="camada camada--mao"     id="camada-mao"></div>
      <div class="camada camada--efeitos" id="camada-efeitos"></div>
    </div>
  `;

  const palco = raiz.querySelector('#palco');

  // O palco é desenhado em 1080x1920 e escalado para caber na janela.
  // Redimensionar remede as teclas (ver Task 13), por isso avisamos.
  const ajustar = () => {
    const escala = Math.min(window.innerWidth / 1080, window.innerHeight / 1920);
    palco.style.setProperty('--escala', String(escala));
    window.dispatchEvent(new CustomEvent('palco:redimensionado', { detail: { escala } }));
  };
  ajustar();
  window.addEventListener('resize', ajustar);

  return {
    el: palco,
    camadaUrnas: raiz.querySelector('#camada-urnas'),
    camadaMao: raiz.querySelector('#camada-mao'),
    camadaEfeitos: raiz.querySelector('#camada-efeitos'),
  };
}
```

- [ ] **Step 4: Ligar no HTML e verificar visualmente**

Adicione em `broadcast.html`, dentro de `<main id="cena">`, nada — o `scene.js` preenche. Crie `public/js/demo.js` provisório:

```js
// public/js/demo.js
import { montarCenario } from './scene.js';
montarCenario(document.getElementById('cena'));
```

Run: `npm start` → abra `http://localhost:3000`

Expected: parede creme com painéis, armário desfocado à esquerda, mesa de madeira com veio, piso claro. Sem barra de rolagem. Redimensionar a janela mantém a proporção 9:16 centralizada.

- [ ] **Step 5: Verificar ausência de rolagem em vários tamanhos**

Run: no console do navegador —
```js
document.documentElement.scrollHeight === window.innerHeight &&
document.documentElement.scrollWidth === window.innerWidth
```
Expected: `true` em 1920×1080, 1080×1920 e 1280×720.

- [ ] **Step 6: Commit**

```bash
git add public/css/tokens.css public/css/scene.css public/js/scene.js public/js/demo.js
git commit -m "feat: cenário da cabine eleitoral com palco 9:16 escalável

Parede com painéis, armário desfocado ao fundo, mesa de madeira com
veio e piso com reflexo. Palco fixo em 1080x1920 escalado para caber
na janela, sem barras de rolagem.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: Urna — gabinete em CSS 3D

**Files:**
- Create: `public/css/urna.css`
- Modify: `public/js/scene.js` — as urnas passam a ser montadas na camada de urnas
- Create: `public/js/urna.js`
- Test: `tests/urna.test.js`

**Interfaces:**
- Consumes: `camadaUrnas` de `montarCenario()`
- Produces: `criarUrna(config)` → `{ el, config, definirTela, pressionarTecla, soltarTecla, medirGeometria }`
- Produces: `medirGeometria()` → `{ teclas: Record<string, {x, y, largura, altura}>, slot: {x,y}, tela: {x,y}, corpo: {x,y,largura,altura} }` — coordenadas relativas ao palco, em pixels do palco (1080×1920)

- [ ] **Step 1: Escrever o teste que falha**

O teste cobre a parte pura: normalizar a medição e converter para coordenadas do palco.

```js
// tests/urna.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paraCoordenadasDoPalco } from '../public/js/urna.js';

test('converte rect do viewport para coordenadas do palco', () => {
  // Palco de 1080x1920 escalado a 0.5 e posicionado em (100, 50)
  const palcoRect = { left: 100, top: 50, width: 540, height: 960 };
  const rect = { left: 370, top: 530, width: 108, height: 96 };
  const r = paraCoordenadasDoPalco(rect, palcoRect);

  // (370-100)/0.5 = 540 ; (530-50)/0.5 = 960
  assert.equal(r.x, 540);
  assert.equal(r.y, 960);
  // 108/0.5 = 216 ; 96/0.5 = 192
  assert.equal(r.largura, 216);
  assert.equal(r.altura, 192);
});

test('o centro da tecla é o ponto que a mão mira', () => {
  const palcoRect = { left: 0, top: 0, width: 1080, height: 1920 };
  const rect = { left: 10, top: 20, width: 100, height: 80 };
  const r = paraCoordenadasDoPalco(rect, palcoRect);
  assert.deepEqual(r.centro, { x: 60, y: 60 });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/urna.test.js`
Expected: FAIL — `paraCoordenadasDoPalco is not a function`

- [ ] **Step 3: Escrever o CSS do gabinete**

```css
/* public/css/urna.css */

.urna {
  position: absolute;
  width: var(--urna-largura);
  height: var(--urna-altura);
  transform-style: preserve-3d;
  /* Posição e inclinação definidas por JS via --x / --rot */
  left: var(--x, 0px);
  bottom: var(--y, 32%);
  transform: rotateY(var(--rot, 0deg)) rotateX(2deg);
}

/* ---------- Corpo: face frontal ---------- */
.urna__corpo {
  position: absolute;
  inset: 0;
  border-radius: 26px 26px 14px 14px;
  background:
    /* grão sutil de plástico */
    repeating-linear-gradient(101deg,
      rgba(255, 255, 255, 0.035) 0 1px,
      rgba(0, 0, 0, 0.025) 1px 3px),
    /* sombreamento geral: claro em cima, escuro embaixo */
    linear-gradient(168deg,
      var(--urna-plastico)    0%,
      var(--urna-plastico)    34%,
      var(--urna-plastico-2)  68%,
      var(--urna-plastico-3) 100%);
  box-shadow:
    /* luz de topo */
    inset 0 3px 0 rgba(255, 255, 255, 0.95),
    inset 0 -8px 18px rgba(60, 58, 52, 0.42),
    inset 3px 0 10px rgba(255, 255, 255, 0.35),
    inset -6px 0 16px rgba(70, 66, 60, 0.30),
    /* sombra projetada */
    0 26px 48px rgba(40, 26, 10, 0.45);
}

/* Topo do gabinete — dá a leitura de volume */
.urna__topo {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 74px;
  border-radius: 26px 26px 0 0;
  transform-origin: top center;
  transform: rotateX(-72deg) translateZ(6px);
  background: linear-gradient(180deg,
    #f6f5f1 0%,
    var(--urna-plastico) 40%,
    var(--urna-plastico-3) 100%);
  box-shadow:
    inset 0 2px 0 rgba(255, 255, 255, 0.9),
    0 8px 14px rgba(50, 36, 16, 0.30);
}

/* Lateral direita — o segundo plano que fecha o volume */
.urna__lado {
  position: absolute;
  top: 8px;
  right: -1px;
  width: var(--urna-profundidade);
  height: calc(100% - 16px);
  transform-origin: right center;
  transform: rotateY(76deg) translateZ(2px);
  border-radius: 0 10px 10px 0;
  background: linear-gradient(90deg,
    var(--urna-plastico-3) 0%,
    var(--urna-plastico-2) 55%,
    #8d8a83 100%);
  box-shadow: inset 0 0 22px rgba(40, 36, 30, 0.5);
}

/* Base — pé do gabinete, mais escuro, com pés de borracha */
.urna__base {
  position: absolute;
  left: 4%;
  right: 4%;
  bottom: -16px;
  height: 22px;
  border-radius: 6px 6px 12px 12px;
  background: linear-gradient(180deg, #55524c 0%, #2e2c28 100%);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.5);
}

/* Sombra de contato — o que "cola" a urna na mesa */
.urna__sombra {
  position: absolute;
  left: -8%;
  right: -8%;
  bottom: -34px;
  height: 70px;
  border-radius: 50%;
  background: radial-gradient(50% 50% at 50% 50%,
    rgba(30, 16, 4, 0.62) 0%,
    rgba(30, 16, 4, 0.30) 45%,
    rgba(30, 16, 4, 0) 78%);
  filter: blur(9px);
  transform: translateZ(-2px);
}
```

- [ ] **Step 4: Escrever o JS da urna (parte pura + parte DOM)**

```js
// public/js/urna.js
import { POSES } from './hand/poses.js';

/**
 * Converte um DOMRect do viewport para coordenadas do palco (1080x1920),
 * independentes da escala aplicada. É isto que permite a mão mirar a tecla
 * sem nenhum mapa de coordenadas fixo em código.
 */
export function paraCoordenadasDoPalco(rect, palcoRect) {
  const escala = palcoRect.width / 1080;
  const x = (rect.left - palcoRect.left) / escala;
  const y = (rect.top - palcoRect.top) / escala;
  const largura = rect.width / escala;
  const altura = rect.height / escala;
  return {
    x, y, largura, altura,
    centro: { x: x + largura / 2, y: y + altura / 2 },
  };
}

const TECLAS_NUMERICAS = ['1','2','3','4','5','6','7','8','9','0'];
const TECLAS_ACAO = [
  { id: 'BRANCO',   rotulo: 'BRANCO',   classe: 'tecla--branco' },
  { id: 'CORRIGE',  rotulo: 'CORRIGE',  classe: 'tecla--corrige' },
  { id: 'CONFIRMA', rotulo: 'CONFIRMA', classe: 'tecla--confirma' },
];

export function criarUrna(config) {
  const el = document.createElement('div');
  el.className = 'urna';
  el.dataset.urnaId = config.id;
  el.style.setProperty('--x', `${config.x}px`);
  el.style.setProperty('--y', `${config.y}%`);
  el.style.setProperty('--rot', `${config.rot ?? 0}deg`);
  el.style.setProperty('--cor-urna', config.corPrimaria);

  const grade = TECLAS_NUMERICAS.slice(0, 9);
  el.innerHTML = `
    <div class="urna__sombra"></div>
    <div class="urna__lado"></div>
    <div class="urna__topo">
      <div class="urna__slot" data-papel="entrada">
        <div class="urna__slot-boca"></div>
      </div>
    </div>
    <div class="urna__corpo">
      <div class="urna__placa">JUSTIÇA ELEITORAL</div>
      <div class="urna__tela" data-tela>
        <div class="tela__conteudo" data-tela-conteudo></div>
        <div class="tela__scanlines"></div>
        <div class="tela__vidro"></div>
      </div>
      <div class="urna__teclado">
        <div class="teclado__grade">
          ${grade.map((n) => `
            <button class="tecla" data-tecla="${n}" type="button">
              <span class="tecla__capa"><span class="tecla__rotulo">${n}</span></span>
              <span class="tecla__led"></span>
            </button>`).join('')}
        </div>
        <div class="teclado__acoes">
          ${TECLAS_ACAO.map((t) => `
            <button class="tecla tecla--acao ${t.classe}" data-tecla="${t.id}" type="button">
              <span class="tecla__capa"><span class="tecla__rotulo">${t.rotulo}</span></span>
              <span class="tecla__led"></span>
            </button>`).join('')}
        </div>
      </div>
      <div class="urna__respiros"></div>
      <div class="urna__parafusos">
        <span></span><span></span><span></span><span></span>
      </div>
    </div>
    <div class="urna__glow"></div>
  `;

  const telaConteudo = el.querySelector('[data-tela-conteudo]');

  function teclaEl(id) {
    return el.querySelector(`[data-tecla="${id}"]`);
  }

  /** Mede todas as teclas e pontos notáveis, em coordenadas do palco. */
  function medirGeometria() {
    const palco = el.closest('.palco');
    const palcoRect = palco.getBoundingClientRect();
    const teclas = {};
    for (const btn of el.querySelectorAll('[data-tecla]')) {
      teclas[btn.dataset.tecla] = paraCoordenadasDoPalco(btn.getBoundingClientRect(), palcoRect);
    }
    const slotEl = el.querySelector('[data-papel="entrada"]');
    const telaEl = el.querySelector('[data-tela]');
    return {
      teclas,
      slot: paraCoordenadasDoPalco(slotEl.getBoundingClientRect(), palcoRect),
      tela: paraCoordenadasDoPalco(telaEl.getBoundingClientRect(), palcoRect),
      corpo: paraCoordenadasDoPalco(el.getBoundingClientRect(), palcoRect),
    };
  }

  return {
    el,
    config,
    teclaEl,
    medirGeometria,
    definirTela(html) { telaConteudo.innerHTML = html; },
    pressionarTecla(id) {
      const t = teclaEl(id);
      if (t) t.classList.add('is-pressionada');
    },
    soltarTecla(id) {
      const t = teclaEl(id);
      if (t) t.classList.remove('is-pressionada');
    },
    acenderLed(id, ligado = true) {
      const t = teclaEl(id);
      if (t) t.classList.toggle('is-led', ligado);
    },
  };
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `node --test tests/urna.test.js`
Expected: PASS — 2 testes

- [ ] **Step 6: Montar a urna na cena e verificar visualmente**

Em `public/js/demo.js`:

```js
import { montarCenario } from './scene.js';
import { criarUrna } from './urna.js';

const { camadaUrnas } = montarCenario(document.getElementById('cena'));

camadaUrnas.append(
  criarUrna({ id: 'u1', x: 60,  y: 30, rot: -8, corPrimaria: '#1a5fd0' }).el,
  criarUrna({ id: 'u2', x: 580, y: 30, rot:  8, corPrimaria: '#e02020' }).el,
);
```

Run: `npm start` → `http://localhost:3000`

Expected: dois gabinetes cinza-claro com volume visível — topo e lateral dão a leitura 3D, base escura, sombra de contato sob cada um, leve rotação convergindo para o centro.

- [ ] **Step 7: Commit**

```bash
git add public/css/urna.css public/js/urna.js public/js/demo.js tests/urna.test.js
git commit -m "feat: gabinete da urna em CSS 3D com volume real

Face frontal, topo e lateral direita em preserve-3d, grão de plástico,
base escura, parafusos e sombra de contato. Medição de geometria
converte rect do viewport para coordenadas do palco, para a mão mirar
a tecla sem mapa de coordenadas fixo.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: Tela LCD

**Files:**
- Modify: `public/css/urna.css` — acrescentar a seção da tela
- Modify: `public/js/urna.js` — estados da tela
- Test: `tests/tela.test.js`

**Interfaces:**
- Consumes: `criarUrna()` da Task 3
- Produces: `estadoDaTela(urna, estado)` onde `estado` é `{ tipo, numeroDigitado, votos, mensagem }`; `tipos`: `'ocioso' | 'digitando' | 'confirmado' | 'corrija'`

- [ ] **Step 1: Escrever o teste que falha**

```js
// tests/tela.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderizarTela } from '../public/js/urna.js';

test('ocioso mostra número, nome e total de votos', () => {
  const html = renderizarTela({ tipo: 'ocioso', numero: '22', nome: 'URNA 1', votos: 61 });
  assert.match(html, /22/);
  assert.match(html, /URNA 1/);
  assert.match(html, /61/);
});

test('digitando mostra os dígitos já digitados, alinhados à direita', () => {
  const html = renderizarTela({ tipo: 'digitando', numeroDigitado: '2', numero: '22', votos: 0 });
  assert.match(html, /tela__digito/);
  assert.match(html, />2</);
});

test('confirmado mostra a mensagem e a contagem', () => {
  const html = renderizarTela({ tipo: 'confirmado', numero: '22', votos: 62, votosAdicionados: 1 });
  assert.match(html, /VOTO CONFIRMADO/);
  assert.match(html, /62/);
});

test('escapa HTML vindo do nome da urna', () => {
  const html = renderizarTela({ tipo: 'ocioso', numero: '22', nome: '<img src=x onerror=alert(1)>', votos: 0 });
  assert.ok(!html.includes('<img'));
  assert.match(html, /&lt;img/);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/tela.test.js`
Expected: FAIL — `renderizarTela is not a function`

- [ ] **Step 3: Implementar `renderizarTela`**

Adicione em `public/js/urna.js`:

```js
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * Produz o HTML interno da tela. Função pura — recebe o estado, devolve string.
 * O nome da urna vem da configuração do usuário, então é sempre escapado.
 */
export function renderizarTela(estado) {
  const { tipo } = estado;

  if (tipo === 'digitando') {
    const digitos = String(estado.numeroDigitado ?? '');
    const campos = String(estado.numero ?? '  ').split('').map((_, i) => {
      const d = digitos[i] ?? '';
      return `<span class="tela__digito${d ? ' is-preenchido' : ''}">${esc(d)}</span>`;
    }).join('');
    return `
      <div class="tela__linha tela__linha--topo">${esc(estado.nome ?? '')}</div>
      <div class="tela__numeros">${campos}</div>`;
  }

  if (tipo === 'confirmado') {
    return `
      <div class="tela__linha tela__linha--topo">${esc(estado.numero ?? '')}</div>
      <div class="tela__confirmado">VOTO CONFIRMADO</div>
      <div class="tela__contagem">${esc(estado.votos ?? 0)}</div>
      ${estado.votosAdicionados ? `<div class="tela__delta">+${esc(estado.votosAdicionados)}</div>` : ''}`;
  }

  if (tipo === 'corrija') {
    return `
      <div class="tela__linha tela__linha--topo">${esc(estado.numero ?? '')}</div>
      <div class="tela__corrija">VOTO NULO — CORRIJA</div>`;
  }

  return `
    <div class="tela__linha tela__linha--topo">${esc(estado.nome ?? '')}</div>
    <div class="tela__idle-numero">${esc(estado.numero ?? '')}</div>
    <div class="tela__idle-votos">${esc(estado.votos ?? 0)} VOTOS</div>`;
}
```

Ligue no objeto retornado por `criarUrna`, substituindo `definirTela`:

```js
    definirTela(estado) {
      telaConteudo.innerHTML = renderizarTela(estado);
    },
```

- [ ] **Step 4: Escrever o CSS da tela**

Acrescente em `public/css/urna.css`:

```css
/* ---------- Tela LCD ---------- */
.urna__tela {
  position: absolute;
  left: 26px;
  top: 96px;
  width: 232px;
  height: 168px;
  border-radius: 10px;
  overflow: hidden;
  background:
    radial-gradient(120% 100% at 50% 0%,
      rgba(180, 255, 200, 0.10) 0%,
      rgba(0, 0, 0, 0) 60%),
    linear-gradient(180deg, var(--tela-fundo) 0%, #0d1610 100%);
  box-shadow:
    /* moldura plástica ao redor do vidro */
    inset 0 0 0 7px #b6b3ac,
    inset 0 0 0 9px #8e8b84,
    /* brilho interno do LCD */
    inset 0 0 26px var(--tela-brilho),
    /* luz que a tela joga no plástico em volta */
    0 0 26px rgba(150, 255, 170, 0.14),
    0 10px 20px rgba(0, 0, 0, 0.35);
  font-family: "Consolas", "SF Mono", monospace;
  color: var(--tela-texto);
}

.tela__conteudo {
  position: absolute;
  inset: 9px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  padding: 6px 10px;
  text-shadow: 0 0 7px rgba(150, 255, 170, 0.75);
}

.tela__linha { font-size: 15px; letter-spacing: 0.08em; opacity: 0.85; }
.tela__linha--topo { text-align: center; }

.tela__idle-numero { font-size: 62px; line-height: 1; text-align: center; letter-spacing: 0.06em; }
.tela__idle-votos  { font-size: 15px; text-align: center; opacity: 0.8; letter-spacing: 0.12em; }

.tela__numeros { display: flex; justify-content: center; gap: 10px; }
.tela__digito {
  width: 52px;
  height: 68px;
  display: grid;
  place-items: center;
  font-size: 52px;
  line-height: 1;
  border-bottom: 3px solid rgba(150, 255, 170, 0.35);
  opacity: 0.35;
  transition: opacity 120ms linear;
}
.tela__digito.is-preenchido { opacity: 1; }

.tela__confirmado {
  font-size: 19px;
  text-align: center;
  letter-spacing: 0.05em;
  color: #d6ffdd;
  animation: tela-pisca 900ms steps(1, end) 2;
}
.tela__contagem { font-size: 46px; text-align: center; line-height: 1; }
.tela__delta {
  position: absolute;
  right: 12px;
  top: 10px;
  font-size: 20px;
  color: #eaffb0;
  animation: delta-sobe 900ms var(--ease-padrao) forwards;
}
.tela__corrija { font-size: 18px; text-align: center; color: #ffcf8a; }

@keyframes tela-pisca { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
@keyframes delta-sobe {
  from { opacity: 0; transform: translateY(10px); }
  35%  { opacity: 1; transform: translateY(0); }
  to   { opacity: 0; transform: translateY(-14px); }
}

/* Scanlines do LCD — o que faz parecer uma tela, e não uma imagem */
.tela__scanlines {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(180deg,
    rgba(0, 0, 0, 0.16) 0 1px,
    rgba(0, 0, 0, 0) 1px 3px);
  opacity: 0.55;
}

/* Reflexo do vidro */
.tela__vidro {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(147deg,
    rgba(255, 255, 255, 0.14) 0%,
    rgba(255, 255, 255, 0.05) 22%,
    rgba(255, 255, 255, 0) 46%,
    rgba(255, 255, 255, 0.03) 74%,
    rgba(255, 255, 255, 0) 100%);
  mix-blend-mode: screen;
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `node --test tests/tela.test.js`
Expected: PASS — 4 testes

- [ ] **Step 6: Verificar visualmente os quatro estados**

Em `demo.js`, acrescente após criar as urnas:

```js
const u1 = criarUrna({ id: 'u1', x: 60,  y: 30, rot: -8, corPrimaria: '#1a5fd0' });
const u2 = criarUrna({ id: 'u2', x: 580, y: 30, rot:  8, corPrimaria: '#e02020' });
camadaUrnas.append(u1.el, u2.el);

u1.definirTela({ tipo: 'ocioso', numero: '22', nome: 'URNA 1', votos: 61 });
u2.definirTela({ tipo: 'digitando', numero: '13', nome: 'URNA 2', numeroDigitado: '1' });
```

Run: `npm start`

Expected: a Urna 1 mostra `22 / URNA 1 / 61 VOTOS`; a Urna 2 mostra o primeiro dígito aceso e o segundo apagado. Dá para ver as scanlines e o reflexo diagonal do vidro. O plástico em volta da tela pega um leve verde da luz.

- [ ] **Step 7: Commit**

```bash
git add public/css/urna.css public/js/urna.js tests/tela.test.js
git commit -m "feat: tela LCD com brilho, scanlines e reflexo de vidro

Quatro estados (ocioso, digitando, confirmado, corrija) gerados por uma
função pura e testável. Nome da urna vem da configuração do usuário e
é sempre escapado antes de entrar no DOM.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: Teclado com teclas de relevo

**Files:**
- Modify: `public/css/urna.css` — seção do teclado
- Modify: `public/js/urna.js` — LEDs e estados
- Test: `tests/teclado.test.js`

**Interfaces:**
- Consumes: `criarUrna()` da Task 3
- Produces: teclas com `data-tecla` ∈ `{'1'..'9','0','BRANCO','CORRIGE','CONFIRMA'}`; `pressionarTecla(id)` / `soltarTecla(id)` / `acenderLed(id, ligado)`

- [ ] **Step 1: Escrever o teste que falha**

```js
// tests/teclado.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT_TECLADO, todasAsTeclas } from '../public/js/urna.js';

test('a grade numérica é 3x3 mais o zero', () => {
  assert.deepEqual(LAYOUT_TECLADO.grade, ['1','2','3','4','5','6','7','8','9']);
  assert.equal(LAYOUT_TECLADO.zero, '0');
});

test('as três teclas de ação são BRANCO, CORRIGE e CONFIRMA nessa ordem', () => {
  assert.deepEqual(LAYOUT_TECLADO.acoes.map((t) => t.id), ['BRANCO', 'CORRIGE', 'CONFIRMA']);
});

test('CONFIRMA é a única tecla cujo LED acende verde e fica aceso', () => {
  const confirma = LAYOUT_TECLADO.acoes.find((t) => t.id === 'CONFIRMA');
  const branco = LAYOUT_TECLADO.acoes.find((t) => t.id === 'BRANCO');
  assert.equal(confirma.ledPersistente, true);
  assert.equal(branco.ledPersistente, false);
});

test('todasAsTeclas devolve 13 teclas distintas', () => {
  const t = todasAsTeclas();
  assert.equal(t.length, 13);
  assert.equal(new Set(t).size, 13);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/teclado.test.js`
Expected: FAIL — `LAYOUT_TECLADO is not a function` / não exportado

- [ ] **Step 3: Declarar o layout e ajustar o componente**

Em `public/js/urna.js`, substitua as constantes `TECLAS_NUMERICAS` / `TECLAS_ACAO` por:

```js
export const LAYOUT_TECLADO = {
  grade: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
  zero: '0',
  acoes: [
    { id: 'BRANCO',   rotulo: 'BRANCO',   classe: 'tecla--branco',   ledPersistente: false },
    { id: 'CORRIGE',  rotulo: 'CORRIGE',  classe: 'tecla--corrige',  ledPersistente: false },
    { id: 'CONFIRMA', rotulo: 'CONFIRMA', classe: 'tecla--confirma', ledPersistente: true  },
  ],
};

export function todasAsTeclas() {
  return [...LAYOUT_TECLADO.grade, LAYOUT_TECLADO.zero, ...LAYOUT_TECLADO.acoes.map((t) => t.id)];
}
```

E no `innerHTML`, use `LAYOUT_TECLADO.grade` no lugar de `grade`.

- [ ] **Step 4: Escrever o CSS do teclado**

```css
/* ---------- Teclado ---------- */
.urna__teclado {
  position: absolute;
  right: 22px;
  top: 92px;
  width: 178px;
}

/* Recesso onde o teclado mora — dá profundidade ao conjunto */
.teclado__grade,
.teclado__acoes {
  position: relative;
  border-radius: 10px;
  padding: 8px;
  background: linear-gradient(180deg, #2c2e33 0%, #1a1c20 100%);
  box-shadow:
    inset 0 3px 8px rgba(0, 0, 0, 0.75),
    inset 0 -1px 0 rgba(255, 255, 255, 0.10),
    0 1px 0 rgba(255, 255, 255, 0.45);
}

.teclado__grade {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.teclado__acoes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
  margin-top: 9px;
  padding: 7px 6px;
}

/* ---------- A tecla ---------- */
.tecla {
  position: relative;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  aspect-ratio: 1 / 1;
  transform-style: preserve-3d;
  /* Perspectiva própria: a tecla afunda em relação a si mesma */
  perspective: 260px;
}

.teclado__acoes .tecla { aspect-ratio: 1 / 1.15; }

/* A capa é o que se move. Em repouso fica alta; pressionada, desce. */
.tecla__capa {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background:
    linear-gradient(180deg,
      var(--tecla-topo) 0%,
      var(--tecla-base) 42%,
      var(--tecla-base-2) 100%);
  box-shadow:
    /* luz de topo — o realce que dá o relevo */
    inset 0 2px 0 rgba(255, 255, 255, 0.38),
    inset 0 -3px 6px rgba(0, 0, 0, 0.55),
    /* sombra projetada no recesso */
    0 5px 0 #101114,
    0 7px 10px rgba(0, 0, 0, 0.6);
  transform: translateZ(0);
  transition:
    transform 90ms cubic-bezier(0.34, 1.4, 0.64, 1),
    box-shadow 90ms cubic-bezier(0.34, 1.4, 0.64, 1);
}

.tecla__rotulo {
  font-size: 26px;
  font-weight: 600;
  color: var(--tecla-texto);
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.7);
  user-select: none;
}

/* Tecla pressionada: a capa afunda 5px e a sombra some */
.tecla.is-pressionada .tecla__capa {
  transform: translateY(5px) translateZ(-2px) scaleY(0.97);
  box-shadow:
    inset 0 2px 5px rgba(0, 0, 0, 0.75),
    inset 0 -1px 0 rgba(255, 255, 255, 0.10),
    0 1px 0 #101114,
    0 1px 3px rgba(0, 0, 0, 0.5);
}

/* Teclas de ação — cores características da urna brasileira */
.tecla--branco   .tecla__capa { background: linear-gradient(180deg, #ffffff 0%, var(--tecla-branco) 45%, #cfcfc8 100%); }
.tecla--branco   .tecla__rotulo { color: #2a2a2a; text-shadow: 0 1px 0 rgba(255,255,255,0.8); }
.tecla--corrige  .tecla__capa { background: linear-gradient(180deg, #ffb154 0%, var(--tecla-corrige) 45%, #c96a0c 100%); }
.tecla--confirma .tecla__capa { background: linear-gradient(180deg, #4fd177 0%, var(--tecla-confirma) 45%, #167a35 100%); }
.tecla--acao .tecla__rotulo { font-size: 11px; letter-spacing: 0.06em; }

/* ---------- LED sob cada tecla ---------- */
.tecla__led {
  position: absolute;
  left: 50%;
  bottom: -3px;
  width: 26px;
  height: 3px;
  transform: translateX(-50%);
  border-radius: 2px;
  background: #16181c;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.9);
  transition: background 90ms linear, box-shadow 90ms linear;
}

.tecla.is-led .tecla__led {
  background: var(--tecla-led-cor, #7fdcff);
  box-shadow:
    0 0 8px var(--tecla-led-cor, #7fdcff),
    0 0 16px var(--tecla-led-cor, #7fdcff);
}

.tecla--confirma { --tecla-led-cor: #5cff8f; }
.tecla--corrige  { --tecla-led-cor: #ffb154; }
.tecla--branco   { --tecla-led-cor: #ffffff; }
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `node --test tests/teclado.test.js`
Expected: PASS — 4 testes

- [ ] **Step 6: Verificar visualmente o relevo e a pressão**

Em `demo.js`:

```js
// Demonstração temporária do relevo: pressiona e solta a tecla 5 em ciclo
const t5 = u1.teclaEl('5');
setInterval(() => {
  u1.pressionarTecla('5');
  u1.acenderLed('5', true);
  setTimeout(() => { u1.soltarTecla('5'); u1.acenderLed('5', false); }, 220);
}, 900);
```

Run: `npm start`

Expected: a tecla 5 afunda visivelmente com uma leve escala vertical, a sombra projetada encolhe, e o LED acende com halo azul. As teclas BRANCO/CORRIGE/CONFIRMA têm as cores características. Remova o `setInterval` depois de conferir.

- [ ] **Step 7: Commit**

```bash
git add public/css/urna.css public/js/urna.js tests/teclado.test.js
git commit -m "feat: teclado com teclas de relevo, pressão e LED individual

Treze teclas DOM reais (1-9, 0, BRANCO, CORRIGE, CONFIRMA). A capa
afunda com perspectiva própria e a sombra projetada encolhe na pressão.
Cada tecla tem LED com cor característica.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: Detalhes de fabricação, abertura de cédula e identidade da urna

**Files:**
- Modify: `public/css/urna.css` — placa, parafusos, respiros, slot, glow, cor de identidade
- Modify: `public/js/urna.js` — aplicar cor de identidade
- Test: `tests/identidade.test.js`

**Interfaces:**
- Consumes: `criarUrna(config)` da Task 3
- Produces: `aplicarIdentidade(el, config)` — escreve `--cor-urna`, `--cor-urna-2` e o `--tecla-led-cor` de todas as teclas

- [ ] **Step 1: Escrever o teste que falha**

```js
// tests/identidade.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { variaveisDeIdentidade } from '../public/js/urna.js';

test('produz as variáveis CSS a partir da configuração da urna', () => {
  const v = variaveisDeIdentidade({ corPrimaria: '#1a5fd0', corSecundaria: '#0d3a8f' });
  assert.equal(v['--cor-urna'], '#1a5fd0');
  assert.equal(v['--cor-urna-2'], '#0d3a8f');
});

test('usa a cor primária como cor secundária quando a secundária falta', () => {
  const v = variaveisDeIdentidade({ corPrimaria: '#e02020' });
  assert.equal(v['--cor-urna-2'], '#e02020');
});

test('recusa cor inválida e cai no cinza padrão', () => {
  const v = variaveisDeIdentidade({ corPrimaria: 'javascript:alert(1)' });
  assert.equal(v['--cor-urna'], '#8a8f98');
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/identidade.test.js`
Expected: FAIL — `variaveisDeIdentidade is not a function`

- [ ] **Step 3: Implementar**

Em `public/js/urna.js`:

```js
const COR_PADRAO = '#8a8f98';
const COR_VALIDA = /^#[0-9a-f]{3}$|^#[0-9a-f]{6}$|^#[0-9a-f]{8}$/i;

export function variaveisDeIdentidade(config) {
  const primaria = COR_VALIDA.test(config.corPrimaria ?? '') ? config.corPrimaria : COR_PADRAO;
  const secundaria = COR_VALIDA.test(config.corSecundaria ?? '') ? config.corSecundaria : primaria;
  return { '--cor-urna': primaria, '--cor-urna-2': secundaria };
}

export function aplicarIdentidade(el, config) {
  for (const [nome, valor] of Object.entries(variaveisDeIdentidade(config))) {
    el.style.setProperty(nome, valor);
  }
}
```

Use `aplicarIdentidade(el, config)` dentro de `criarUrna`, removendo o `--cor-urna` inline atual.

- [ ] **Step 4: Escrever o CSS dos detalhes**

```css
/* ---------- Placa de identificação ---------- */
.urna__placa {
  position: absolute;
  left: 26px;
  top: 44px;
  padding: 5px 14px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: #5a5750;
  background: linear-gradient(180deg, #d9d6cf 0%, #bcb8b0 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.9),
    inset 0 -1px 0 rgba(0, 0, 0, 0.18),
    0 1px 2px rgba(0, 0, 0, 0.22);
}

/* ---------- Parafusos ---------- */
.urna__parafusos span {
  position: absolute;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: radial-gradient(circle at 34% 30%,
    #f2f2f0 0%, var(--urna-metal) 42%, var(--urna-metal-2) 100%);
  box-shadow:
    inset 0 -1px 1px rgba(0, 0, 0, 0.45),
    0 1px 1px rgba(0, 0, 0, 0.35);
}
/* A fenda do parafuso */
.urna__parafusos span::after {
  content: '';
  position: absolute;
  inset: 44% 2px auto 2px;
  height: 1.5px;
  background: rgba(40, 38, 34, 0.75);
}
.urna__parafusos span:nth-child(1) { left: 16px;  top: 16px;    transform: rotate(24deg); }
.urna__parafusos span:nth-child(2) { right: 16px; top: 16px;    transform: rotate(-38deg); }
.urna__parafusos span:nth-child(3) { left: 16px;  bottom: 16px; transform: rotate(72deg); }
.urna__parafusos span:nth-child(4) { right: 16px; bottom: 16px; transform: rotate(8deg); }

/* ---------- Respiros ---------- */
.urna__respiros {
  position: absolute;
  left: 26px;
  bottom: 30px;
  width: 120px;
  height: 34px;
  border-radius: 4px;
  background:
    repeating-linear-gradient(180deg,
      rgba(0, 0, 0, 0.42) 0 2px,
      rgba(0, 0, 0, 0) 2px 5px),
    linear-gradient(180deg, #b8b5ae 0%, #9c988f 100%);
  box-shadow:
    inset 0 2px 5px rgba(0, 0, 0, 0.5),
    inset 0 -1px 0 rgba(255, 255, 255, 0.5);
}

/* ---------- Abertura de cédula (no topo) ---------- */
.urna__slot {
  position: absolute;
  left: 50%;
  top: 26px;
  width: 190px;
  height: 22px;
  transform: translateX(-50%);
  border-radius: 5px;
  background: linear-gradient(180deg, #cfccc5 0%, #a5a29a 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.75),
    0 2px 4px rgba(0, 0, 0, 0.35);
}

/* A boca escura por onde a cédula entra */
.urna__slot-boca {
  position: absolute;
  inset: 4px 10px;
  border-radius: 3px;
  background: linear-gradient(180deg, var(--urna-recesso-2) 0%, #000 100%);
  box-shadow:
    inset 0 3px 6px rgba(0, 0, 0, 1),
    inset 0 -1px 0 rgba(255, 255, 255, 0.12);
}

/* ---------- Luz de identidade vazando na mesa ---------- */
.urna__glow {
  position: absolute;
  left: 6%;
  right: 6%;
  bottom: -26px;
  height: 90px;
  border-radius: 50%;
  pointer-events: none;
  background: radial-gradient(50% 50% at 50% 50%,
    color-mix(in srgb, var(--cor-urna) 55%, transparent) 0%,
    transparent 72%);
  filter: blur(18px);
  opacity: 0.5;
  transition: opacity var(--transicao-media) var(--ease-padrao);
}

/* Estado de destaque — a urna "acende" quando recebe um voto */
.urna.is-destacada .urna__glow { opacity: 0.95; }
.urna.is-destacada .urna__corpo {
  box-shadow:
    inset 0 3px 0 rgba(255, 255, 255, 0.95),
    inset 0 -8px 18px rgba(60, 58, 52, 0.42),
    0 26px 48px rgba(40, 26, 10, 0.45),
    0 0 0 3px color-mix(in srgb, var(--cor-urna) 65%, transparent),
    0 0 42px color-mix(in srgb, var(--cor-urna) 55%, transparent);
}

/* Filete de identidade na base do gabinete */
.urna__corpo::after {
  content: '';
  position: absolute;
  left: 8%;
  right: 8%;
  bottom: 12px;
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(90deg,
    transparent 0%,
    var(--cor-urna) 22%,
    var(--cor-urna) 78%,
    transparent 100%);
  opacity: 0.85;
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `node --test tests/identidade.test.js`
Expected: PASS — 3 testes

- [ ] **Step 6: Verificar visualmente**

Em `demo.js`:

```js
u1.el.classList.add('is-destacada');   // alternar para comparar
```

Run: `npm start`

Expected: placa "JUSTIÇA ELEITORAL" com relevo, quatro parafusos com fenda, respiros, a abertura de cédula no topo com a boca escura, filete azul na base e o brilho azul vazando na mesa. Com `is-destacada`, o gabinete ganha um contorno e um halo azul.

- [ ] **Step 7: Commit**

```bash
git add public/css/urna.css public/js/urna.js tests/identidade.test.js
git commit -m "feat: detalhes de fabricação e identidade visual da urna

Placa, parafusos com fenda, respiros, abertura de cédula com boca
escura, filete e halo na cor da urna. Cores de identidade validadas
por regex antes de virarem variável CSS.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: Motor — easing

**Files:**
- Create: `public/js/anim/easing.js`
- Test: `tests/easing.test.js`

**Interfaces:**
- Consumes: nada
- Produces: `resolverEasing(e)` → `(t: number) => number`; constantes `linear`, `easeInOutCubic`, `easeOutCubic`, `easeInQuad`, `easeOutBack`, `easeOutElastic`

- [ ] **Step 1: Escrever o teste que falha**

```js
// tests/easing.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverEasing, linear, easeInOutCubic, easeOutBack, EASINGS } from '../public/js/anim/easing.js';

test('toda easing começa em 0 e termina em 1', () => {
  for (const [nome, fn] of Object.entries(EASINGS)) {
    assert.equal(fn(0), 0, `${nome} não começa em 0`);
    assert.equal(fn(1), 1, `${nome} não termina em 1`);
  }
});

test('linear é a identidade', () => {
  assert.equal(linear(0.37), 0.37);
});

test('easeInOutCubic é simétrica em torno do meio', () => {
  assert.equal(easeInOutCubic(0.5), 0.5);
  assert.ok(Math.abs(easeInOutCubic(0.25) + easeInOutCubic(0.75) - 1) < 1e-9);
});

test('easeOutBack ultrapassa 1 no meio do caminho', () => {
  assert.ok(easeOutBack(0.7) > 1, 'deveria passar de 1 para dar o efeito de "estalo"');
});

test('resolve uma easing por nome', () => {
  assert.equal(resolverEasing('linear'), linear);
  assert.equal(resolverEasing('in-out-cubic'), easeInOutCubic);
});

test('resolve uma easing passada como função', () => {
  const f = (t) => t * t;
  assert.equal(resolverEasing(f), f);
});

test('nome desconhecido cai em linear em vez de quebrar', () => {
  assert.equal(resolverEasing('nao-existe'), linear);
});

test('rejeita valores fora de 0..1', () => {
  assert.equal(resolverEasing('linear')(-0.5), 0);
  assert.equal(resolverEasing('linear')(1.5), 1);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/easing.test.js`
Expected: FAIL — `Cannot find module '../public/js/anim/easing.js'`

- [ ] **Step 3: Implementar**

```js
// public/js/anim/easing.js
// Funções puras. Nenhuma dependência de DOM — rodam no Node para os testes.

export const linear = (t) => t;

export const easeInQuad = (t) => t * t;

export const easeOutCubic = (t) => 1 - (1 - t) ** 3;

export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/** Passa de 1 e volta — dá o "estalo" da tecla sendo pressionada. */
export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

/** Oscila e assenta — usado no contador quando o número sobe. */
export const easeOutElastic = (t) => {
  if (t === 0 || t === 1) return t;
  const c4 = (2 * Math.PI) / 3;
  return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

export const EASINGS = {
  linear,
  'in-quad': easeInQuad,
  'out-cubic': easeOutCubic,
  'in-out-cubic': easeInOutCubic,
  'out-back': easeOutBack,
  'out-elastic': easeOutElastic,
};

const limita = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * Aceita um nome de easing, uma função, ou nada.
 * Nunca lança: um nome desconhecido vira linear, porque uma animação
 * que quebra no meio deixa a mão presa na tela.
 */
export function resolverEasing(e) {
  if (typeof e === 'function') return (t) => e(limita(t));
  const fn = EASINGS[e] ?? linear;
  return (t) => fn(limita(t));
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test tests/easing.test.js`
Expected: PASS — 8 testes

- [ ] **Step 5: Commit**

```bash
git add public/js/anim/easing.js tests/easing.test.js
git commit -m "feat: funções de easing puras com resolução tolerante a falha

Nome desconhecido cai em linear em vez de lançar, porque uma animação
que quebra no meio deixa a mão presa na tela.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 8: Motor — timeline e ticker único

**Files:**
- Create: `public/js/anim/timeline.js`
- Test: `tests/timeline.test.js`

**Interfaces:**
- Consumes: `resolverEasing` da Task 7
- Produces: `class Timeline` com `add(id, opts)`, `chamar(id, opts)`, `play()`, `pause()`, `cancelar()`, `setVelocidade(m)`, `tick(deltaMs)`, `reset()`, `get duracao()`, `get concluida()`; `class Ticker` com `registrar(t)`, `remover(t)`, `iniciar()`, `parar()`; `class PoolDeTimelines` com `obter()` e `devolver(t)`

- [ ] **Step 1: Escrever o teste que falha**

```js
// tests/timeline.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timeline, Ticker, PoolDeTimelines } from '../public/js/anim/timeline.js';

test('anima de um valor a outro ao longo da duração', () => {
  const t = new Timeline();
  const vistos = [];
  t.add('mover', { at: 0, dur: 1000, from: 0, to: 100, onUpdate: (v) => vistos.push(v) });
  t.play();

  t.tick(500);
  assert.equal(vistos.at(-1), 50);

  t.tick(500);
  assert.equal(vistos.at(-1), 100);
  assert.ok(t.concluida);
});

test('respeita o atraso (at) antes de começar', () => {
  const t = new Timeline();
  const vistos = [];
  t.add('depois', { at: 300, dur: 100, from: 0, to: 10, onUpdate: (v) => vistos.push(v) });
  t.play();

  t.tick(200);
  assert.equal(vistos.length, 0, 'não deveria ter começado ainda');

  t.tick(150);
  assert.ok(vistos.length > 0, 'deveria ter começado');
});

test('dispara onStart e onComplete exatamente uma vez', () => {
  const t = new Timeline();
  let inicios = 0;
  let fins = 0;
  t.add('x', { at: 0, dur: 100, onStart: () => inicios++, onComplete: () => fins++ });
  t.play();

  t.tick(50); t.tick(50); t.tick(50); t.tick(50);
  assert.equal(inicios, 1);
  assert.equal(fins, 1);
});

test('chamar() executa no instante marcado, uma vez só', () => {
  const t = new Timeline();
  const marcos = [];
  t.chamar('a', { at: 200, fn: () => marcos.push('a') });
  t.chamar('b', { at: 400, fn: () => marcos.push('b') });
  t.play();

  t.tick(300);
  assert.deepEqual(marcos, ['a']);
  t.tick(200);
  assert.deepEqual(marcos, ['a', 'b']);
});

test('a duração é o fim do último item', () => {
  const t = new Timeline();
  t.add('a', { at: 0, dur: 500 });
  t.add('b', { at: 200, dur: 900 });
  assert.equal(t.duracao, 1100);
});

test('velocidade 2x percorre a timeline na metade do tempo', () => {
  const t = new Timeline();
  const vistos = [];
  t.add('a', { at: 0, dur: 1000, from: 0, to: 100, onUpdate: (v) => vistos.push(v) });
  t.play();
  t.setVelocidade(2);

  t.tick(500);
  assert.equal(vistos.at(-1), 100);
  assert.ok(t.concluida);
});

test('um delta gigante avança no máximo um passo curto (aba em segundo plano)', () => {
  const t = new Timeline();
  const vistos = [];
  t.add('a', { at: 0, dur: 1000, from: 0, to: 100, onUpdate: (v) => vistos.push(v) });
  t.play();

  // Aba ficou 3 minutos em segundo plano e volta com um delta enorme.
  t.tick(180_000);

  assert.ok(vistos.at(-1) <= 40, `avançou demais: ${vistos.at(-1)}`);
  assert.ok(!t.concluida, 'não deveria ter saltado para o fim');
});

test('cancelar para a timeline e não dispara onComplete', () => {
  const t = new Timeline();
  let fim = 0;
  t.add('a', { at: 0, dur: 1000, onComplete: () => fim++ });
  t.play();
  t.tick(100);
  t.cancelar();
  t.tick(2000);
  assert.equal(fim, 0);
  assert.ok(t.cancelada);
});

test('uma exceção em onUpdate não impede os outros itens de rodar', () => {
  const t = new Timeline();
  const marcos = [];
  t.add('ruim', { at: 0, dur: 100, onUpdate: () => { throw new Error('boom'); } });
  t.add('bom',  { at: 0, dur: 100, onComplete: () => marcos.push('bom') });
  t.play();
  t.tick(200);
  assert.deepEqual(marcos, ['bom']);
});

test('reset devolve a timeline limpa para o pool', () => {
  const t = new Timeline();
  t.add('a', { at: 0, dur: 100, from: 0, to: 1, onUpdate: () => {} });
  t.play();
  t.tick(200);
  t.reset();

  assert.equal(t.duracao, 0);
  assert.equal(t.concluida, false);
  assert.equal(t.cancelada, false);
});

test('o pool reaproveita instâncias em vez de criar novas', () => {
  const pool = new PoolDeTimelines({ max: 2 });
  const a = pool.obter();
  pool.devolver(a);
  assert.equal(pool.obter(), a);
});

test('o pool não cresce sem limite', () => {
  const pool = new PoolDeTimelines({ max: 2 });
  const itens = [pool.obter(), pool.obter(), pool.obter()];
  for (const i of itens) pool.devolver(i);
  assert.equal(pool.tamanho, 2);
});

test('passos por frame recebem o delta e sobrevivem a uma exceção', () => {
  const ticker = new Ticker({ raf: () => {}, agora: () => 0 });
  const vistos = [];
  ticker.registrarPasso(() => { throw new Error('boom'); });
  ticker.registrarPasso((d) => vistos.push(d));
  ticker.avancar(16);

  assert.deepEqual(vistos, [16], 'o segundo passo deveria ter rodado mesmo com o primeiro falhando');
});

test('timelines concluídas saem do ticker sozinhas', () => {
  const ticker = new Ticker({ raf: () => {}, agora: () => 0 });
  const t = new Timeline();
  t.add('a', { at: 0, dur: 100 });
  t.play();
  ticker.registrar(t);

  ticker.avancar(50);
  assert.equal(ticker.timelines.size, 1, 'ainda está rodando');
  ticker.avancar(60);
  assert.equal(ticker.timelines.size, 0, 'deveria ter saído sozinha');
});

test('o ticker não duplica passo registrado duas vezes', () => {
  const ticker = new Ticker({ raf: () => {}, agora: () => 0 });
  let contagem = 0;
  const fn = () => contagem++;
  ticker.registrarPasso(fn);
  ticker.registrarPasso(fn);
  ticker.avancar(16);
  assert.equal(contagem, 1);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/timeline.test.js`
Expected: FAIL — `Cannot find module '../public/js/anim/timeline.js'`

- [ ] **Step 3: Implementar**

```js
// public/js/anim/timeline.js
import { resolverEasing } from './easing.js';

/**
 * Um delta maior que isto é tratado como "a aba ficou em segundo plano".
 * Sem o limite, a mão teleportaria e a fila votaria tudo de uma vez ao voltar.
 */
const DELTA_MAXIMO_MS = 100;

/**
 * Motor de keyframes. Puro: não sabe o que é DOM nem requestAnimationFrame —
 * recebe o delta em milissegundos por tick(). É isto que o torna testável.
 */
export class Timeline {
  constructor() {
    this.itens = [];
    this.decorrido = 0;
    this.velocidade = 1;
    this.rodando = false;
    this.concluida = false;
    this.cancelada = false;
    this._disparados = new Set();
    this._aoTerminar = null;
  }

  add(id, { at = 0, dur = 0, ease = 'linear', from, to, onUpdate, onStart, onComplete } = {}) {
    this.itens.push({
      tipo: 'tween', id, at, dur,
      ease: resolverEasing(ease),
      from, to, onUpdate, onStart, onComplete,
    });
    return this;
  }

  chamar(id, { at = 0, fn } = {}) {
    this.itens.push({ tipo: 'call', id, at, dur: 0, fn });
    return this;
  }

  get duracao() {
    return this.itens.reduce((maior, i) => Math.max(maior, i.at + i.dur), 0);
  }

  play() { this.rodando = true; return this; }
  pause() { this.rodando = false; return this; }

  setVelocidade(multiplicador) {
    this.velocidade = Math.max(0.05, Number(multiplicador) || 1);
    return this;
  }

  aoTerminar(fn) { this._aoTerminar = fn; return this; }

  cancelar() {
    this.cancelada = true;
    this.rodando = false;
  }

  /**
   * Avança a timeline. Devolve true enquanto ainda estiver rodando.
   * Um erro dentro de um callback é isolado: os outros itens continuam,
   * porque uma exceção que aborta a timeline deixa a mão presa na tela.
   */
  tick(deltaMs) {
    if (!this.rodando || this.concluida || this.cancelada) return false;

    const delta = Math.min(Math.max(deltaMs, 0), DELTA_MAXIMO_MS) * this.velocidade;
    this.decorrido += delta;

    for (const item of this.itens) {
      const inicio = item.at;
      const fim = item.at + item.dur;
      const chaveInicio = `${item.id}:inicio`;
      const chaveFim = `${item.id}:fim`;

      try {
        if (this.decorrido >= inicio && !this._disparados.has(chaveInicio)) {
          this._disparados.add(chaveInicio);
          item.onStart?.();
        }

        if (item.tipo === 'tween') {
          if (this.decorrido >= inicio) {
            const bruto = fim === inicio ? 1 : (this.decorrido - inicio) / item.dur;
            const p = item.ease(Math.min(bruto, 1));
            const valor = item.from === undefined
              ? p
              : item.from + (item.to - item.from) * p;
            item.onUpdate?.(valor, p);
          }
        } else if (this.decorrido >= inicio && !this._disparados.has(chaveFim)) {
          this._disparados.add(chaveFim);
          item.fn?.();
        }

        if (this.decorrido >= fim && !this._disparados.has(chaveFim)) {
          this._disparados.add(chaveFim);
          item.onComplete?.();
        }
      } catch (erro) {
        console.error(`[timeline] falha no item "${item.id}"`, erro);
        this._disparados.add(chaveInicio);
        this._disparados.add(chaveFim);
      }
    }

    if (this.decorrido >= this.duracao) {
      this.concluida = true;
      this.rodando = false;
      try { this._aoTerminar?.(); } catch (erro) { console.error('[timeline] falha em aoTerminar', erro); }
      return false;
    }
    return true;
  }

  /** Devolve a instância ao estado limpo para ser reciclada pelo pool. */
  reset() {
    this.itens = [];
    this.decorrido = 0;
    this.velocidade = 1;
    this.rodando = false;
    this.concluida = false;
    this.cancelada = false;
    this._disparados.clear();
    this._aoTerminar = null;
    return this;
  }
}

/**
 * Um único requestAnimationFrame para toda a aplicação.
 * Várias timelines são avançadas no mesmo frame — não uma RAF por animação.
 */
export class Ticker {
  constructor({ raf, agora } = {}) {
    this._raf = raf ?? ((fn) => requestAnimationFrame(fn));
    this._agora = agora ?? (() => performance.now());
    this.timelines = new Set();
    this.passos = new Set();     // callbacks por frame (watchdog da fila, etc.)
    this.rodando = false;
    this._ultimo = 0;
    this._id = null;
  }

  registrar(timeline) { this.timelines.add(timeline); return this; }
  remover(timeline) { this.timelines.delete(timeline); return this; }

  /** Um callback por frame, para quem não é uma Timeline (a fila, por exemplo). */
  registrarPasso(fn) { this.passos.add(fn); return this; }
  removerPasso(fn) { this.passos.delete(fn); return this; }

  /**
   * Avança um frame. Separado do laço de RAF justamente para ser testável:
   * aqui não existe requestAnimationFrame, só um delta em milissegundos.
   */
  avancar(delta) {
    for (const t of [...this.timelines]) {
      if (!t.tick(delta)) this.timelines.delete(t);
    }
    for (const fn of [...this.passos]) {
      try { fn(delta); } catch (erro) { console.error('[ticker] passo falhou', erro); }
    }
  }

  iniciar() {
    if (this.rodando) return this;
    this.rodando = true;
    this._ultimo = this._agora();
    const passo = () => {
      if (!this.rodando) return;
      const agora = this._agora();
      const delta = agora - this._ultimo;
      this._ultimo = agora;
      this.avancar(delta);
      this._id = this._raf(passo);
    };
    this._id = this._raf(passo);
    return this;
  }

  parar() {
    this.rodando = false;
    if (this._id != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._id);
    }
    this._id = null;
  }
}

/**
 * Pool limitado. Numa live de horas, criar uma Timeline por voto gera
 * pressão de coletor de lixo; reciclar mantém o consumo estável.
 */
export class PoolDeTimelines {
  constructor({ max = 24 } = {}) {
    this.max = max;
    this.livres = [];
  }

  get tamanho() { return this.livres.length; }

  obter() {
    return this.livres.pop() ?? new Timeline();
  }

  devolver(timeline) {
    const limpa = timeline.reset();
    if (this.livres.length < this.max) this.livres.push(limpa);
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test tests/timeline.test.js`
Expected: PASS — 12 testes

- [ ] **Step 5: Commit**

```bash
git add public/js/anim/timeline.js tests/timeline.test.js
git commit -m "feat: motor de timeline puro com ticker único e pool

Clamp de delta em 100ms para a aba em segundo plano não teleportar a
mão. Erros em callbacks são isolados por item. Pool limitado de
timelines para estabilizar memória em lives longas.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 9: Motor — fila de animação

**Files:**
- Create: `public/js/anim/queue.js`
- Test: `tests/queue.test.js`

**Interfaces:**
- Consumes: nada
- Produces: `class FilaDeAnimacao` com `enfileirar(item)`, `proximo()`, `concluir(id)`, `tick(deltaMs)`, `drenar()`, `limpar()`, `get pendentes()`, `get emLote()`, `get ocupada()`; `PRIORIDADE = { normal: 0, alta: 1, maxima: 2 }`

- [ ] **Step 1: Escrever o teste que falha**

```js
// tests/queue.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FilaDeAnimacao, PRIORIDADE } from '../public/js/anim/queue.js';

const voto = (id, extra = {}) => ({ id, urnaId: 'u1', prioridade: PRIORIDADE.normal, votos: 1, ...extra });

test('entrega na ordem de chegada quando as prioridades são iguais', () => {
  const f = new FilaDeAnimacao();
  f.enfileirar(voto('a'));
  f.enfileirar(voto('b'));
  f.enfileirar(voto('c'));
  assert.equal(f.proximo().id, 'a');
  f.concluir('a');
  assert.equal(f.proximo().id, 'b');
});

test('prioridade máxima fura a fila', () => {
  const f = new FilaDeAnimacao();
  f.enfileirar(voto('a'));
  f.enfileirar(voto('b'));
  f.enfileirar(voto('raro', { prioridade: PRIORIDADE.maxima }));
  assert.equal(f.proximo().id, 'raro', 'o raro deveria passar na frente');
});

test('prioridade alta fica atrás da máxima mas na frente da normal', () => {
  const f = new FilaDeAnimacao();
  f.enfileirar(voto('normal'));
  f.enfileirar(voto('alta', { prioridade: PRIORIDADE.alta }));
  f.enfileirar(voto('maxima', { prioridade: PRIORIDADE.maxima }));
  assert.equal(f.proximo().id, 'maxima');
  f.concluir('maxima');
  assert.equal(f.proximo().id, 'alta');
});

test('só uma animação roda por vez — a mão só existe uma', () => {
  const f = new FilaDeAnimacao({ maxSimultaneas: 1 });
  f.enfileirar(voto('a'));
  f.proximo();
  assert.ok(f.ocupada, 'deveria estar ocupada');
  assert.equal(f.proximo(), null, 'não deveria entregar outra enquanto ocupada');
});

test('concluir libera a fila para o próximo', () => {
  const f = new FilaDeAnimacao();
  f.enfileirar(voto('a'));
  f.enfileirar(voto('b'));
  f.proximo();
  assert.equal(f.proximo(), null);
  f.concluir('a');
  assert.equal(f.proximo().id, 'b');
});

test('acima do limiar, os excedentes entram em modo lote', () => {
  const f = new FilaDeAnimacao({ limiarLote: 3 });
  const r = ['a', 'b', 'c', 'd', 'e'].map((id) => f.enfileirar(voto(id)));
  assert.deepEqual(r.map((x) => x.modo), ['completo', 'completo', 'completo', 'lote', 'lote']);
});

test('nenhum voto é recusado, por maior que seja a rajada', () => {
  const f = new FilaDeAnimacao({ limiarLote: 3 });
  for (let i = 0; i < 500; i++) f.enfileirar(voto(`v${i}`));
  assert.equal(f.pendentes + f.emLote, 500);
  assert.equal(f.recusados, 0);
});

test('o watchdog força o término de uma animação travada', () => {
  const f = new FilaDeAnimacao({ duracaoBaseMs: 1000, fatorWatchdog: 2 });
  f.enfileirar(voto('a'));
  f.enfileirar(voto('b'));
  f.proximo();

  f.tick(500);
  assert.equal(f.proximo(), null, 'ainda dentro do prazo');

  f.tick(2000);   // passou de 2x a duração base
  assert.ok(!f.ocupada, 'o watchdog deveria ter liberado');
  assert.equal(f.proximo().id, 'b');
});

test('o watchdog respeita a velocidade: a 2x o prazo dobra em ticks', () => {
  const f = new FilaDeAnimacao({ duracaoBaseMs: 1000, fatorWatchdog: 2 });
  f.enfileirar(voto('a'));
  f.proximo();
  f.setVelocidade(2);
  f.tick(1500);   // equivale a 750ms reais — dentro do prazo
  assert.ok(f.ocupada);
});

test('drenar devolve os pendentes para serem carimbados de uma vez', () => {
  const f = new FilaDeAnimacao();
  f.enfileirar(voto('a'));
  f.enfileirar(voto('b'));
  f.proximo();
  const restantes = f.drenar();
  assert.deepEqual(restantes.map((v) => v.id), ['b']);
  assert.equal(f.pendentes, 0);
});

test('limpar esvazia tudo e libera a fila', () => {
  const f = new FilaDeAnimacao();
  f.enfileirar(voto('a'));
  f.proximo();
  f.limpar();
  assert.equal(f.pendentes, 0);
  assert.ok(!f.ocupada);
});

test('concluir um id que não é o que está rodando é ignorado', () => {
  const f = new FilaDeAnimacao();
  f.enfileirar(voto('a'));
  f.enfileirar(voto('b'));
  f.proximo();
  f.concluir('b');           // 'b' nem começou
  assert.ok(f.ocupada, 'a fila não deveria ter sido liberada');
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/queue.test.js`
Expected: FAIL — `Cannot find module '../public/js/anim/queue.js'`

- [ ] **Step 3: Implementar**

```js
// public/js/anim/queue.js
// Puro: não toca no DOM. A fila decide *o que* rodar; quem desenha é o ator.

export const PRIORIDADE = { normal: 0, alta: 1, maxima: 2 };

/**
 * A fila controla apenas o espetáculo. A contagem do voto já aconteceu
 * antes de o item chegar aqui — por isso nada é recusado, nunca.
 * Quando a fila enche, a *animação* degrada para um carimbo rápido.
 */
export class FilaDeAnimacao {
  constructor({
    maxSimultaneas = 1,
    limiarLote = 8,
    duracaoBaseMs = 4500,
    fatorWatchdog = 2,
  } = {}) {
    this.maxSimultaneas = maxSimultaneas;
    this.limiarLote = limiarLote;
    this.duracaoBaseMs = duracaoBaseMs;
    this.fatorWatchdog = fatorWatchdog;

    this.itens = [];
    this.rodando = new Set();
    this.velocidade = 1;
    this.recusados = 0;
    this._tempoRodando = 0;
  }

  get pendentes() { return this.itens.length; }
  get emLote() { return this.itens.filter((i) => i.modo === 'lote').length; }
  get ocupada() { return this.rodando.size >= this.maxSimultaneas; }

  setVelocidade(multiplicador) {
    this.velocidade = Math.max(0.05, Number(multiplicador) || 1);
  }

  /**
   * Aceita sempre. Devolve { aceito, modo } para quem chamou saber se
   * esta animação vai ser completa ou um carimbo.
   */
  enfileirar(item) {
    const totalNaFrente = this.itens.length + this.rodando.size;
    const modo = totalNaFrente >= this.limiarLote ? 'lote' : 'completo';
    this.itens.push({ ...item, modo });
    this.itens.sort((a, b) => (b.prioridade ?? 0) - (a.prioridade ?? 0));
    return { aceito: true, modo };
  }

  /** Devolve o próximo item ou null se a fila estiver ocupada ou vazia. */
  proximo() {
    if (this.ocupada || this.itens.length === 0) return null;
    const item = this.itens.shift();
    this.rodando.add(item.id);
    this._tempoRodando = 0;
    return item;
  }

  concluir(id) {
    if (!this.rodando.has(id)) return false;
    this.rodando.delete(id);
    this._tempoRodando = 0;
    return true;
  }

  /**
   * Watchdog: uma animação que passa de fatorWatchdog × duração base
   * está travada. Libera a fila para o espetáculo não parar.
   * A velocidade estica o prazo — a 2x a animação leva metade dos ticks.
   */
  tick(deltaMs) {
    if (this.rodando.size === 0) return;
    this._tempoRodando += deltaMs * this.velocidade;
    const limite = this.duracaoBaseMs * this.fatorWatchdog;
    if (this._tempoRodando > limite) {
      for (const id of this.rodando) this.rodando.delete(id);
      this._tempoRodando = 0;
    }
  }

  /** Esvazia a fila devolvendo os pendentes — usado ao encerrar a rodada. */
  drenar() {
    const restantes = this.itens.slice();
    this.itens = [];
    return restantes;
  }

  limpar() {
    this.itens = [];
    this.rodando.clear();
    this._tempoRodando = 0;
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test tests/queue.test.js`
Expected: PASS — 12 testes

- [ ] **Step 5: Commit**

```bash
git add public/js/anim/queue.js tests/queue.test.js
git commit -m "feat: fila de animação com prioridade, modo lote e watchdog

A fila nunca recusa um voto — a contagem já aconteceu antes de o item
chegar aqui. Sob rajada, a animação degrada para carimbo. Watchdog
libera a fila se uma animação travar, respeitando a velocidade.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 10: Mão — poses e interpolação

**Files:**
- Create: `public/js/hand/poses.js`
- Test: `tests/poses.test.js`

**Interfaces:**
- Consumes: nada
- Produces: `POSES` (objeto de poses nomeadas), `interpolarPose(a, b, t)` → pose, `poseParaTransformacoes(pose)` → `Record<string, string>` mapeando nome de junta para `transform` CSS

- [ ] **Step 1: Escrever o teste que falha**

```js
// tests/poses.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POSES, interpolarPose, poseParaTransformacoes, JUNTAS } from '../public/js/hand/poses.js';

test('existem as seis poses que a coreografia usa', () => {
  for (const nome of ['repouso', 'apontando', 'pressionando', 'segurando', 'inserindo', 'retraindo']) {
    assert.ok(POSES[nome], `falta a pose "${nome}"`);
  }
});

test('toda pose declara todas as juntas conhecidas', () => {
  for (const [nome, pose] of Object.entries(POSES)) {
    for (const junta of JUNTAS) {
      assert.ok(typeof pose.juntas[junta] === 'number', `${nome} não define a junta ${junta}`);
    }
  }
});

test('toda pose declara posição do pulso', () => {
  for (const [nome, pose] of Object.entries(POSES)) {
    assert.ok('x' in pose.pulso && 'y' in pose.pulso && 'rot' in pose.pulso, `${nome} não define o pulso`);
  }
});

test('interpolar no início devolve a pose A', () => {
  const p = interpolarPose(POSES.repouso, POSES.pressionando, 0);
  assert.deepEqual(p.juntas, POSES.repouso.juntas);
});

test('interpolar no fim devolve a pose B', () => {
  const p = interpolarPose(POSES.repouso, POSES.pressionando, 1);
  for (const junta of JUNTAS) {
    assert.equal(p.juntas[junta], POSES.pressionando.juntas[junta]);
  }
});

test('interpolar no meio devolve a média das juntas', () => {
  const a = POSES.repouso;
  const b = POSES.pressionando;
  const p = interpolarPose(a, b, 0.5);
  for (const junta of JUNTAS) {
    const esperado = (a.juntas[junta] + b.juntas[junta]) / 2;
    assert.ok(Math.abs(p.juntas[junta] - esperado) < 1e-9, `junta ${junta}`);
  }
});

test('o indicador pressiona mais que o médio na pose de pressão', () => {
  const p = POSES.pressionando;
  assert.ok(p.juntas.pipIndicador < p.juntas.pipMedio,
    'o indicador deveria estar mais fletido que o médio');
});

test('poseParaTransformacoes gera um transform por junta', () => {
  const t = poseParaTransformacoes(POSES.pressionando);
  assert.match(t.pipIndicador, /rotate\(-?\d+(\.\d+)?deg\)/);
  assert.equal(Object.keys(t).length, JUNTAS.length);
});

test('interpolar com t fora de 0..1 é limitado', () => {
  const p = interpolarPose(POSES.repouso, POSES.pressionando, 2.5);
  for (const junta of JUNTAS) {
    assert.equal(p.juntas[junta], POSES.pressionando.juntas[junta]);
  }
});

test('POSE é imutável — interpolar não corrompe a pose original', () => {
  const antes = { ...POSES.repouso.juntas };
  interpolarPose(POSES.repouso, POSES.pressionando, 0.7);
  assert.deepEqual(POSES.repouso.juntas, antes);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/poses.test.js`
Expected: FAIL — `Cannot find module '../public/js/hand/poses.js'`

- [ ] **Step 3: Implementar**

```js
// public/js/hand/poses.js
// Dados e matemática pura. O renderizador (hand-svg.js) é quem escreve no DOM.
//
// Convenção de sinal: ângulos em graus. Nos dedos, 0 = estendido e
// valores negativos = fletido (o dedo fecha para dentro da palma).
// O polegar usa eixo próprio e por isso seus valores são positivos.

export const JUNTAS = [
  'mcpIndicador', 'pipIndicador', 'dipIndicador',
  'mcpMedio',     'pipMedio',     'dipMedio',
  'mcpAnel',      'pipAnel',      'dipAnel',
  'mcpMindinho',  'pipMindinho',  'dipMindinho',
  'mcpPolegar',   'ipPolegar',
  'curvaturaPalma',
];

export const POSES = Object.freeze({
  /** Mão relaxada, fora de cena ou esperando. */
  repouso: {
    pulso: { x: 0, y: 0, rot: 0 },
    juntas: {
      mcpIndicador: -12, pipIndicador: -22, dipIndicador: -14,
      mcpMedio:     -14, pipMedio:     -26, dipMedio:     -16,
      mcpAnel:      -16, pipAnel:      -30, dipAnel:      -18,
      mcpMindinho:  -18, pipMindinho:  -34, dipMindinho:  -20,
      mcpPolegar:     14, ipPolegar:     10,
      curvaturaPalma: 0.35,
    },
  },

  /** Indicador estendido, resto recolhido — a mão que se aproxima da tecla. */
  apontando: {
    pulso: { x: 0, y: -6, rot: -3 },
    juntas: {
      mcpIndicador:  -4, pipIndicador:  -6, dipIndicador:  -4,
      mcpMedio:     -34, pipMedio:     -58, dipMedio:     -38,
      mcpAnel:      -38, pipAnel:      -64, dipAnel:      -42,
      mcpMindinho:  -40, pipMindinho:  -66, dipMindinho:  -44,
      mcpPolegar:     18, ipPolegar:     14,
      curvaturaPalma: 0.22,
    },
  },

  /**
   * O dedo apertando a tecla: o indicador flete bem mais que as outras
   * juntas, e o pulso afunda. É este contraste que lê como "pressão".
   */
  pressionando: {
    pulso: { x: 0, y: 4, rot: 1 },
    juntas: {
      mcpIndicador: -16, pipIndicador: -34, dipIndicador: -22,
      mcpMedio:     -36, pipMedio:     -60, dipMedio:     -40,
      mcpAnel:      -40, pipAnel:      -66, dipAnel:      -44,
      mcpMindinho:  -42, pipMindinho:  -68, dipMindinho:  -46,
      mcpPolegar:     20, ipPolegar:     16,
      curvaturaPalma: 0.24,
    },
  },

  /** Pegando a cédula: pinça entre indicador e polegar. */
  segurando: {
    pulso: { x: 0, y: 0, rot: -8 },
    juntas: {
      mcpIndicador: -26, pipIndicador: -42, dipIndicador: -26,
      mcpMedio:     -30, pipMedio:     -52, dipMedio:     -34,
      mcpAnel:      -34, pipAnel:      -58, dipAnel:      -38,
      mcpMindinho:  -36, pipMindinho:  -60, dipMindinho:  -40,
      mcpPolegar:     44, ipPolegar:     34,
      curvaturaPalma: 0.30,
    },
  },

  /** Empurrando a cédula para dentro da abertura no topo. */
  inserindo: {
    pulso: { x: 0, y: -10, rot: -12 },
    juntas: {
      mcpIndicador: -14, pipIndicador: -26, dipIndicador: -16,
      mcpMedio:     -24, pipMedio:     -44, dipMedio:     -28,
      mcpAnel:      -28, pipAnel:      -50, dipAnel:      -32,
      mcpMindinho:  -30, pipMindinho:  -52, dipMindinho:  -34,
      mcpPolegar:     38, ipPolegar:     30,
      curvaturaPalma: 0.26,
    },
  },

  /** Saindo de cena: dedos soltos, pulso virando. */
  retraindo: {
    pulso: { x: 0, y: 8, rot: 6 },
    juntas: {
      mcpIndicador: -20, pipIndicador: -34, dipIndicador: -22,
      mcpMedio:     -22, pipMedio:     -38, dipMedio:     -24,
      mcpAnel:      -24, pipAnel:      -42, dipAnel:      -26,
      mcpMindinho:  -26, pipMindinho:  -44, dipMindinho:  -28,
      mcpPolegar:     16, ipPolegar:     12,
      curvaturaPalma: 0.40,
    },
  },
});

const limitar = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const misturar = (a, b, t) => a + (b - a) * t;

/**
 * Interpola duas poses. Devolve sempre um objeto novo — as poses em POSES
 * são congeladas e nunca podem ser mutadas por quem consome.
 */
export function interpolarPose(a, b, t) {
  const p = limitar(t);
  const juntas = {};
  for (const junta of JUNTAS) {
    juntas[junta] = misturar(a.juntas[junta], b.juntas[junta], p);
  }
  return {
    pulso: {
      x: misturar(a.pulso.x, b.pulso.x, p),
      y: misturar(a.pulso.y, b.pulso.y, p),
      rot: misturar(a.pulso.rot, b.pulso.rot, p),
    },
    juntas,
  };
}

/**
 * Traduz uma pose para transforms CSS, um por junta.
 * O pivô de cada junta é definido no próprio SVG (transform-origin no CSS),
 * então aqui só a rotação importa.
 */
export function poseParaTransformacoes(pose) {
  const t = {};
  for (const junta of JUNTAS) {
    const graus = junta === 'curvaturaPalma'
      ? pose.juntas[junta] * 10        // a curvatura da palma é sutil
      : pose.juntas[junta];
    t[junta] = `rotate(${graus.toFixed(3)}deg)`;
  }
  return t;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test tests/poses.test.js`
Expected: PASS — 10 testes

- [ ] **Step 5: Commit**

```bash
git add public/js/hand/poses.js tests/poses.test.js
git commit -m "feat: poses da mão com interpolação pura

Seis poses nomeadas (repouso, apontando, pressionando, segurando,
inserindo, retraindo) sobre 15 juntas. A coreografia trabalha em poses,
nunca em ângulos — é o que permite trocar o renderizador por sprites
sem tocar na animação.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 11: Mão — SVG articulado com sombra projetada

**Files:**
- Create: `public/css/hand.css`
- Create: `public/js/hand/hand-svg.js`
- Modify: `public/broadcast.html` — nada; o SVG é injetado por JS
- Test: `tests/hand-svg.test.js`

**Interfaces:**
- Consumes: `poseParaTransformacoes`, `JUNTAS` da Task 10
- Produces: `criarMaoSvg()` → `{ el, aplicarPose(pose), posicionar(x, y, escala), sombra: HTMLElement }`; `criarMaoSvg` deve ser a implementação de `HandRenderer` — mesma interface que um futuro `criarMaoSprite()`

- [ ] **Step 1: Escrever o teste que falha**

Testa a parte pura: a geometria do SVG e os nomes de junta.

```js
// tests/hand-svg.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MARCA_DE_JUNTA, markupDaMao, markupDaSombra } from '../public/js/hand/hand-svg.js';
import { JUNTAS } from '../public/js/hand/poses.js';

test('o markup da mão contém um grupo para cada junta', () => {
  const html = markupDaMao();
  for (const junta of JUNTAS) {
    assert.ok(html.includes(`data-junta="${junta}"`), `falta o grupo da junta ${junta}`);
  }
});

test('o markup da mão não usa emoji', () => {
  const html = markupDaMao();
  assert.ok(!/\p{Extended_Pictographic}/u.test(html), 'a mão não pode conter emoji');
});

test('o markup declara os gradientes de pele', () => {
  const html = markupDaMao();
  for (const id of ['peleBase', 'peleSombra', 'peleLuz', 'unhaGrad']) {
    assert.ok(html.includes(`id="${id}"`), `falta o gradiente ${id}`);
  }
});

test('o markup declara o filtro de textura de pele', () => {
  assert.ok(markupDaMao().includes('id="texturaPele"'));
});

test('a sombra projetada é um elemento separado da mão', () => {
  const sombra = markupDaSombra();
  assert.ok(sombra.includes('data-sombra'));
  assert.ok(!sombra.includes('data-junta'), 'a sombra não tem juntas');
});

test('MARCA_DE_JUNTA segue o padrão data-junta', () => {
  assert.equal(MARCA_DE_JUNTA('pipIndicador'), 'data-junta="pipIndicador"');
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/hand-svg.test.js`
Expected: FAIL — `Cannot find module '../public/js/hand/hand-svg.js'`

- [ ] **Step 3: Escrever o CSS da mão e da sombra**

```css
/* public/css/hand.css */

/* O ator da mão vive na camada da mão e é posicionado em coordenadas do palco. */
.mao {
  position: absolute;
  left: 0;
  top: 0;
  width: 420px;
  height: 620px;
  transform-origin: 50% 100%;
  /* --x, --y e --escala são escritos pelo ator */
  transform: translate3d(var(--x, 540px), var(--y, 1500px), 0)
             rotate(var(--rot, 0deg))
             scale(var(--escala, 1));
  will-change: transform;
  pointer-events: none;
}

.mao__svg { width: 100%; height: 100%; overflow: visible; }

/* Cada junta gira em torno do próprio pivô. Os valores de transform-origin
   são casados com as coordenadas do SVG (viewBox 0 0 420 620). */
.mao__svg [data-junta] {
  transform-box: view-box;
  transition: none;   /* o motor escreve o transform a cada frame */
}

.mao__svg [data-junta="mcpIndicador"] { transform-origin: 214px 214px; }
.mao__svg [data-junta="pipIndicador"] { transform-origin: 214px 150px; }
.mao__svg [data-junta="dipIndicador"] { transform-origin: 214px 104px; }

.mao__svg [data-junta="mcpMedio"]    { transform-origin: 244px 206px; }
.mao__svg [data-junta="pipMedio"]    { transform-origin: 244px 138px; }
.mao__svg [data-junta="dipMedio"]    { transform-origin: 244px 92px; }

.mao__svg [data-junta="mcpAnel"]     { transform-origin: 272px 212px; }
.mao__svg [data-junta="pipAnel"]     { transform-origin: 272px 148px; }
.mao__svg [data-junta="dipAnel"]     { transform-origin: 272px 104px; }

.mao__svg [data-junta="mcpMindinho"] { transform-origin: 296px 226px; }
.mao__svg [data-junta="pipMindinho"] { transform-origin: 296px 172px; }
.mao__svg [data-junta="dipMindinho"] { transform-origin: 296px 136px; }

.mao__svg [data-junta="mcpPolegar"]  { transform-origin: 150px 268px; }
.mao__svg [data-junta="ipPolegar"]   { transform-origin: 106px 232px; }

/* Sombra projetada — o elemento que mais vende o volume da mão.
   Separada do SVG para poder deslocar e desfocar de forma independente. */
.mao__sombra {
  position: absolute;
  left: 0;
  top: 0;
  width: 420px;
  height: 620px;
  transform-origin: 50% 100%;
  transform: translate3d(var(--sx, 540px), var(--sy, 1520px), 0)
             rotate(var(--rot, 0deg))
             scale(var(--sombra-escala, 1));
  pointer-events: none;
  will-change: transform, opacity;
}

/* Alta da cena: a mão "levanta" e a sombra se afasta, cresce e some */
.mao__sombra-elipse {
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 300px;
  height: 90px;
  margin-left: -150px;
  border-radius: 50%;
  background: radial-gradient(50% 50% at 50% 50%,
    rgba(34, 18, 4, 0.55) 0%,
    rgba(34, 18, 4, 0.26) 48%,
    rgba(34, 18, 4, 0) 80%);
  filter: blur(var(--sombra-blur, 14px));
  opacity: var(--sombra-opacidade, 0.75);
}
```

> **Nota para quem implementa:** ao criar o SVG no Step 4, confira no
> DevTools que cada `transform-origin` acima casa com o pivô real da junta
> desenhada. Os valores são um ponto de partida; ajuste-os até o dedo girar
> no lugar certo. Um pivô errado faz o dedo "deslizar" em vez de dobrar.

- [ ] **Step 4: Implementar `hand-svg.js`**

```js
// public/js/hand/hand-svg.js
import { JUNTAS, poseParaTransformacoes } from './poses.js';

export const MARCA_DE_JUNTA = (nome) => `data-junta="${nome}"`;

/**
 * Desenha a mão. Toda a pele é composta por gradientes e filtros SVG —
 * nada de imagem externa, e portanto nada que dependa de asset de terceiro.
 *
 * Convenção: viewBox 420x620. O pulso fica embaixo (~y=330) e os dedos
 * apontam para cima, porque a mão vem de baixo da tela.
 */
export function markupDaMao() {
  // Cada dedo é uma cadeia de grupos aninhados: mcp > pip > dip.
  // Girar o grupo externo move tudo o que está dentro, como uma falange real.
  //
  // `pivoX` casa exatamente com o transform-origin declarado em hand.css.
  // Se os dois saírem de sincronia, o dedo desliza em vez de dobrar — por isso
  // o pivô é passado como argumento em vez de calculado no meio do desenho.
  const dedo = (nome, pivoX, largura) => {
    const x = pivoX - largura / 2;
    return `
    <g ${MARCA_DE_JUNTA(`mcp${nome}`)}>
      <path class="falange" d="M ${x} 214 q ${largura / 2} -18 ${largura} 0 l 0 -64 q -${largura / 2} -16 -${largura} 0 z"/>
      <g ${MARCA_DE_JUNTA(`pip${nome}`)}>
        <path class="falange" d="M ${x} 150 q ${largura / 2} -16 ${largura} 0 l 0 -46 q -${largura / 2} -14 -${largura} 0 z"/>
        <g ${MARCA_DE_JUNTA(`dip${nome}`)}>
          <path class="falange" d="M ${x} 104 q ${largura / 2} -14 ${largura} 0 l 0 -30 q -${largura / 2} -20 -${largura} 0 z"/>
          <ellipse class="unha" cx="${pivoX}" cy="62" rx="${largura * 0.30}" ry="15" fill="url(#unhaGrad)"/>
        </g>
      </g>
    </g>`;
  };

  return `
<svg class="mao__svg" viewBox="0 0 420 620" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="peleBase" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0"    stop-color="#f0c4a0"/>
      <stop offset="0.38" stop-color="#e0a980"/>
      <stop offset="0.72" stop-color="#c98d63"/>
      <stop offset="1"    stop-color="#a86f4a"/>
    </linearGradient>

    <linearGradient id="peleSombra" x1="0" y1="1" x2="0.2" y2="0">
      <stop offset="0"   stop-color="#8a5533" stop-opacity="0.55"/>
      <stop offset="1"   stop-color="#8a5533" stop-opacity="0"/>
    </linearGradient>

    <radialGradient id="peleLuz" cx="0.38" cy="0.28" r="0.5">
      <stop offset="0"   stop-color="#ffe6cf" stop-opacity="0.7"/>
      <stop offset="1"   stop-color="#ffe6cf" stop-opacity="0"/>
    </radialGradient>

    <linearGradient id="unhaGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0"   stop-color="#fdf3ec"/>
      <stop offset="0.6" stop-color="#f0d8c8"/>
      <stop offset="1"   stop-color="#d9b49c"/>
    </linearGradient>

    <linearGradient id="mangaGrad" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0"   stop-color="#1d4f9c"/>
      <stop offset="1"   stop-color="#2f6fc4"/>
    </linearGradient>

    <!-- Textura sutil de pele: ruído de baixíssima frequência, quase invisível,
         mas tira o aspecto de plástico liso das superfícies grandes. -->
    <filter id="texturaPele" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="ruido"/>
      <feColorMatrix in="ruido" type="saturate" values="0" result="cinza"/>
      <feComponentTransfer in="cinza" result="suave">
        <feFuncA type="linear" slope="0.06"/>
      </feComponentTransfer>
      <feComposite in="suave" in2="SourceGraphic" operator="over"/>
    </filter>
  </defs>

  <!-- Manga do antebraço -->
  <path class="manga" d="M 130 620 L 130 470 q 80 -26 160 0 L 290 620 z" fill="url(#mangaGrad)"/>
  <path class="manga__punho" d="M 130 476 q 80 -26 160 0 l 0 14 q -80 -26 -160 0 z" fill="#173f7d"/>

  <!-- Palma -->
  <g ${MARCA_DE_JUNTA('curvaturaPalma')}>
    <path class="palma" filter="url(#texturaPele)"
          d="M 140 460 q -10 -110 14 -190 q 70 -30 140 0 q 24 80 14 190 q -84 30 -168 0 z"
          fill="url(#peleBase)"/>
    <path class="palma__sombra" d="M 140 460 q -10 -110 14 -190 q 70 -30 140 0 q 24 80 14 190 q -84 30 -168 0 z"
          fill="url(#peleSombra)"/>
    <ellipse class="palma__luz" cx="196" cy="330" rx="76" ry="96" fill="url(#peleLuz)"/>

    <!-- Linhas de tendão no dorso -->
    <g class="tendoes" stroke="#9c6642" stroke-width="1.6" fill="none" opacity="0.20">
      <path d="M 196 430 q -6 -70 -2 -124"/>
      <path d="M 226 428 q 4 -68 0 -120"/>
      <path d="M 254 432 q 8 -64 6 -116"/>
    </g>

    <!-- Vincos da palma -->
    <g class="vincos" stroke="#8a5533" stroke-width="2.2" fill="none" opacity="0.16">
      <path d="M 168 392 q 46 18 92 -2"/>
      <path d="M 172 424 q 44 14 88 -4"/>
    </g>

    <!-- Polegar -->
    <g ${MARCA_DE_JUNTA('mcpPolegar')}>
      <path class="falange" d="M 156 268 q -34 26 -48 62 q 22 14 42 2 q 22 -30 34 -54 z" fill="url(#peleBase)"/>
      <g ${MARCA_DE_JUNTA('ipPolegar')}>
        <path class="falange" d="M 108 332 q -30 22 -42 54 q 20 12 38 0 q 18 -26 30 -46 z" fill="url(#peleBase)"/>
        <ellipse class="unha" cx="82" cy="378" rx="13" ry="17" fill="url(#unhaGrad)" transform="rotate(-36 82 378)"/>
      </g>
    </g>

    <!-- Quatro dedos. Os pivôs abaixo são os mesmos do hand.css. -->
    ${dedo('Indicador', 214, 56)}
    ${dedo('Medio',     244, 58)}
    ${dedo('Anel',      272, 54)}
    ${dedo('Mindinho',  296, 46)}

    <!-- Oclusão entre os dedos: sombras finas onde um dedo encosta no outro -->
    <g class="oclusao" fill="#7a4a2c" opacity="0.18">
      <rect x="240" y="140" width="3" height="80" rx="1.5"/>
      <rect x="268" y="146" width="3" height="76" rx="1.5"/>
      <rect x="292" y="158" width="3" height="70" rx="1.5"/>
    </g>
  </g>
</svg>`;
}

export function markupDaSombra() {
  return `
<div class="mao__sombra" data-sombra>
  <div class="mao__sombra-elipse"></div>
</div>`;
}

/**
 * Renderizador SVG da mão.
 *
 * Implementa a interface HandRenderer: { el, sombra, aplicarPose, posicionar }.
 * Um futuro `criarMaoSprite()` implementa a mesma interface lendo quadros PNG,
 * e a coreografia não precisa mudar.
 */
export function criarMaoSvg() {
  const el = document.createElement('div');
  el.className = 'mao';
  el.innerHTML = markupDaMao();

  const sombra = document.createElement('div');
  sombra.innerHTML = markupDaSombra();
  const sombraEl = sombra.firstElementChild;

  // Guarda as referências uma única vez — consultar o DOM a cada frame
  // seria caro numa live de horas.
  const grupos = {};
  for (const junta of JUNTAS) {
    grupos[junta] = el.querySelector(`[data-junta="${junta}"]`);
  }

  return {
    el,
    sombra: sombraEl,

    aplicarPose(pose) {
      const transforms = poseParaTransformacoes(pose);
      for (const junta of JUNTAS) {
        const g = grupos[junta];
        if (g) g.style.transform = transforms[junta];
      }
    },

    /** Posiciona a mão e a sombra. `altura` acima de 0 afasta a sombra. */
    posicionar(x, y, { rot = 0, escala = 1, altura = 0 } = {}) {
      el.style.setProperty('--x', `${x}px`);
      el.style.setProperty('--y', `${y}px`);
      el.style.setProperty('--rot', `${rot}deg`);
      el.style.setProperty('--escala', String(escala));

      sombraEl.style.setProperty('--sx', `${x + altura * 0.35}px`);
      sombraEl.style.setProperty('--sy', `${y + 10 + altura * 0.5}px`);
      sombraEl.style.setProperty('--rot', `${rot}deg`);
      sombraEl.style.setProperty('--sombra-escala', String(escala * (1 + altura * 0.002)));
      sombraEl.style.setProperty('--sombra-blur', `${14 + altura * 0.12}px`);
      sombraEl.style.setProperty('--sombra-opacidade', String(Math.max(0.12, 0.75 - altura * 0.004)));
    },
  };
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `node --test tests/hand-svg.test.js`
Expected: PASS — 6 testes

- [ ] **Step 6: Verificar a mão visualmente**

Em `demo.js`:

```js
import { criarMaoSvg } from './hand/hand-svg.js';
import { POSES } from './hand/poses.js';

const { camadaMao } = montarCenario(document.getElementById('cena'));
const mao = criarMaoSvg();
camadaMao.append(mao.sombra, mao.el);
mao.posicionar(540, 1380, { escala: 1 });
mao.aplicarPose(POSES.repouso);
```

Run: `npm start`

Expected: uma mão de antebraço com manga azul, palma com brilho e vincos, quatro dedos com unhas e um polegar, apoiada sobre uma sombra elíptica. Troque `POSES.repouso` por cada uma das outras cinco poses e confira que os dedos **dobram nos pivôs** em vez de deslizar.

- [ ] **Step 7: Commit**

```bash
git add public/css/hand.css public/js/hand/hand-svg.js tests/hand-svg.test.js
git commit -m "feat: mão SVG articulada com sombra projetada independente

Quinze juntas aninhadas em grupos, pele por gradientes e filtro de
ruído, tendões, vincos, unhas e oclusão entre dedos. A sombra é um
elemento separado que se afasta e some quando a mão levanta — é ela
que vende o volume.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 12: Coreografia — a sequência de voto

**Files:**
- Create: `public/js/vote-sequence.js`
- Test: `tests/vote-sequence.test.js`

**Interfaces:**
- Consumes: `Timeline` (Task 8), `POSES` (Task 10), geometria de `medirGeometria()` (Task 3)
- Produces: `construirSequenciaDeVoto({ geometria, numero, votos, callbacks, timeline })` → `Timeline` preenchida; callbacks: `aoDestacar`, `aoTeclar`, `aoSoltarTecla`, `aoMostrarTela`, `aoSairCedula`, `aoDepositarCedula`, `aoContar`, `aoMoverMao`

- [ ] **Step 1: Escrever o teste que falha**

```js
// tests/vote-sequence.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timeline } from '../public/js/anim/timeline.js';
import { construirSequenciaDeVoto, FASES } from '../public/js/vote-sequence.js';

const geometria = {
  teclas: {
    '2': { centro: { x: 700, y: 900 } },
    '1': { centro: { x: 640, y: 900 } },
    CONFIRMA: { centro: { x: 820, y: 1120 } },
  },
  slot: { centro: { x: 540, y: 620 } },
  tela: { centro: { x: 300, y: 760 } },
  corpo: { centro: { x: 540, y: 900 } },
};

function montar(extra = {}) {
  const eventos = [];
  const timeline = new Timeline();
  construirSequenciaDeVoto({
    geometria,
    numero: '21',
    votos: 1,
    timeline,
    callbacks: {
      aoDestacar: () => eventos.push('destacar'),
      aoMoverMao: (alvo) => eventos.push(`mover:${alvo}`),
      aoTeclar: (t) => eventos.push(`teclar:${t}`),
      aoSoltarTecla: (t) => eventos.push(`soltar:${t}`),
      aoMostrarTela: (e) => eventos.push(`tela:${e.tipo}`),
      aoSairCedula: () => eventos.push('cedula-sai'),
      aoDepositarCedula: () => eventos.push('cedula-entra'),
      aoContar: () => eventos.push('contar'),
    },
    ...extra,
  });
  return { timeline, eventos };
}

test('a sequência cobre todas as fases obrigatórias', () => {
  const { timeline } = montar();
  assert.ok(timeline.duracao > 3000, `duração curta demais: ${timeline.duracao}`);
  const nomes = FASES.map((f) => f.nome);
  const obrigatorias = [
    'anuncio', 'aproximacao', 'digitacao', 'confirmacao',
    'confirmado', 'cedula', 'deposito', 'contagem', 'retirada',
  ];
  for (const nome of obrigatorias) {
    assert.ok(nomes.includes(nome), `falta a fase ${nome}`);
  }
});

test('um voto de dois dígitos a 1x dura perto dos 4,5s da spec', () => {
  const { timeline } = montar();
  assert.ok(timeline.duracao > 4000 && timeline.duracao < 5200,
    `duração fora da faixa orçada pela spec: ${timeline.duracao}ms`);
});

test('a mão vai para cada dígito do número, na ordem', () => {
  const { timeline, eventos } = montar();
  timeline.play();
  for (let i = 0; i < 200; i++) timeline.tick(50);

  const teclas = eventos.filter((e) => e.startsWith('teclar:')).map((e) => e.split(':')[1]);
  assert.deepEqual(teclas, ['2', '1']);
});

test('cada tecla pressionada é solta depois', () => {
  const { timeline, eventos } = montar();
  timeline.play();
  for (let i = 0; i < 200; i++) timeline.tick(50);

  const teclas = eventos.filter((e) => e.startsWith('teclar:')).map((e) => e.split(':')[1]);
  const soltas = eventos.filter((e) => e.startsWith('soltar:')).map((e) => e.split(':')[1]);
  for (const t of teclas) assert.ok(soltas.includes(t), `a tecla ${t} nunca foi solta`);
});

test('a ordem global é: digitar, confirmar, sair cédula, depositar, contar', () => {
  const { timeline, eventos } = montar();
  timeline.play();
  for (let i = 0; i < 200; i++) timeline.tick(50);

  // CONFIRMA também começa com 'teclar:' — por isso o filtro explícito,
  // senão "último dígito" e "confirma" apontariam para o mesmo índice.
  const ultimoDigito = eventos
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.startsWith('teclar:') && e !== 'teclar:CONFIRMA')
    .at(-1).i;
  const confirma = eventos.indexOf('teclar:CONFIRMA');
  const sai = eventos.indexOf('cedula-sai');
  const entra = eventos.indexOf('cedula-entra');
  const conta = eventos.indexOf('contar');

  assert.ok(ultimoDigito < confirma, 'confirmar veio antes de digitar tudo');
  assert.ok(confirma < sai, 'a cédula saiu antes de confirmar');
  assert.ok(sai < entra, 'a cédula entrou antes de sair');
  assert.ok(entra < conta, 'contou antes de depositar');
});

test('a mão mira o slot correto no depósito', () => {
  const { timeline, eventos } = montar();
  timeline.play();
  for (let i = 0; i < 200; i++) timeline.tick(50);
  assert.ok(eventos.includes('mover:slot'), 'a mão deveria ter ido até o slot');
});

test('a tela passa por digitando e confirmado', () => {
  const { timeline, eventos } = montar();
  timeline.play();
  for (let i = 0; i < 200; i++) timeline.tick(50);
  assert.ok(eventos.some((e) => e === 'tela:digitando'));
  assert.ok(eventos.some((e) => e === 'tela:confirmado'));
});

test('a urna é destacada logo no começo', () => {
  const { timeline, eventos } = montar();
  timeline.play();
  timeline.tick(50);
  assert.equal(eventos[0], 'destacar');
});

test('um número de três dígitos dura mais que um de dois', () => {
  const curto = new Timeline();
  construirSequenciaDeVoto({ geometria, numero: '21', votos: 1, timeline: curto, callbacks: {} });
  const longo = new Timeline();
  construirSequenciaDeVoto({ geometria, numero: '210', votos: 1, timeline: longo, callbacks: {} });
  assert.ok(longo.duracao > curto.duracao);
});

test('uma tecla ausente na geometria não quebra a sequência', () => {
  const geoSemUma = { ...geometria, teclas: { '2': geometria.teclas['2'], CONFIRMA: geometria.teclas.CONFIRMA } };
  const timeline = new Timeline();
  assert.doesNotThrow(() => {
    construirSequenciaDeVoto({ geometria: geoSemUma, numero: '21', votos: 1, timeline, callbacks: {} });
    timeline.play();
    for (let i = 0; i < 200; i++) timeline.tick(50);
  });
});

test('callbacks ausentes não quebram a sequência', () => {
  const timeline = new Timeline();
  construirSequenciaDeVoto({ geometria, numero: '21', votos: 1, timeline, callbacks: {} });
  timeline.play();
  assert.doesNotThrow(() => { for (let i = 0; i < 200; i++) timeline.tick(50); });
});

test('velocidade 4x conclui a sequência em menos ticks', () => {
  const { timeline } = montar();
  timeline.play();
  timeline.setVelocidade(4);
  let ticks = 0;
  while (!timeline.concluida && ticks < 1000) { timeline.tick(50); ticks++; }
  assert.ok(ticks < 30, `levou ${ticks} ticks a 4x`);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/vote-sequence.test.js`
Expected: FAIL — `Cannot find module '../public/js/vote-sequence.js'`

- [ ] **Step 3: Implementar**

```js
// public/js/vote-sequence.js
import { POSES } from './hand/poses.js';

/**
 * Tempos de cada fase, em milissegundos a 1x.
 *
 * Um voto de dois dígitos soma ~4,65s, que é o alvo de ~4,5s da spec (§4.4).
 * Se estes números crescerem, a fila estoura em live movimentada — a spec
 * assume este orçamento de tempo para uma animação completa.
 */
export const TEMPOS = {
  anuncio:        450,
  aproximacao:    480,
  porDigito:      320,   // por dígito, mais o recuo abaixo
  recuoDoDedo:     50,
  irParaConfirma: 260,
  confirmar:      420,
  confirmado:     400,
  cedulaSai:      400,
  pegaCedula:     200,
  irParaSlot:     300,
  inserir:        320,
  contar:         400,
  retirada:       280,
};

/**
 * As fases, na ordem, com a duração nominal a 1x.
 * `digitacao` tem duração variável: (porDigito + recuoDoDedo) × nº de dígitos.
 * Serve de referência para leitura e para o teste de cobertura das fases.
 */
export const FASES = [
  { nome: 'anuncio',     dur: TEMPOS.anuncio },
  { nome: 'aproximacao', dur: TEMPOS.aproximacao },
  { nome: 'digitacao',   dur: null },
  { nome: 'confirmacao', dur: TEMPOS.irParaConfirma + TEMPOS.confirmar },
  { nome: 'confirmado',  dur: TEMPOS.confirmado },
  { nome: 'cedula',      dur: TEMPOS.cedulaSai },
  { nome: 'deposito',    dur: TEMPOS.pegaCedula + TEMPOS.irParaSlot + TEMPOS.inserir },
  { nome: 'contagem',    dur: TEMPOS.contar },
  { nome: 'retirada',    dur: TEMPOS.retirada },
];

const semQuebrar = (fn) => (...args) => {
  try { fn?.(...args); } catch (erro) { console.error('[sequencia] callback falhou', erro); }
};

/**
 * Monta a timeline completa de um voto sobre uma timeline já existente.
 *
 * É pura: recebe a geometria medida do DOM e devolve a coreografia.
 * Não sabe o que é uma urna, um SVG ou um pixel — só posições e tempo.
 * É isso que permite testar a coreografia inteira sem navegador.
 */
export function construirSequenciaDeVoto({
  geometria,
  numero,
  votos = 1,
  timeline,
  callbacks = {},
  tempos = TEMPOS,
}) {
  const cb = {
    aoDestacar:        semQuebrar(callbacks.aoDestacar),
    aoMoverMao:        semQuebrar(callbacks.aoMoverMao),
    aoTeclar:          semQuebrar(callbacks.aoTeclar),
    aoSoltarTecla:     semQuebrar(callbacks.aoSoltarTecla),
    aoMostrarTela:     semQuebrar(callbacks.aoMostrarTela),
    aoSairCedula:      semQuebrar(callbacks.aoSairCedula),
    aoDepositarCedula: semQuebrar(callbacks.aoDepositarCedula),
    aoContar:          semQuebrar(callbacks.aoContar),
  };

  const digitos = String(numero).split('');
  let t = 0;

  // ---- P0: anúncio. A urna acende antes de qualquer movimento. ----
  timeline.chamar('anuncio', { at: t, fn: () => cb.aoDestacar() });
  timeline.chamar('tela-inicial', { at: t, fn: () => cb.aoMostrarTela({ tipo: 'digitando', numeroDigitado: '' }) });
  t += tempos.anuncio;

  // ---- P1: aproximação. A mão entra por baixo e sobe até a primeira tecla. ----
  const primeira = geometria.teclas?.[digitos[0]];
  if (primeira) {
    timeline.chamar('aproxima', { at: t, fn: () => cb.aoMoverMao({ alvo: primeira.centro, pose: 'apontando' }) });
  }
  t += tempos.aproximacao;

  // ---- P2: digitação. Um ciclo completo por dígito. ----
  digitos.forEach((digito, i) => {
    const alvo = geometria.teclas?.[digito];
    if (!alvo) return;                       // tecla fora da geometria: pula sem quebrar
    const base = t;

    timeline.chamar(`mover-${i}`, {
      at: base,
      fn: () => cb.aoMoverMao({ alvo: alvo.centro, pose: 'apontando' }),
    });

    timeline.chamar(`desce-${i}`, {
      at: base + tempos.porDigito * 0.55,
      fn: () => {
        cb.aoMoverMao({ alvo: alvo.centro, pose: 'pressionando' });
        cb.aoTeclar(digito);
      },
    });

    timeline.chamar(`tela-${i}`, {
      at: base + tempos.porDigito * 0.62,
      fn: () => cb.aoMostrarTela({ tipo: 'digitando', numeroDigitado: digitos.slice(0, i + 1).join('') }),
    });

    timeline.chamar(`sobe-${i}`, {
      at: base + tempos.porDigito * 0.78,
      fn: () => {
        cb.aoSoltarTecla(digito);
        cb.aoMoverMao({ alvo: alvo.centro, pose: 'apontando' });
      },
    });

    t = base + tempos.porDigito + tempos.recuoDoDedo;
  });

  // ---- P3: CONFIRMA ----
  const confirma = geometria.teclas?.CONFIRMA;
  if (confirma) {
    timeline.chamar('vai-confirma', {
      at: t,
      fn: () => cb.aoMoverMao({ alvo: confirma.centro, pose: 'apontando' }),
    });
    t += tempos.irParaConfirma;

    timeline.chamar('aperta-confirma', {
      at: t,
      fn: () => {
        cb.aoMoverMao({ alvo: confirma.centro, pose: 'pressionando' });
        cb.aoTeclar('CONFIRMA');
      },
    });
    t += tempos.confirmar * 0.45;

    timeline.chamar('solta-confirma', {
      at: t,
      fn: () => {
        cb.aoSoltarTecla('CONFIRMA');
        cb.aoMoverMao({ alvo: confirma.centro, pose: 'apontando' });
      },
    });
    t += tempos.confirmar * 0.55;
  }

  // ---- P4: confirmado ----
  timeline.chamar('tela-confirmado', {
    at: t,
    fn: () => cb.aoMostrarTela({ tipo: 'confirmado', votos: votos }),
  });
  t += tempos.confirmado;

  // ---- P5: a cédula sai da impressora ----
  timeline.chamar('cedula-sai', { at: t, fn: () => cb.aoSairCedula() });
  t += tempos.cedulaSai;

  // ---- P6: pega a cédula e deposita no slot ----
  if (geometria.slot) {
    timeline.chamar('pega-cedula', {
      at: t,
      fn: () => cb.aoMoverMao({ alvo: geometria.slot.centro, pose: 'segurando' }),
    });
    t += tempos.pegaCedula;

    timeline.chamar('vai-slot', {
      at: t,
      fn: () => cb.aoMoverMao({ alvo: geometria.slot.centro, pose: 'segurando' }),
    });
    t += tempos.irParaSlot;

    timeline.chamar('insere', {
      at: t,
      fn: () => {
        cb.aoMoverMao({ alvo: geometria.slot.centro, pose: 'inserindo' });
        cb.aoDepositarCedula();
      },
    });
    t += tempos.inserir;
  }

  // ---- P7: contagem ----
  timeline.chamar('contar', { at: t, fn: () => cb.aoContar({ votos }) });
  t += tempos.contar;

  // ---- P8: retirada ----
  timeline.chamar('retira', {
    at: t,
    fn: () => cb.aoMoverMao({ alvo: { x: 540, y: 1900 }, pose: 'retraindo' }),
  });
  timeline.chamar('tela-ocioso', {
    at: t + tempos.retirada,
    fn: () => cb.aoMostrarTela({ tipo: 'ocioso', votos }),
  });

  return timeline;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test tests/vote-sequence.test.js`
Expected: PASS — 12 testes

- [ ] **Step 5: Commit**

```bash
git add public/js/vote-sequence.js tests/vote-sequence.test.js
git commit -m "feat: coreografia completa do voto em timeline pura

As 17 etapas em 9 fases, montadas a partir da geometria medida. Aceita
geometria parcial e callbacks ausentes sem quebrar. Tecla que falta na
geometria é pulada em vez de derrubar a sequência.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 13: Ator da mão e integração na cena

**Files:**
- Create: `public/js/hand-actor.js`
- Modify: `public/js/demo.js`
- Test: `tests/hand-actor.test.js`

**Interfaces:**
- Consumes: `criarMaoSvg()` (Task 11), `construirSequenciaDeVoto()` (Task 12), `FilaDeAnimacao` (Task 9), `Ticker`/`PoolDeTimelines` (Task 8), `criarUrna()` (Task 3)
- Produces: `class AtorDaMao` com `executarVoto({ urna, numero, votos })` → `Promise`, `moverPara({x, y, pose})`, `recolher()`, `remedir()`

- [ ] **Step 1: Escrever o teste que falha**

Testa a máquina de estados pura do ator, com um renderizador falso.

```js
// tests/hand-actor.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularCaminho, MAO_FORA_DE_CENA } from '../public/js/hand-actor.js';

test('o caminho parte da origem e termina no alvo', () => {
  const p = calcularCaminho({ x: 540, y: 1500 }, { x: 700, y: 900 }, { arco: 90 });
  assert.deepEqual(p[0], { x: 540, y: 1500 });
  const fim = p.at(-1);
  assert.ok(Math.abs(fim.x - 700) < 0.01);
  assert.ok(Math.abs(fim.y - 900) < 0.01);
});

test('o caminho faz arco — o ponto médio sai da reta', () => {
  const reto = calcularCaminho({ x: 0, y: 0 }, { x: 100, y: 0 }, { arco: 0 });
  const curvo = calcularCaminho({ x: 0, y: 0 }, { x: 100, y: 0 }, { arco: 80 });
  const meioReto = reto[Math.floor(reto.length / 2)];
  const meioCurvo = curvo[Math.floor(curvo.length / 2)];
  assert.ok(meioCurvo.y < meioReto.y - 20, 'o arco deveria levantar a mão');
});

test('o caminho tem pelo menos 12 amostras para o movimento ser suave', () => {
  const p = calcularCaminho({ x: 0, y: 0 }, { x: 400, y: 400 }, { arco: 60 });
  assert.ok(p.length >= 12, `poucas amostras: ${p.length}`);
});

test('mover para o mesmo ponto devolve um caminho válido', () => {
  const p = calcularCaminho({ x: 100, y: 100 }, { x: 100, y: 100 }, { arco: 50 });
  assert.ok(p.length >= 12);
  assert.deepEqual(p.at(-1), { x: 100, y: 100 });
});

test('MAO_FORA_DE_CENA fica abaixo do palco', () => {
  assert.ok(MAO_FORA_DE_CENA.y > 1920, 'a mão deveria ficar fora do palco quando recolhida');
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/hand-actor.test.js`
Expected: FAIL — `Cannot find module '../public/js/hand-actor.js'`

- [ ] **Step 3: Implementar o ator**

```js
// public/js/hand-actor.js
import { POSES, interpolarPose } from './hand/poses.js';
import { Timeline, Ticker, PoolDeTimelines } from './anim/timeline.js';
import { FilaDeAnimacao } from './anim/queue.js';
import { construirSequenciaDeVoto } from './vote-sequence.js';

/** Onde a mão espera entre um voto e outro: abaixo da borda do palco. */
export const MAO_FORA_DE_CENA = { x: 540, y: 2000 };

/**
 * Amostra um arco entre dois pontos. Não é uma reta: uma mão que se move
 * em linha reta parece um cursor. O arco, somado à aceleração, é o que
 * faz o movimento parecer de uma pessoa.
 */
export function calcularCaminho(origem, destino, { arco = 70, amostras = 18 } = {}) {
  const pontos = [];
  const dx = destino.x - origem.x;
  const dy = destino.y - origem.y;
  const distancia = Math.hypot(dx, dy) || 1;
  // Perpendicular ao vetor origem→destino, apontando para cima.
  const px = -dy / distancia;
  const py = dx / distancia;

  for (let i = 0; i < amostras; i++) {
    const t = i / (amostras - 1);
    const elevacao = Math.sin(t * Math.PI) * arco;
    pontos.push({
      x: origem.x + dx * t + px * elevacao,
      y: origem.y + dy * t + py * elevacao,
    });
  }
  pontos[0] = { x: origem.x, y: origem.y };
  pontos[pontos.length - 1] = { x: destino.x, y: destino.y };
  return pontos;
}

/**
 * O ator é a ponte entre o motor puro e o DOM.
 *
 * Ele é dono da fila e do ticker, e é o único que sabe onde a mão está
 * na tela. A coreografia (vote-sequence) só fala em alvos e poses.
 */
export class AtorDaMao {
  constructor({ renderizador, camada, opcoes = {} }) {
    this.render = renderizador;
    this.camada = camada;
    this.ticker = new Ticker();
    this.pool = new PoolDeTimelines({ max: 8 });
    this.fila = new FilaDeAnimacao(opcoes.fila ?? {});
    this.posicao = { ...MAO_FORA_DE_CENA };
    this.poseAtual = POSES.repouso;
    this.timelineAtual = null;
    this.ocupado = false;
    this._geometriaCache = null;

    camada.append(renderizador.sombra, renderizador.el);
    renderizador.posicionar(this.posicao.x, this.posicao.y, { escala: 1 });
    renderizador.aplicarPose(this.poseAtual);
    this.ticker.iniciar();

    // Redimensionar invalida as coordenadas medidas — sem isto o dedo
    // passa a errar a tecla depois que o OBS muda a resolução da fonte.
    window.addEventListener('resize', () => this.remedir());
    window.addEventListener('palco:redimensionado', () => this.remedir());
  }

  remedir() { this._geometriaCache = null; }

  geometriaDe(urna) {
    if (!this._geometriaCache || this._geometriaCache.urna !== urna) {
      this._geometriaCache = { urna, geo: urna.medirGeometria() };
    }
    return this._geometriaCache.geo;
  }

  /**
   * Move a mão ao longo de um arco até o alvo, com a pose indicada.
   * Devolve a timeline para quem chamou poder encadear.
   */
  moverPara({ alvo, pose = 'apontando', duracao = 420, timeline = null }) {
    const t = timeline ?? this.pool.obter();
    const origem = { ...this.posicao };
    const destino = { x: alvo.x, y: alvo.y - 40 };  // o dedo toca acima do centro da tecla
    const caminho = calcularCaminho(origem, destino, { arco: 70 });
    const poseAlvo = POSES[pose] ?? POSES.apontando;
    const posePartida = this.poseAtual;

    // Sobe no meio do trajeto: a altura alimenta a sombra projetada.
    t.add('percurso', {
      at: 0, dur: duracao, ease: 'in-out-cubic', from: 0, to: 1,
      onUpdate: (p) => {
        const idx = Math.min(caminho.length - 1, Math.floor(p * (caminho.length - 1)));
        const ponto = caminho[idx];
        this.posicao = ponto;
        const altura = Math.sin(p * Math.PI) * 70;
        const rot = (poseAlvo.pulso?.rot ?? 0) * p;
        this.render.posicionar(ponto.x, ponto.y, { rot, escala: 1, altura });
        this.poseAtual = interpolarPose(posePartida, poseAlvo, Math.min(1, p * 1.6));
        this.render.aplicarPose(this.poseAtual);
      },
    });
    return t;
  }

  /** Executa um voto completo numa urna. Devolve Promise para a fila. */
  executarVoto({ urna, numero, votos, usuario = '', presente = '' }) {
    return new Promise((resolve) => {
      const timeline = this.pool.obter();
      const geometria = this.geometriaDe(urna);

      construirSequenciaDeVoto({
        geometria,
        numero,
        votos,
        timeline,
        callbacks: {
          aoDestacar: () => urna.el.classList.add('is-destacada'),
          aoMoverMao: ({ alvo, pose }) => this.moverPara({ alvo, pose, timeline }),
          aoTeclar: (t) => { urna.pressionarTecla(t); urna.acenderLed(t, true); },
          aoSoltarTecla: (t) => { urna.soltarTecla(t); setTimeout(() => urna.acenderLed(t, false), 140); },
          aoMostrarTela: (estado) => urna.definirTela({ numero, nome: urna.config.nome, ...estado }),
          aoSairCedula: () => urna.el.classList.add('is-cedula-saindo'),
          aoDepositarCedula: () => urna.el.classList.add('is-cedula-entrando'),
          aoContar: () => {
            urna.el.classList.remove('is-cedula-saindo', 'is-cedula-entrando');
            urna.el.classList.add('is-contando');
          },
        },
      });

      timeline.aoTerminar(() => {
        urna.el.classList.remove('is-destacada', 'is-contando', 'is-cedula-saindo', 'is-cedula-entrando');
        this.recolher();
        this.pool.devolver(timeline);
        resolve();
      });

      timeline.play();
      this.ticker.registrar(timeline);
    });
  }

  recolher() {
    this.posicao = { ...MAO_FORA_DE_CENA };
    this.render.posicionar(this.posicao.x, this.posicao.y, { escala: 1, altura: 0 });
    this.render.aplicarPose(POSES.repouso);
  }

  /**
   * O laço de frames do ator.
   *
   * Não abre um requestAnimationFrame próprio: a aplicação tem um único RAF,
   * no Ticker, e este passo entra nele junto com as timelines. Um RAF por
   * subsistema é o caminho mais curto para dessincronizar animação e fila.
   *
   * O `finally` garante que uma animação que falha não deixa a fila travada.
   */
  iniciar() {
    this.ticker.registrarPasso((delta) => {
      this.fila.tick(delta);
      if (this.ocupado) return;

      const item = this.fila.proximo();
      if (!item) return;

      this.ocupado = true;
      const executar = item.modo === 'lote'
        ? this.carimbar(item)
        : this.executarVoto(item);

      executar
        .catch((erro) => console.error('[ator] falha ao animar voto', erro))
        .finally(() => {
          this.fila.concluir(item.id);
          this.ocupado = false;
        });
    });
  }

  /**
   * Modo lote: sob rajada, um carimbo rápido no lugar da sequência inteira.
   * O voto já foi contado — este carimbo é só o registro visual de que
   * ele passou. Precisa ser visível, senão a rajada parece não fazer nada.
   */
  carimbar(item) {
    return new Promise((resolve) => {
      const urna = item.urna;
      urna.el.classList.add('is-destacada', 'is-contando');
      urna.pressionarTecla('CONFIRMA');
      urna.acenderLed('CONFIRMA', true);

      setTimeout(() => {
        urna.soltarTecla('CONFIRMA');
        urna.acenderLed('CONFIRMA', false);
        urna.el.classList.remove('is-destacada', 'is-contando');
        resolve();
      }, 260 / this.fila.velocidade);
    });
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test tests/hand-actor.test.js`
Expected: PASS — 5 testes

- [ ] **Step 5: Ligar tudo no demo e verificar na tela**

```js
// public/js/demo.js
import { montarCenario } from './scene.js';
import { criarUrna } from './urna.js';
import { criarMaoSvg } from './hand/hand-svg.js';
import { AtorDaMao } from './hand-actor.js';

const { camadaUrnas, camadaMao } = montarCenario(document.getElementById('cena'));

const urnas = {
  u1: criarUrna({ id: 'u1', x: 60,  y: 30, rot: -8, corPrimaria: '#1a5fd0', corSecundaria: '#0d3a8f', nome: 'URNA 1' }),
  u2: criarUrna({ id: 'u2', x: 580, y: 30, rot:  8, corPrimaria: '#e02020', corSecundaria: '#8f0d0d', nome: 'URNA 2' }),
};
for (const u of Object.values(urnas)) {
  camadaUrnas.append(u.el);
  u.definirTela({ tipo: 'ocioso', numero: u.config.id === 'u1' ? '22' : '13', nome: u.config.nome, votos: 0 });
}

const mao = criarMaoSvg();
const ator = new AtorDaMao({ renderizador: mao, camada: camadaMao });
ator.iniciar();

// Controles de demonstração — some quando o modo de teste real chegar (Etapa 6)
const barra = document.createElement('div');
barra.className = 'demo-barra';
barra.innerHTML = `
  <button data-votar="u1">Rosa na Urna 1</button>
  <button data-votar="u2">Heart Me na Urna 2</button>`;
document.body.append(barra);

barra.addEventListener('click', (e) => {
  const id = e.target.dataset.votar;
  if (!id) return;
  const urna = urnas[id];
  ator.fila.enfileirar({
    id: `demo-${performance.now()}`,
    urna,
    urnaId: id,
    numero: id === 'u1' ? '22' : '13',
    votos: 1,
    prioridade: 0,
  });
});
```

Adicione em `public/css/tokens.css`:

```css
/* Barra de demonstração — não existe na versão final (Etapa 6 substitui) */
.demo-barra {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 10px;
  z-index: 999;
}
.demo-barra button {
  padding: 10px 18px;
  border: 1px solid #3a3a44;
  border-radius: 8px;
  background: #1b1b22;
  color: #eee;
  font: 500 14px/1 "Segoe UI", system-ui, sans-serif;
  cursor: pointer;
}
.demo-barra button:hover { background: #2a2a34; }
```

Run: `npm start` → clique em "Rosa na Urna 1"

Expected: a Urna 1 acende com halo azul, a mão sobe de baixo em arco, o indicador estende, digita `2` e `1` (cada tecla afunda e o LED acende, o dígito aparece na tela), vai até CONFIRMA, pressiona, a tela mostra `VOTO CONFIRMADO`, a cédula sai, a mão pega, leva até a abertura do topo, insere, e a mão se retira. Clique em "Heart Me na Urna 2" e confirme que **a mão vai para a outra urna**, não digita na primeira.

- [ ] **Step 6: Verificar o caso da aba em segundo plano**

Com a página aberta, troque de aba por 30 segundos, enfileire 3 votos por outra via (ou volte e clique 3× rápido) e retorne.

Expected: as animações acontecem em sequência, uma por vez, no ritmo normal. A mão **não** teleporta e os três votos **não** acontecem no mesmo frame.

- [ ] **Step 7: Commit**

```bash
git add public/js/hand-actor.js public/js/demo.js public/css/tokens.css tests/hand-actor.test.js
git commit -m "feat: ator da mão, caminho em arco e integração na cena

A mão percorre um arco com pico de altura no meio do trajeto, e a
altura alimenta o afastamento da sombra projetada. Redimensionar
invalida a geometria medida. A fila drena mesmo se a animação falhar.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 14: Cédula física

**Files:**
- Modify: `public/css/urna.css` — a cédula e as animações de saída/entrada
- Modify: `public/js/urna.js` — criar o elemento da cédula
- Test: `tests/cedula.test.js`

**Interfaces:**
- Consumes: `criarUrna()` (Task 3)
- Produces: `criarCedula(urna, { usuario, presente, votos })` injeta o papel; classes `is-cedula-saindo` e `is-cedula-entrando` controlam a animação

- [ ] **Step 1: Escrever o teste que falha**

```js
// tests/cedula.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markupDaCedula } from '../public/js/urna.js';

test('a cédula traz o nome do usuário e do presente', () => {
  const html = markupDaCedula({ usuario: 'João', presente: 'Rosa', votos: 1, numero: '22' });
  assert.match(html, /João/);
  assert.match(html, /Rosa/);
});

test('a cédula mostra a quantidade quando vale mais de um voto', () => {
  const html = markupDaCedula({ usuario: 'Maria', presente: 'Raro', votos: 10, numero: '13' });
  assert.match(html, /10/);
});

test('a cédula omite a quantidade quando vale um voto só', () => {
  const html = markupDaCedula({ usuario: 'Maria', presente: 'Rosa', votos: 1, numero: '13' });
  assert.ok(!html.includes('votos'), 'não deveria mencionar quantidade para 1 voto');
});

test('a cédula escapa HTML do nome do usuário', () => {
  const html = markupDaCedula({ usuario: '<script>alert(1)</script>', presente: 'Rosa', votos: 1, numero: '22' });
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/cedula.test.js`
Expected: FAIL — `markupDaCedula is not a function`

- [ ] **Step 3: Implementar `markupDaCedula` e o elemento**

Em `public/js/urna.js`:

```js
export function markupDaCedula({ usuario = '', presente = '', votos = 1, numero = '' }) {
  return `
    <div class="cedula__borda">
      <div class="cedula__titulo">VOTO</div>
      <div class="cedula__urna">${esc(numero)}</div>
      <div class="cedula__linha"></div>
      <div class="cedula__quem">${esc(usuario)}</div>
      <div class="cedula__presente">${esc(presente)}</div>
      ${votos > 1 ? `<div class="cedula__votos">${esc(votos)} votos</div>` : ''}
      <div class="cedula__picotado"></div>
    </div>`;
}
```

E dentro de `criarUrna`, crie o compartimento e o elemento da cédula:

```js
  const cedulaEl = document.createElement('div');
  cedulaEl.className = 'urna__cedula';
  el.append(cedulaEl);
```

Exponha no objeto retornado:

```js
    mostrarCedula(dados) {
      cedulaEl.innerHTML = markupDaCedula({ numero: config.numero, ...dados });
      // reinicia a animação de entrada
      cedulaEl.classList.remove('is-visivel');
      void cedulaEl.offsetWidth;
      cedulaEl.classList.add('is-visivel');
    },
    esconderCedula() { cedulaEl.classList.remove('is-visivel'); },
```

- [ ] **Step 4: Escrever o CSS da cédula**

```css
/* ---------- Cédula e impressora ---------- */
.urna__cedula {
  position: absolute;
  left: 18px;
  top: 150px;
  width: 200px;
  height: 0;
  overflow: hidden;
  opacity: 0;
  transform: translateY(-30px) rotate(-2deg);
  transition:
    opacity 180ms linear,
    transform 520ms var(--ease-padrao),
    height 520ms var(--ease-padrao);
  z-index: 5;
  pointer-events: none;
}

.urna__cedula.is-visivel {
  height: 128px;
  opacity: 1;
  transform: translateY(0) rotate(-2deg);
}

.cedula__borda {
  width: 200px;
  height: 128px;
  padding: 8px 10px;
  border-radius: 3px;
  background: linear-gradient(174deg, #ffffff 0%, #f6f4ee 62%, #e8e4da 100%);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.9) inset,
    0 8px 18px rgba(30, 18, 6, 0.35),
    0 1px 3px rgba(30, 18, 6, 0.4);
  font-family: "Consolas", monospace;
  color: #2a2a2a;
  position: relative;
}

.cedula__titulo   { font-size: 9px;  letter-spacing: 0.3em; color: #8a8578; }
.cedula__urna     { font-size: 34px; font-weight: 700; line-height: 1; color: var(--cor-urna); }
.cedula__linha    { height: 1px; margin: 5px 0; background: repeating-linear-gradient(90deg, #bbb 0 4px, transparent 4px 7px); }
.cedula__quem     { font-size: 11px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cedula__presente { font-size: 10px; color: #6a6558; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cedula__votos    { font-size: 11px; font-weight: 700; color: var(--cor-urna); margin-top: 3px; }

/* Borda picotada — detalhe de fabricação que faz ler como papel impresso */
.cedula__picotado {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 4px;
  background: repeating-linear-gradient(90deg,
    transparent 0 3px,
    rgba(0, 0, 0, 0.18) 3px 4px);
}

/* A cédula sendo empurrada para dentro da abertura */
.urna.is-cedula-entrando .urna__cedula {
  height: 0;
  opacity: 0;
  transform: translateY(-190px) scaleY(0.5) rotate(-2deg);
  transition:
    opacity 260ms linear 260ms,
    transform 560ms var(--ease-padrao),
    height 560ms var(--ease-padrao) 200ms;
}

/* Pulso da urna ao contabilizar */
.urna.is-contando .urna__corpo {
  animation: pulso-contagem 600ms var(--ease-padrao);
}

@keyframes pulso-contagem {
  0%   { filter: brightness(1); }
  22%  { filter: brightness(1.16); }
  100% { filter: brightness(1); }
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `node --test tests/cedula.test.js`
Expected: PASS — 4 testes

- [ ] **Step 6: Ligar a cédula na coreografia e verificar**

Em `hand-actor.js`, acrescente aos callbacks de `executarVoto`, passando os dados do voto:

```js
        callbacks: {
          aoDestacar: () => urna.el.classList.add('is-destacada'),
          // ...
          aoSairCedula: () => {
            urna.mostrarCedula({ usuario, presente, votos });
            urna.el.classList.add('is-cedula-saindo');
          },
          aoDepositarCedula: () => urna.el.classList.add('is-cedula-entrando'),
          aoContar: () => {
            urna.esconderCedula();
            urna.el.classList.remove('is-cedula-saindo', 'is-cedula-entrando');
            urna.el.classList.add('is-contando');
          },
        },
```

E `executarVoto` passa a receber `usuario` e `presente` em seu parâmetro.

No `demo.js`, passe dados de exemplo ao enfileirar:

```js
  ator.fila.enfileirar({
    id: `demo-${performance.now()}`,
    urna, urnaId: id,
    numero: id === 'u1' ? '22' : '13',
    votos: 1,
    usuario: 'Espectador',
    presente: id === 'u1' ? 'Rosa' : 'Heart Me',
    prioridade: 0,
  });
```

Run: `npm start` → clique em "Rosa na Urna 1"

Expected: depois de CONFIRMA, um papel branco com borda picotada desliza para fora da urna trazendo o número, o nome e o presente; a mão o pega, leva até a abertura no topo, e o papel some para dentro com o corpo da urna pulsando.

- [ ] **Step 7: Commit**

```bash
git add public/css/urna.css public/js/urna.js public/js/hand-actor.js public/js/demo.js tests/cedula.test.js
git commit -m "feat: cédula física com impressão, depósito e pulso de contagem

Papel com borda picotada saindo da urna com número, espectador e
presente. Some para dentro da abertura no depósito. Nome do usuário é
escapado antes de entrar no DOM.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 15: As duas urnas e a navegação entre elas

**Files:**
- Modify: `public/js/demo.js` — consolidação final
- Modify: `public/css/urna.css` — posicionamento das duas urnas
- Test: `tests/navegacao.test.js`

**Interfaces:**
- Consumes: tudo das tarefas anteriores
- Produces: cena final das Etapas 1–3, pronta para validação visual

- [ ] **Step 1: Escrever o teste que falha**

```js
// tests/navegacao.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularCaminho } from '../public/js/hand-actor.js';

// Geometria aproximada das duas urnas em um palco 1080x1920
const URNA_1 = { x: 300, y: 900 };
const URNA_2 = { x: 780, y: 900 };

test('da urna 1 para a urna 2 o arco passa por cima, não por baixo', () => {
  const p = calcularCaminho(URNA_1, URNA_2, { arco: 80 });
  const meio = p[Math.floor(p.length / 2)];
  assert.ok(meio.y < URNA_1.y, `o arco deveria subir; y=${meio.y}`);
});

test('o trajeto entre as urnas é mais longo que o trajeto curto interno', () => {
  const entreUrnas = calcularCaminho(URNA_1, URNA_2);
  const interno = calcularCaminho({ x: 700, y: 900 }, { x: 760, y: 900 });
  const comprimento = (p) => p.slice(1).reduce((s, pt, i) =>
    s + Math.hypot(pt.x - p[i].x, pt.y - p[i].y), 0);
  assert.ok(comprimento(entreUrnas) > comprimento(interno));
});

test('o caminho nunca sai do palco horizontalmente', () => {
  const p = calcularCaminho(URNA_1, URNA_2, { arco: 120 });
  for (const pt of p) {
    assert.ok(pt.x >= -200 && pt.x <= 1280, `ponto fora do palco: x=${pt.x}`);
  }
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/navegacao.test.js`
Expected: FAIL se o arco estiver apontando para baixo. Se passar de primeira, siga — o teste está travando o comportamento correto.

- [ ] **Step 3: Consolidar o `demo.js`**

```js
// public/js/demo.js
import { montarCenario } from './scene.js';
import { criarUrna } from './urna.js';
import { criarMaoSvg } from './hand/hand-svg.js';
import { AtorDaMao } from './hand-actor.js';

const { camadaUrnas, camadaMao } = montarCenario(document.getElementById('cena'));

// Posições em coordenadas do palco (1080x1920). As urnas convergem
// levemente para o centro, o que reforça a perspectiva da cena.
const CONFIG_URNAS = [
  { id: 'u1', x: 60,  y: 30, rot: -7, nome: 'URNA 1', numero: '22',
    corPrimaria: '#1a5fd0', corSecundaria: '#0d3a8f' },
  { id: 'u2', x: 580, y: 30, rot:  7, nome: 'URNA 2', numero: '13',
    corPrimaria: '#e02020', corSecundaria: '#8f0d0d' },
];

const urnas = {};
for (const cfg of CONFIG_URNAS) {
  const u = criarUrna(cfg);
  u.definirTela({ tipo: 'ocioso', numero: cfg.numero, nome: cfg.nome, votos: 0 });
  camadaUrnas.append(u.el);
  urnas[cfg.id] = u;
}

const mao = criarMaoSvg();
const ator = new AtorDaMao({ renderizador: mao, camada: camadaMao });
ator.iniciar();

// ---- Controles de demonstração ----------------------------------------
// Substituídos pelo modo de teste real na Etapa 6. Servem para validar
// visualmente as Etapas 1-3 antes de construir o motor de votação.
const PRESENTES_DEMO = [
  { nome: 'Rosa',     urnaId: 'u1' },
  { nome: 'Heart Me', urnaId: 'u2' },
];

const barra = document.createElement('div');
barra.className = 'demo-barra';
barra.innerHTML = PRESENTES_DEMO
  .map((p) => `<button data-presente="${p.nome}" data-urna="${p.urnaId}">${p.nome} → ${urnas[p.urnaId].config.nome}</button>`)
  .join('') + '<button data-rajada="1">Rajada de 12</button>';
document.body.append(barra);

let contador = 0;

function enfileirar(urnaId, presente) {
  const u = urnas[urnaId];
  contador += 1;
  ator.fila.enfileirar({
    id: `demo-${contador}`,
    urna: u,
    urnaId,
    numero: u.config.numero,
    votos: 1,
    usuario: `Espectador ${contador}`,
    presente,
    prioridade: 0,
    aoContar: () => {},
  });
}

barra.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.rajada) {
    for (let i = 0; i < 12; i++) {
      setTimeout(() => enfileirar(i % 2 ? 'u1' : 'u2', i % 2 ? 'Rosa' : 'Heart Me'), i * 90);
    }
    return;
  }
  enfileirar(btn.dataset.urna, btn.dataset.presente);
});
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test tests/navegacao.test.js`
Expected: PASS — 3 testes

- [ ] **Step 5: Rodar a suíte completa**

Run: `npm test`
Expected: PASS — todas as tarefas, 0 falhas

- [ ] **Step 6: Validação visual — o portão das Etapas 1–3**

Run: `npm start` → `http://localhost:3000`

Percorra esta lista e confirme cada item:

1. As duas urnas parecem **equipamentos**, não caixas: dá para ver o topo, a lateral e a sombra de contato
2. A placa, os parafusos, os respiros e a abertura de cédula estão visíveis e coerentes
3. A tela tem brilho, scanlines e reflexo de vidro
4. As teclas têm relevo e afundam quando pressionadas
5. A mão parece uma mão: pele com gradiente, unhas, vincos, tendões
6. A sombra da mão se afasta dela quando a mão levanta
7. "Rosa → URNA 1" faz a mão ir para a **Urna 1** e digitar `22`
8. "Heart Me → URNA 2" faz a mão ir para a **Urna 2** e digitar `13`
9. O dedo dobra nos pivôs em vez de deslizar rígido
10. A cédula sai, é pega, e entra na abertura do topo
11. "Rajada de 12" não trava a página: as animações enfileiram e o excedente vira carimbo rápido
12. Não há barra de rolagem em nenhum tamanho de janela

- [ ] **Step 7: Commit**

```bash
git add public/js/demo.js public/css/urna.css tests/navegacao.test.js
git commit -m "feat: cena final das Etapas 1-3 com duas urnas navegáveis

Consolida cenário, duas urnas com identidade própria, mão articulada
e a coreografia completa. Controles de demonstração para validação
visual antes de construir o motor de votação.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Auto-revisão do plano

**1. Cobertura da spec**

| Seção da spec | Tarefa que implementa |
|---|---|
| 4.1 Cenário | Task 2 |
| 4.2 Urna (estrutura) | Tasks 3, 4, 5, 6 |
| 4.3 Mão | Tasks 10, 11 |
| 4.4 Motor de animação (timeline, ticker, pool) | Task 8 |
| 4.4 Fila (prioridade, lote, watchdog) | Task 9 |
| 4.4 Sequência de 17 etapas | Task 12 |
| 4.4 Cédula (fases P5–P6) | Task 14 |
| 4.7 Backend (só servidor estático nesta fase) | Task 1 |
| 5 Fluxo de dados | Fora do escopo desta fase — Etapa 4 |
| 5 Recuperação após reload | Fora do escopo desta fase — Etapa 4 |
| 4.5 Motor de votação | Fora do escopo desta fase — Etapa 4 |
| 4.6 Placar | Fora do escopo desta fase — Etapa 4 |
| 4.8 Painel administrativo | Fora do escopo desta fase — Etapa 5 |
| 6 Configuração | Fora do escopo desta fase — Etapa 5 |
| 7 Tratamento de erros | Parcial: timeline (Task 8), fila (Task 9), ator (Task 13) |
| 8 Testes críticos | Fora do escopo desta fase — Etapa 6 |
| 11 Execução no Windows | Task 1 |
| Etapa 3 da spec (mão navega entre urnas) | Task 15 |

**2. Varredura de placeholders:** nenhuma ocorrência de "TBD", "TODO" ou "implementar depois".
O único stub deliberado é `criarMaoSprite()`, que a spec já prevê como trabalho futuro e
que tem a interface definida na Task 11.

**3. Consistência de tipos:** conferido — `Timeline.tick()` devolve booleano em todas as
tarefas; `FilaDeAnimacao.proximo()` devolve `null` (nunca `undefined`) quando vazia;
`paraCoordenadasDoPalco()` devolve `{x, y, largura, altura, centro}` e é consumido assim
na Task 12; `POSES` é congelado e `interpolarPose` sempre devolve objeto novo;
`medirGeometria()` devolve `{teclas, slot, tela, corpo}` e a Task 12 acessa exatamente
esses nomes.

**4. Foco de revisão:** cada uma das cinco linhas tem teste na tarefa dona — aba em
segundo plano (Task 8), voto para a outra urna no meio da sequência (Tasks 9 e 13),
redimensionamento (Tasks 3 e 13), exceção no meio da sequência (Tasks 8, 9 e 12),
memória em live longa (Task 8).

**5. Defeitos encontrados nesta revisão e já corrigidos no plano:**

| Defeito | Onde | Correção |
|---|---|---|
| Um teste que falharia sempre: `'teclar:CONFIRMA'` também casa com o prefixo `'teclar:'`, então "último dígito" e "confirma" devolviam o mesmo índice | Task 12, teste de ordenação | Filtro explícito excluindo `CONFIRMA` da lista de dígitos |
| Os tempos somavam **6,9s** por voto, contra os ~4,5s orçados na spec §4.4 — 50% mais fila em live movimentada | Task 12, `TEMPOS` | Reajustados para 4,65s, com teste que trava a faixa (4000–5200ms) |
| O ator abria um **segundo `requestAnimationFrame`**, contradizendo o RAF único da spec §4.4 | Task 13, `iniciar()` | `Ticker.registrarPasso()` + `avancar(delta)`; o ator entra no RAF existente |
| `transform-origin: 244px: 92px;` — dois-pontos no lugar de espaço, regra CSS inválida e silenciosamente ignorada | Task 11, `hand.css` | Corrigido para `244px 92px` |
| Os pivôs dos dedos no SVG eram calculados por aritmética solta (`244 - 28`) e ficavam 1px fora do `transform-origin` do CSS — o dedo deslizaria em vez de dobrar | Task 11, `markupDaMao()` | `dedo(nome, pivoX, largura)` recebe o pivô, que passa a ser a única fonte de verdade |
| `FASES` não listava `digitacao`, a fase mais longa, e inventava offsets que não correspondiam à construção real | Task 12, `FASES` | Reescrita como lista fiel, com `digitacao` marcada como duração variável |
| `carimbar()` chamava um `aoContar` vazio — em rajada, a urna não dava nenhum sinal visível | Task 13, `carimbar()` | Pressiona CONFIRMA com LED aceso e pulsa o gabinete |
