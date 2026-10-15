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

/**
 * Os motores de voz, na ordem em que o painel os oferece.
 *
 * Esta lista é do PAINEL, e a de verdade é a do `server/voz.js` — pelo mesmo
 * motivo de `ACOES_SOCIAIS`. Importar a do servidor aqui seria mais direto e
 * não funciona: o navegador carregaria junto o `node:child_process` que o
 * `voz.js` importa, e o painel inteiro deixaria de abrir. Os dois lados
 * discordando é o defeito que `tests/admin-abas.test.js` prende.
 *
 * O rótulo diz o que decide na hora de escolher — como soa e do que depende —,
 * e não o nome técnico, que não diz nada a quem nunca mexeu num sintetizador.
 */
export const MOTORES_DA_VOZ = Object.freeze([
  { valor: 'edge', rotulo: 'Neural (soa como gente; precisa de internet)' },
  { valor: 'sapi', rotulo: 'Do Windows (funciona sem internet; voz robótica)' },
]);

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

/**
 * Os avisos sociais, na ordem em que o painel os oferece para teste.
 *
 * Esta lista é do PAINEL, e a lista de verdade é a do servidor — os dois
 * discordando é o defeito que `tests/admin-abas.test.js` prende: um tipo
 * social que nascesse lá sem botão aqui seria uma fala que ninguém consegue
 * testar antes da live.
 *
 * O rótulo diz o que aconteceu, e não o nome técnico do tipo: quem opera isto
 * no meio de uma transmissão não tem tempo de traduzir `compartilhou`.
 */
export const ACOES_SOCIAIS = Object.freeze([
  { tipo: 'seguidor', rotulo: 'Seguiu', quantidade: 1 },
  // Cinco, e não um: o narrador só fala de curtida quando ela vira GESTO —
  // cinco toques em três segundos. Um botão de um toque só sairia mudo, e o
  // silêncio do botão de teste é indistinguível de uma voz quebrada.
  // `tests/servidor-hub.test.js` compara este número com o limiar do servidor.
  { tipo: 'curtida', rotulo: 'Curtiu', quantidade: 5 },
  { tipo: 'entrada', rotulo: 'Entrou', quantidade: 1 },
  { tipo: 'compartilhou', rotulo: 'Compartilhou', quantidade: 1 },
  { tipo: 'assinatura', rotulo: 'Assinou', quantidade: 1 },
]);

/** O que cada tipo de fala quer dizer, para o rótulo da caixa de texto. */
const ROTULO_DA_FALA = Object.freeze({
  seguidor: 'Quando alguém segue',
  curtida: 'Quando alguém curte',
  entrada: 'Quando alguém entra',
  compartilhou: 'Quando alguém compartilha',
  assinatura: 'Quando alguém assina',
  // A única que não responde a um evento, e sim a um SILÊNCIO: o presente
  // chegou, não achou urna, e a pessoa não escreveu o número. O rótulo diz
  // isso, porque "quando alguém manda presente e não escreve o número" é a
  // situação inteira, e "espera" não é nada.
  espera: 'Quando alguém manda presente e não escreve o número',
});

/**
 * Um `giftId` que não está em nenhum mapeamento — o presente órfão do teste.
 *
 * O botão de teste precisa de um presente DESCONHECIDO: é ele que abre a
 * espera pelo número. Um id que estivesse cadastrado contaria o voto na hora,
 * e o botão estaria testando o caminho de sempre enquanto o Leonardo conclui
 * que o caminho do chat funciona.
 *
 * O 9999 é o chute inicial, e não uma promessa: se ele estiver cadastrado, o
 * número sobe até achar um livre. Um id fixo viraria um falso positivo no dia
 * em que ele cadastrasse justamente esse.
 */
export function giftIdSemUrna(presentes = []) {
  const usados = new Set((presentes ?? []).map((p) => String(p?.giftId ?? '')));
  let n = 9999;
  while (usados.has(String(n))) n++;
  return String(n);
}

/**
 * O número que o campo do chat abre preenchido.
 *
 * A primeira urna cadastrada, que é a resposta na imensa maioria dos testes:
 * o operador aperta o botão e vê o voto acontecer. Um campo vazio faria o
 * botão não fazer nada, e um botão que não faz nada é indistinguível de um
 * caminho quebrado.
 */
export function numeroDeTeste(urnas = {}) {
  const primeira = Object.values(urnas ?? {})[0];
  return String(primeira?.numero ?? '').trim();
}

/*
 * As frases de cada tipo, uma caixa por tipo.
 *
 * A caixa é uma LISTA — uma frase por linha —, e não um texto corrido: são
 * frases alternadas, sorteadas sem repetir, e é a lista que carrega essa
 * alternância. Escritas numa linha só, elas virariam uma fala comprida que
 * ninguém quer ouvir.
 */
const CAMPOS_DA_NARRACAO = [
  {
    caminho: 'narracao.ativa',
    rotulo: 'Narração ligada',
    tipo: 'booleano',
    dica: 'desligada, a faixa continua aparecendo — só o som para',
  },
  {
    caminho: 'narracao.motor',
    rotulo: 'Motor da voz',
    tipo: 'selecao',
    // Um motor que o painel oferecesse sem o servidor conhecer seria salvo,
    // mostrado como escolhido, e ignorado — a voz continuaria a mesma e nada na
    // tela explicaria por quê. `tests/admin-abas.test.js` prende as duas listas.
    opcoes: [...MOTORES_DA_VOZ],
  },
  {
    caminho: 'narracao.voz',
    rotulo: 'Voz',
    tipo: 'texto',
    largo: true,
    // O nome da voz depende do motor: a neural se chama
    // "pt-BR-FranciscaNeural", a do Windows é "Microsoft Maria Desktop". Uma
    // dica que falasse de uma só mandaria o Leonardo procurar no lugar errado.
    dica: 'vazio escolhe a voz padrão do motor; no edge: pt-BR-FranciscaNeural',
  },
  {
    caminho: 'narracao.velocidade',
    rotulo: 'Velocidade da voz',
    tipo: 'numero',
    min: -10,
    max: 10,
    passo: 1,
    dica: '0 é o ritmo normal; negativo é mais devagar',
  },
  {
    caminho: 'narracao.volume',
    rotulo: 'Volume',
    tipo: 'numero',
    min: 0,
    max: 1,
    passo: 0.05,
    dica: 'de 0 a 1; 0 é mudo, 1 é o volume cheio do arquivo',
  },
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
        /*
         * AQUI FICAVAM "Política de fechamento" e "Tolerância (ms)".
         *
         * Os dois saíram porque o servidor não os honra, e essa é a regra
         * deste arquivo. A política oferecia "processar-recebidos" e
         * "descartar-atrasados" — e o servidor conhece três, das quais
         * "descartar-atrasados" NÃO é uma (`POLITICAS_DE_ENCERRAMENTO` traz
         * "corte-exato" e "tolerancia-2s" no lugar). Escolhê-la era o defeito
         * exato que este painel existe para não ter: a tela dizia "salvo", o
         * `normalizar` avisava baixinho, e a rodada continuava fechando igual.
         *
         * Pior: das três que ele ACEITA, só "processar-recebidos" é HONRADA —
         * o `fecharRodada` do `tally.js` processa o que chegou e não consulta
         * a política em lugar nenhum. E a tolerância é o mesmo recurso pelo
         * mesmo motivo: uma janela de milissegundos só quer dizer alguma coisa
         * junto de uma política que olhe o relógio do evento.
         *
         * Os dois voltam na etapa que implementar as três políticas da seção
         * 6.3 da spec — e voltam puxando a lista de `POLITICAS_DE_ENCERRAMENTO`,
         * que é do servidor, em vez de uma lista escrita aqui, que foi como
         * "descartar-atrasados" nasceu.
         *
         * `tests/admin-abas.test.js` prende isso: o campo não pode reaparecer
         * antes de o servidor honrá-lo.
         */
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
        {
          caminho: 'integracao.esperaNumeroSegundos',
          rotulo: 'Esperar o número no chat',
          tipo: 'numero',
          min: 1,
          max: 600,
          passo: 1,
          dica: 'segundos; passando disso, a voz cobra o número de quem mandou o presente',
        },
      ],
    }],
  },
  {
    id: 'textos',
    rotulo: 'Textos',
    ajuda: 'As frases da tela e as da voz. {urna} é a urna, {nome} é quem chegou.',
    campos: (cfg) => {
      /*
       * Os tipos de fala vêm da CONFIGURAÇÃO, e não de uma lista escrita
       * aqui. É a mesma decisão da aba de presentes: um tipo novo que nasça
       * no servidor aparece sozinho, em vez de virar uma frase que só se
       * editaria no arquivo.
       *
       * E vem do `cfg` de verdade, que o servidor sempre manda completo — o
       * `normalizar` preenche os cinco tipos mesmo quando o arquivo do
       * Leonardo não tem nenhum.
       */
      const tipos = Object.keys(cfg?.narracao?.falas ?? {});
      return [{
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
      }, {
        grupo: { titulo: 'Narração', chave: 'narracao' },
        campos: [
          ...CAMPOS_DA_NARRACAO,
          ...tipos.map((tipo) => ({
            caminho: `narracao.falas.${tipo}`,
            rotulo: ROTULO_DA_FALA[tipo] ?? tipo,
            tipo: 'lista',
            largo: true,
            dica: tipo === 'curtida'
              ? 'uma frase por linha; {nome} e {quantidade} são trocados'
              : 'uma frase por linha; {nome} é trocado pelo apelido',
          })),
        ],
      }];
    },
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
