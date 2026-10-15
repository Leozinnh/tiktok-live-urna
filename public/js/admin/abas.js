/*
 * As sete abas do painel, declaradas como dado.
 *
 * Cada aba é uma lista de campos com o caminho na configuração. Nenhuma delas
 * desenha nada — quem desenha é `campos.js` — e é essa separação que deixa um
 * teste conferir, sem navegador, que TODO caminho aqui existe do outro lado.
 *
 * A regra que governa este arquivo: só entra campo que o servidor HONRA.
 * Seria fácil pôr aqui um "ícone da urna" porque a especificação o cita, mas
 * o `normalizar` do servidor não conhece essa chave, e o campo viraria o pior
 * defeito possível desta tela — o operador digita, o painel diz "salvo", e
 * nada muda. O que a spec pede e o servidor ainda não honra fica de fora, à
 * espera da etapa que o implementar.
 *
 * `campos` é função, e não lista, por causa das abas que crescem com a
 * configuração: a de presentes tem um cartão por presente cadastrado, e a de
 * testes tem um botão por presente. Uma lista fixa mentiria no dia em que o
 * operador cadastrasse o terceiro presente.
 */

const COR = { tipo: 'cor' };

const CAMPOS_DA_URNA = [
  { campo: 'nome', rotulo: 'Nome na tela', tipo: 'texto' },
  { campo: 'numero', rotulo: 'Número', tipo: 'texto', dica: 'o que a mão digita' },
  { campo: 'cargo', rotulo: 'Cargo', tipo: 'texto' },
  { campo: 'corPrimaria', rotulo: 'Cor primária', ...COR },
  { campo: 'corSecundaria', rotulo: 'Cor secundária', ...COR },
  { campo: 'corTexto', rotulo: 'Cor do texto', ...COR },
  { campo: 'ordem', rotulo: 'Ordem', tipo: 'numero', min: 0, max: 99 },
  {
    campo: 'multiplicador',
    rotulo: 'Multiplicador',
    tipo: 'numero',
    min: 1,
    max: 100,
    dica: 'quantos pontos cada voto vale',
  },
  { campo: 'ativo', rotulo: 'Ativa', tipo: 'booleano' },
  { campo: 'candidato.nome', rotulo: 'Candidato', tipo: 'texto' },
  { campo: 'candidato.partido', rotulo: 'Partido', tipo: 'texto' },
  {
    campo: 'candidato.foto',
    rotulo: 'Retrato',
    tipo: 'texto',
    largo: true,
    dica: 'caminho dentro de fotos/, por exemplo ana.jpg',
  },
];

const CAMPOS_DO_PRESENTE = [
  { campo: 'nome', rotulo: 'Nome do presente', tipo: 'texto' },
  { campo: 'giftId', rotulo: 'ID no TikTok', tipo: 'texto', dica: 'o número que o presente tem' },
];

export const ABAS = [
  {
    id: 'urnas',
    rotulo: 'Urnas',
    ajuda: 'A identidade de cada urna. A posição no palco é do desenho, não daqui.',
    campos: (cfg) => Object.keys(cfg?.urnas ?? {})
      .map((id) => ({
        grupo: { titulo: cfg.urnas[id]?.nome ?? id, chave: `urnas.${id}`, id },
        campos: CAMPOS_DA_URNA.map((c) => ({ ...c, caminho: `urnas.${id}.${c.campo}` })),
      })),
  },
  {
    id: 'presentes',
    rotulo: 'Presentes',
    ajuda: 'Cada presente e a urna que ele alimenta. Presente sem urna não conta voto.',
    campos: (cfg) => (cfg?.presentes ?? []).map((p, i) => {
      const urnas = Object.entries(cfg?.urnas ?? {})
        .map(([id, u]) => ({ valor: id, rotulo: u?.nome ?? id }));
      const base = `presentes.${i}`;
      return {
        grupo: { titulo: p?.nome ?? p?.id ?? `presente ${i + 1}`, chave: base, id: p?.id },
        // O `id` é a identidade do presente e não é editável aqui: é por ele
        // que o log e o banco o chamam, e trocá-lo renomearia votos que já
        // aconteceram. Ele viaja escondido, no patch, para o registro sobreviver
        // ao salvamento — o `normalizar` recusa presente sem id.
        oculto: [{ caminho: `${base}.id`, valor: p?.id ?? '' }],
        campos: [
          ...CAMPOS_DO_PRESENTE.map((c) => ({ ...c, caminho: `${base}.${c.campo}` })),
          {
            caminho: `${base}.urnaId`,
            rotulo: 'Urna de destino',
            tipo: 'selecao',
            opcoes: [{ valor: '', rotulo: '— não conta —' }, ...urnas],
          },
          { caminho: `${base}.votos`, rotulo: 'Votos por presente', tipo: 'numero', min: 0, max: 999 },
          { caminho: `${base}.moedas`, rotulo: 'Moedas', tipo: 'numero', min: 0, max: 99999 },
          { caminho: `${base}.prioridade`, rotulo: 'Prioridade na fila', tipo: 'numero', min: 0, max: 100 },
          {
            caminho: `${base}.cooldownMs`,
            rotulo: 'Espera entre iguais (ms)',
            tipo: 'numero',
            min: 0,
            max: 600000,
          },
          { caminho: `${base}.efeito`, rotulo: 'Efeito visual', tipo: 'texto' },
          { caminho: `${base}.ativo`, rotulo: 'Ativo', tipo: 'booleano' },
        ],
      };
    }),
  },
  {
    id: 'rodada',
    rotulo: 'Rodada',
    ajuda: 'Quanto tempo a rodada dura e como ela fecha. O relógio é o do servidor.',
    campos: () => [{
      grupo: { titulo: 'Tempo e fechamento', chave: 'rodada' },
      campos: [
        {
          caminho: 'rodada.duracaoSegundos',
          rotulo: 'Duração da rodada (segundos)',
          tipo: 'numero',
          min: 5,
          max: 86400,
          dica: 'quanto tempo o público tem para votar',
        },
        {
          caminho: 'rodada.politica',
          rotulo: 'Política de fechamento',
          tipo: 'selecao',
          opcoes: [
            { valor: 'processar-recebidos', rotulo: 'Processar o que chegou' },
            { valor: 'descartar-atrasados', rotulo: 'Descartar atrasados' },
          ],
        },
        {
          caminho: 'rodada.toleranciaMs',
          rotulo: 'Tolerância (ms)',
          tipo: 'numero',
          min: 0,
          max: 60000,
          dica: 'a janela em que um voto atrasado ainda vale',
        },
      ],
    }],
  },
  {
    id: 'animacao',
    rotulo: 'Animação',
    ajuda: 'A velocidade da mão. O resto da fila é do motor, não da configuração.',
    campos: () => [{
      grupo: { titulo: 'Ritmo', chave: 'animacao' },
      campos: [{
        caminho: 'animacao.velocidade',
        rotulo: 'Velocidade',
        tipo: 'numero',
        min: 0.25,
        max: 8,
        passo: 0.25,
        dica: '1x é o ritmo de uma pessoa digitando',
      }],
    }],
  },
  {
    id: 'teste',
    rotulo: 'Teste',
    ajuda: 'Dispara presente sem esperar a live. O que sai daqui é igual ao que vem do TikTok.',
    // Aba de BOTÃO, não de campo: disparar não é editar configuração, e um
    // botão que salvasse junto mudaria a live por causa de um teste.
    acoes: true,
    campos: () => [],
  },
  {
    id: 'integracao',
    rotulo: 'Integração',
    ajuda: 'De onde vêm os presentes. Em simulador, quem presenteia é esta aba.',
    campos: () => [{
      grupo: { titulo: 'Fonte dos eventos', chave: 'integracao' },
      campos: [
        {
          caminho: 'integracao.modo',
          rotulo: 'Modo',
          tipo: 'selecao',
          opcoes: [
            { valor: 'simulador', rotulo: 'Simulador (teste)' },
            { valor: 'tiktok', rotulo: 'TikTok ao vivo' },
          ],
        },
        {
          caminho: 'integracao.usuario',
          rotulo: 'Usuário da live',
          tipo: 'texto',
          dica: 'sem o @',
        },
      ],
    }],
  },
  {
    id: 'textos',
    rotulo: 'Textos',
    ajuda: 'As frases da tela. {urna} é trocado pelo nome da urna.',
    campos: () => [{
      grupo: { titulo: 'Mensagens do placar', chave: 'placar' },
      campos: [
        {
          caminho: 'placar.mensagemLideranca',
          rotulo: 'Quando alguém assume a liderança',
          tipo: 'texto',
          largo: true,
        },
        { caminho: 'placar.mensagemVitoria', rotulo: 'Quando alguém vence', tipo: 'texto', largo: true },
        { caminho: 'placar.mensagemEmpate', rotulo: 'Quando dá empate', tipo: 'texto', largo: true },
      ],
    }],
  },
];

/** A aba com este id, ou `undefined`. */
export function acharAba(id) {
  return ABAS.find((a) => a.id === id);
}

/**
 * Os grupos de campos de uma aba, já com os caminhos montados.
 *
 * Devolve `[]` para uma aba sem campos — a de Teste é feita de botões —, e
 * `[]` também para um id desconhecido: o painel abrir numa aba vazia é melhor
 * do que não abrir, e quem decide o que mostrar é a lista de abas.
 */
export function gruposDaAba(id, cfg) {
  const aba = acharAba(id);
  if (!aba) return [];
  return aba.campos(cfg) ?? [];
}

/** Todos os campos de uma aba, achatados, com os ocultos junto. */
export function camposDaAba(id, cfg) {
  const grupos = gruposDaAba(id, cfg);
  return grupos.flatMap((g) => [...(g.oculto ?? []).map((o) => ({ ...o, tipo: 'escondido' })), ...(g.campos ?? [])]);
}
