/*
 * Campos de formulário como DADO, e não como marcação escrita à mão.
 *
 * A aba do painel não desenha campo: ela declara uma lista de campos — o
 * caminho na configuração, o rótulo, o tipo — e este módulo faz o resto. A
 * diferença importa porque são sete abas, e escrever cada `<input>` à mão
 * sete vezes é sete oportunidades de esquecer o `data-campo`, que é o que
 * liga o campo ao lugar da configuração que ele governa.
 *
 * Um campo sem `data-campo` é o defeito mais caro desta tela: o operador
 * digita, o painel diz "salvo", e a live continua igual.
 *
 * Nada aqui toca no DOM. `montarCampos` devolve texto e `patchDe` recebe um
 * mapa de valores lidos — as duas pontas da mesma volta, e as duas testáveis
 * sem navegador. Quem lê o DOM é uma função de dez linhas em admin.js.
 */

const TIPOS = new Set(['texto', 'numero', 'cor', 'booleano', 'selecao', 'area']);

/** Escapa o que o operador digitou antes de pôr dentro de marcação. */
export function escapar(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * O valor que está valendo num caminho, ou `undefined`.
 *
 * Não lança em caminho ausente: a configuração do operador é PARCIAL por
 * desenho — ele manda só a aba que mexeu —, então caminho ausente é o caso
 * comum, e não uma falha. Lançar aqui derrubaria a aba por causa de um campo
 * que nem chegou a existir.
 */
export function valorEm(objeto, caminho) {
  let atual = objeto;
  for (const parte of String(caminho).split('.')) {
    if (atual === null || typeof atual !== 'object') return undefined;
    atual = atual[parte];
  }
  return atual;
}

/** Os atributos comuns a todo campo, com o gancho que liga o campo ao caminho. */
function comuns(def) {
  return `data-campo="${escapar(def.caminho)}" id="c-${escapar(def.caminho)}"`;
}

function campo(def, valor) {
  const atrs = comuns(def);
  const limite = (nome, v) => (Number.isFinite(v) ? ` ${nome}="${v}"` : '');

  switch (def.tipo) {
    case 'numero':
      return `<input type="number" ${atrs}`
        + `${limite('min', def.min)}${limite('max', def.max)}`
        + `${Number.isFinite(def.passo) ? ` step="${def.passo}"` : ''}`
        + ` value="${escapar(valor ?? '')}">`;

    case 'cor':
      // O `<input type="color">` só aceita `#rrggbb`. Um valor em branco vira
      // preto na tela, e salvar sem tocar no campo gravaria preto por cima da
      // cor do operador — por isso o valor ausente vira um cinza NEUTRO e o
      // campo fica marcado como "não mexi", que é o que `pendenciasDe` lê.
      return `<input type="color" ${atrs} data-vazio="${valor ? 'nao' : 'sim'}"`
        + ` value="${escapar(valor || '#8a8f98')}">`;

    case 'booleano':
      return `<input type="checkbox" ${atrs}${valor ? ' checked' : ''}>`;

    case 'selecao': {
      const opcoes = (def.opcoes ?? []).map((o) => {
        const v = typeof o === 'string' ? o : o.valor;
        const r = typeof o === 'string' ? o : o.rotulo;
        const sel = String(valor ?? '') === String(v) ? ' selected' : '';
        return `<option value="${escapar(v)}"${sel}>${escapar(r)}</option>`;
      }).join('');
      return `<select ${atrs}>${opcoes}</select>`;
    }

    case 'area':
      return `<textarea ${atrs} rows="${def.linhas ?? 3}">${escapar(valor ?? '')}</textarea>`;

    case 'texto':
    default:
      return `<input type="text" ${atrs} value="${escapar(valor ?? '')}">`;
  }
}

/**
 * O HTML de uma lista de campos, já com o que está valendo em cada um.
 *
 * Uma definição de tipo desconhecido cai em `texto`, e não some: um campo
 * que não aparece é um campo que ninguém edita, e a aba mostraria menos do
 * que a configuração tem sem que nada avisasse.
 */
export function montarCampos(defs, config) {
  return defs.map((def) => {
    const tipo = TIPOS.has(def.tipo) ? def.tipo : 'texto';
    const valor = valorEm(config, def.caminho);
    const dica = def.dica ? `<span class="campo__dica">${escapar(def.dica)}</span>` : '';
    const largo = def.largo ? ' campo--largo' : '';
    return `<label class="campo${largo}" for="c-${escapar(def.caminho)}">`
      + `<span class="campo__rotulo">${escapar(def.rotulo ?? def.caminho)}</span>`
      + campo({ ...def, tipo }, valor)
      + dica
      + '</label>';
  }).join('');
}

/**
 * Devolve `[objeto, container]` do caminho, criando os dois quando faltam.
 *
 * Segmento puramente numérico vira ÍNDICE de lista. Não é detalhe de
 * implementação: `mesclar` SUBSTITUI listas inteiras em vez de remendar por
 * índice (está decidido e comentado no server/config.js), então um remendo
 * de presente precisa ser uma lista completa — meia lista apagaria a outra
 * metade.
 */
function descer(raiz, partes, ultimo) {
  let atual = raiz;
  for (const parte of partes) {
    const indice = /^\d+$/.test(parte) ? Number(parte) : null;
    const proximo = partes[partes.indexOf(parte) + 1];
    const proximoEhIndice = proximo !== undefined && /^\d+$/.test(proximo);
    if (indice !== null) {
      if (!Array.isArray(atual)) throw new Error('caminho mistura lista e objeto');
      if (atual[indice] === undefined) atual[indice] = proximoEhIndice || parte === ultimo ? (proximoEhIndice ? [] : {}) : {};
      atual = atual[indice];
    } else {
      if (atual[parte] === undefined || typeof atual[parte] !== 'object') {
        atual[parte] = proximoEhIndice ? [] : {};
      }
      atual = atual[parte];
    }
  }
  return atual;
}

/** Converte o texto que veio do DOM para o tipo que a configuração espera. */
function converter(def, bruto) {
  if (def.tipo === 'numero') return Number(bruto);
  if (def.tipo === 'booleano') return Boolean(bruto);
  // O resto é texto — inclusive cor, que o servidor guarda como `#rrggbb`.
  return bruto === undefined || bruto === null ? '' : String(bruto);
}

/**
 * A volta: os valores lidos do formulário viram um remendo da configuração.
 *
 * Um caminho que não veio no mapa fica FORA do remendo. É o que impede a aba
 * de apagar o que ela não mostrou: a aba Rodada só manda `rodada`, e o
 * mapeamento de presentes que ela nunca viu continua valendo.
 */
export function patchDe(defs, valores) {
  const saida = {};
  for (const def of defs) {
    if (!Object.prototype.hasOwnProperty.call(valores, def.caminho)) continue;
    const tipo = TIPOS.has(def.tipo) ? def.tipo : 'texto';
    const partes = String(def.caminho).split('.');
    const ultimo = partes[partes.length - 1];
    const pai = descer(saida, partes.slice(0, -1), ultimo);
    const valor = converter({ ...def, tipo }, valores[def.caminho]);
    if (Array.isArray(pai)) pai[Number(ultimo)] = valor;
    else pai[ultimo] = valor;
  }
  return saida;
}

/**
 * O que impede a aba de salvar.
 *
 * Número em branco é pendência, e não zero: `Number('')` é `0`, e zero é um
 * valor válido para quase todo número daqui — duração de rodada inclusive.
 * Deixar passar transformaria "apaguei o campo sem querer" em "a rodada
 * agora dura zero segundo", que o servidor recusa em silêncio caindo no
 * padrão. O operador precisa ver o campo vazio ANTES de salvar.
 *
 * Texto em branco não é pendência: `foto` é opcional, e recusar o salvamento
 * por causa de um campo que pode ficar vazio travaria a aba por nada.
 */
export function pendenciasDe(defs, valores) {
  const pendencias = [];
  for (const def of defs) {
    if (!Object.prototype.hasOwnProperty.call(valores, def.caminho)) continue;
    const tipo = TIPOS.has(def.tipo) ? def.tipo : 'texto';
    const bruto = valores[def.caminho];
    if (tipo !== 'numero') continue;

    const texto = String(bruto ?? '').trim();
    if (texto === '') {
      pendencias.push({ caminho: def.caminho, rotulo: def.rotulo ?? def.caminho, motivo: 'está em branco' });
      continue;
    }
    const n = Number(texto);
    if (!Number.isFinite(n)) {
      pendencias.push({ caminho: def.caminho, rotulo: def.rotulo ?? def.caminho, motivo: 'não é um número' });
      continue;
    }
    if (Number.isFinite(def.min) && n < def.min) {
      pendencias.push({ caminho: def.caminho, rotulo: def.rotulo ?? def.caminho, motivo: `é menor que ${def.min}` });
    } else if (Number.isFinite(def.max) && n > def.max) {
      pendencias.push({ caminho: def.caminho, rotulo: def.rotulo ?? def.caminho, motivo: `é maior que ${def.max}` });
    }
  }
  return pendencias;
}
