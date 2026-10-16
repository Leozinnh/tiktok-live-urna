/*
 * As quatro abas do painel, declaradas como dado.
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
 * ERAM SETE, e em 2026-10-15 o Leonardo cortou três: Presentes, Animação e
 * Textos. Palavras dele: *"o admin as opcoes 'animacoes', 'presentes',
 * 'textos' sao inuteis!"*. Ele edita essas três direto no `config/local.json`
 * e não quer a tela no meio — e uma aba que o dono não usa é pior do que aba
 * nenhuma, porque ela é a que envelhece sem ninguém notar.
 *
 * O que saiu foi a TELA, e não o recurso: `animacao.velocidade`,
 * `placar.mensagem*`, `narracao.*` e `presentes.*` continuam no arquivo,
 * continuam no `normalizar` e continuam valendo. `tests/admin-abas.test.js`
 * prende as duas metades disso — as abas não voltam, e as chaves não somem.
 *
 * Com a aba de Animação foi embora também o único controle de `anim.speed` do
 * painel: a velocidade da mão agora é do arquivo, e mudá-la pede reiniciar o
 * servidor. Era o preço de tirar a aba, e é o que "deixe fixo" quer dizer.
 *
 * `campos` é função, e não lista, por causa das abas que crescem com a
 * configuração: a de urnas tem um cartão por urna cadastrada, e a de testes
 * tem um botão por presente. Uma lista fixa mentiria no dia em que o
 * operador cadastrasse a terceira urna.
 */

const COR = { tipo: 'cor' };

const CAMPOS_DA_URNA = [
  { campo: 'nome', rotulo: 'Nome na tela', tipo: 'texto' },
  /*
   * O apelido é para a VOZ, e não para a tela: o palco diz "Lula", e o
   * narrador diz "Lulinha ganhou um voto". Vazio, a fala usa o nome da urna —
   * é por isso que este campo pode ficar em branco sem quebrar nada.
   */
  {
    campo: 'apelido',
    rotulo: 'Apelido na fala',
    tipo: 'texto',
    dica: 'como o narrador chama o candidato; em branco, usa o nome',
  },
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
  // Vinte, e não um: o narrador só fala de curtida quando ela vira GESTO —
  // vinte toques em três segundos, o mesmo número do `tiktok-live-horse`. Um
  // botão abaixo disso sairia mudo, e o silêncio do botão de teste é
  // indistinguível de uma voz quebrada.
  //
  // O número está ESCRITO aqui em vez de importado do servidor porque este
  // arquivo roda no navegador, e o `narracao.js` é do servidor. Quem impede os
  // dois de se separarem é `tests/servidor-hub.test.js`, que compara este
  // campo com o limiar de verdade: subir o limiar sem subir o botão deixa o
  // teste vermelho.
  { tipo: 'curtida', rotulo: 'Curtiu', quantidade: 20 },
  { tipo: 'entrada', rotulo: 'Entrou', quantidade: 1 },
  { tipo: 'compartilhou', rotulo: 'Compartilhou', quantidade: 1 },
  { tipo: 'assinatura', rotulo: 'Assinou', quantidade: 1 },
]);

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
