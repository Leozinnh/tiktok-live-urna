/**
 * Quem fala o que, e quando fica quieto.
 *
 * Este módulo decide UMA coisa: dado um evento social, sai fala ou sai
 * silêncio. Ele não sintetiza som, não toca nada e não conhece nem o
 * navegador nem o PowerShell — é puro de propósito, porque é aqui que moram
 * as regras que ninguém consegue conferir de ouvido no meio de uma live.
 *
 * A parte difícil não é falar: é CALAR. Numa live movimentada chegam dezenas
 * de entradas por minuto, o TikTok repete a entrada de quem sai e volta, e a
 * rede reentrega o mesmo evento quando a conexão oscila. Um narrador que fala
 * tudo o que chega vira uma metralhadora de nomes que ninguém entende — e o
 * que era para dar boas-vindas passa a atrapalhar. Daí o cooldown por pessoa,
 * a janela da curtida, e o sorteio sem repetição.
 */

/**
 * As frases que valem quando o painel não tem nenhuma.
 *
 * Elas existem no código, e não só na configuração, para o narrador nunca
 * nascer mudo: uma configuração recém-criada não tem frase nenhuma escrita, e
 * sem isto o Leonardo teria que inventar todas antes de ouvir a primeira.
 *
 * Mais de uma por tipo porque a alternância é o que impede a live de soar
 * automática — e quanto mais frases a lista tem, mais longe a live vai antes
 * de qualquer uma repetir. Os marcadores são cinco: `{nome}`, `{quantidade}`,
 * `{presente}`, `{urna}` e `{vezes}`. Só a curtida usa `{quantidade}`, que é
 * uma contagem; nas outras listas o número é o do combo do presente, que chega
 * em `{vezes}` já pronto.
 *
 * As quatro listas de evento social — `entrada`, `seguidor`, `curtida` e
 * `presente` — foram ampliadas com as do `tiktok-live-horse`, que é a mesma
 * plateia e o mesmo narrador. Lá as frases são sobre a prova de turfe; aqui o
 * assunto é voto. O que não sobreviveu à troca está explicado antes de cada
 * lista.
 *
 * Duas coisas que NENHUMA frase faz, e são de propósito:
 *
 *   - **artigo antes de `{nome}` ou de `{urna}`.** Nada de "pro {nome}", "do
 *     {nome}", "o {nome}" nem "a {urna}". Os dois são gente de nome próprio, e
 *     o artigo sai certo para metade delas e errado para a outra metade — o
 *     "pro Ana" que a live inteira ouve. Onde o turfe escrevia "pro {cavalo}",
 *     aqui é "pra {nome}"; onde escrevia "do {nome}", é "de {nome}", que serve
 *     para os dois;
 *   - **"1x".** O `{vezes}` vazio no presente único é o que faz a frase sair
 *     "mandou Rosa" em vez de "mandou 1x Rosa", que não é como uma pessoa fala.
 */
export const FALAS_PADRAO = Object.freeze({
  /*
   * Quem passou a seguir a live.
   *
   * As frases novas vieram da lista de seguidor do `tiktok-live-horse`, quase
   * todas inteiras — seguir é seguir nas duas lives. Ficaram de fora as que
   * tratavam a plateia como público de turfe e as que elogiavam o seguidor por
   * não perder prova: são cenário do hipódromo, e trocar uma palavra ali
   * deixaria um remendo no lugar de uma frase.
   */
  seguidor: Object.freeze([
    'Mais um seguidor! Valeu, {nome}!',
    '{nome} acabou de seguir! Bem-vindo à família!',
    'Seguidor novo na área: {nome}!',
    'Obrigado por seguir, {nome}!',
    'Mais um seguidor na família! Muito obrigado, {nome}!',
    'Seguiu a live! Seja muito bem-vindo, {nome}! Tamo junto!',
    'Olha aí, {nome} começou a seguir a live! Valeu demais!',
    'Gratidão por seguir, {nome}!',
    'A família cresceu! Valeu pelo follow, {nome}!',
    'Aeee! {nome} seguiu a live! Seja bem-vindo à família!',
    'Follow novo na área! Obrigado, {nome}!',
    'Uhuu! {nome} entrou pra família! Gratidão pelo follow!',
    'É isso! {nome} seguiu a live! Seja muito bem-vindo!',
    'Olha o follow! {nome} agora é da família! Valeu demais!',
    'Boa, {nome}! Seguiu a live! Obrigado!',
    'Que alegria, {nome}! Obrigado por seguir a live!',
    'Muito obrigado por seguir, {nome}! Aqui você sempre tem lugar!',
    '{nome}, gratidão por fazer parte da família! Valeu pelo follow!',
    'Que carinho seguir a live, {nome}! Seja muito bem-vindo!',
    'Você é parte da família agora, {nome}! Obrigado pelo follow!',
    'Que bom ter você por aqui, {nome}! Valeu por seguir!',
    'Obrigado pela confiança, {nome}! Seguiu e já é da família!',
    '{nome}, fica à vontade! Obrigado por seguir a live!',
    'Alô, alô! {nome} apertou o botão de seguir! Valeu!',
    '{nome} deu o follow e a live agradece! Bem-vindo!',
    'Seguiu, entrou! Agora {nome} é da família! Obrigado!',
    'Chama a banda! {nome} seguiu a live! Valeu demais!',
    'Valeu por seguir, {nome}!',
    'Seguiu! Obrigado, {nome}!',
    'Bem-vindo à família, {nome}!',
    'Follow de {nome}! Gratidão!',
    'Obrigado pelo follow, {nome}!',
  ]),
  /*
   * A rajada de curtidas — o gesto, e não o toque (ver `LIMIAR_CURTIDA`).
   *
   * As frases novas vieram da lista de curtidas do `tiktok-live-horse`, quase
   * todas inteiras. Só duas mexidas: a que elogiava a velocidade do dedo
   * comparando com o turfe saiu, e a que dizia "mais de vinte curtidas" virou
   * `{quantidade}` — vinte é o limiar de HOJE, e uma frase que decorasse o
   * número mentiria no dia em que ele mudasse (e já mentiria na rajada de
   * exatamente vinte).
   */
  curtida: Object.freeze([
    '{nome} mandou {quantidade} curtidas!',
    'Valeu pelas {quantidade} curtidas, {nome}!',
    '{quantidade} curtidas de uma vez, {nome}! Isso é apoio!',
    'Valeu pelas {quantidade} curtidas, {nome}! O dedo tá voando!',
    'Olha a chuva de curtidas de {nome}! Muito obrigado pelo carinho!',
    '{quantidade} curtidas na tela! {nome} tá fortalecendo a live!',
    'Metralhadora de curtidas de {nome}! Gratidão demais, família!',
    'Que rajada de curtidas! Valeu, {nome}! O dedo não para!',
    'Explodiu de curtida! {nome} tá com tudo! Muito obrigado!',
    'Chuva de coração! {nome} mandou {quantidade} curtidas! Valeu demais!',
    'Olha o carinho! {nome} mandou {quantidade} curtidas de uma vez!',
    'É curtida que não acaba! Valeu, {nome}! Gratidão total!',
    'Que dedo rápido! {nome} mandou {quantidade} curtidas! Obrigado!',
    'A tela encheu de coração! Valeu pelas curtidas, {nome}!',
    '{nome} mandou ver nas curtidas! Muito obrigado, família!',
    'Que carinho, {nome}! Obrigado por tantas curtidas!',
    'Muito obrigado pelas curtidas, {nome}! Isso ajuda demais a live!',
    '{nome}, gratidão por cada curtida! Você é demais!',
    'Que apoio lindo, {nome}! Valeu pelas {quantidade} curtidas!',
    'Cada curtida conta! Obrigado, {nome}!',
    'Obrigado por fortalecer a live, {nome}! Que chuva de curtidas!',
    'Isso aquece o coração! Valeu pelas curtidas, {nome}!',
    '{nome}, seu carinho chegou! Valeu pelas curtidas, família!',
    'Tá com o dedo de ouro, {nome}! {quantidade} curtidas! Valeu!',
    'O dedo de {nome} tá pegando fogo! Muito obrigado pelas curtidas!',
    'Cuidado, {nome}! Assim a tela quebra de tanta curtida! Valeu!',
    'Tapete vermelho pra {nome}! Mandou {quantidade} curtidas de uma vez!',
    'Alô, alô! {nome} tá curtindo sem parar! Gratidão!',
    '{nome} treinou o dedo! Valeu pelas curtidas, família!',
    'Aplausos pra {nome}! Que rajada de curtidas! Obrigado!',
    'Valeu pelas curtidas, {nome}!',
    'Que rajada de curtidas, {nome}! Obrigado!',
    '{nome} mandou {quantidade} curtidas! Valeu!',
    'Gratidão, {nome}! Chuva de curtidas!',
    'Show, {nome}! Obrigado pelas curtidas!',
  ]),
  /*
   * A chegada. As três primeiras são as deste projeto; as demais vieram da
   * lista de boas-vindas do `tiktok-live-horse`.
   *
   * Metade da lista de lá só existia por causa do turfe — a chegada no
   * hipódromo, o lugar cativo na plateia, a torcida que crescia —, e essas
   * ficaram de fora inteiras: trocar uma palavra deixaria um remendo no lugar
   * de uma frase, e o que se ganharia era uma linha morna a mais. A exceção
   * são as que tinham o turfe como apêndice: onde cortar o pedaço deixava a
   * ideia de pé ("Bem-vindo à família", "Fica com a gente"), a frase veio
   * cortada, sem uma palavra nova no lugar.
   *
   * A outra seção descartada é a do convite para escolher o animal da prova
   * comentando um número de um a oito: aqui o comentário não escolhe nada, e o
   * convite certo é mandar presente — esse sim conta voto.
   */
  entrada: Object.freeze([
    'Bem-vindo, {nome}!',
    'Olha {nome} chegando!',
    'Fala, {nome}! Chegou na hora certa.',
    'Olha quem chegou! {nome}, seja bem-vindo à live!',
    'Chegou mais um torcedor! Bem-vindo, {nome}!',
    'Aeee! {nome} chegou! Bem-vindo à família!',
    'Família crescendo! {nome} chegou! Seja bem-vindo!',
    'Uhuu! Olha {nome} aqui! Bem-vindo!',
    'Que bom te ver, {nome}! Seja bem-vindo à live!',
    'Chegou {nome}! Bem-vindo, família!',
    '{nome} entrou na live! Bem-vindo!',
    'A live ficou melhor! {nome} chegou! Bem-vindo!',
    'Bem-vindo, {nome}! Comenta e vibra com a gente!',
    'Olha ele aí! {nome}, seja bem-vindo!',
    'Tá começando a festa! {nome} chegou! Bem-vindo!',
    '{nome} chegou na hora certa! Bem-vindo!',
    'Eita, chegou gente boa! Bem-vindo, {nome}!',
    'Que alegria te receber, {nome}! Fica à vontade!',
    'Bem-vindo, {nome}! Aqui todo mundo é família!',
    'Oi, {nome}! Que bom que você chegou! Bem-vindo!',
    '{nome}, a live ficou mais bonita com você! Bem-vindo!',
    'Obrigado por vir, {nome}! Fica com a gente!',
    'Que bom ter você aqui, {nome}! Bem-vindo, de coração!',
    'Bem-vindo, {nome}! Manda um presente!',
    'Chama a banda! {nome} chegou! Bem-vindo!',
    'Abram alas pra {nome}! Bem-vindo à live, família!',
    'Entrada triunfal de {nome}! Seja bem-vindo à live!',
    'Quem chegou? Foi {nome}! Bem-vindo!',
    'Oi, {nome}! Bem-vindo à live!',
    'Seja bem-vindo, {nome}!',
    'Salve, {nome}! Bem-vindo, família!',
    '{nome} na live! Bem-vindo!',
    'Boa, {nome}! Bem-vindo e boa sorte!',
  ]),
  compartilhou: Object.freeze([
    '{nome} compartilhou a live! Valeu demais!',
    'A live chegou mais longe: {nome} compartilhou!',
    '{nome} mandou a live pra galera! Isso ajuda demais!',
    'Olha a força: {nome} compartilhou a live!',
    'Compartilhou! {nome} tá trazendo gente nova pra cá!',
    'Valeu, {nome}! A live agora tá na mão de mais gente!',
    '{nome} espalhou a live! Chega mais gente pra votar!',
    'Isso, {nome}! Compartilhar é o que traz a galera!',
    'A live circulou! Obrigado, {nome}!',
    '{nome} chamou o pessoal! Bem-vindos, todo mundo!',
  ]),
  assinatura: Object.freeze([
    '{nome} virou assinante! Que isso!',
    'Assinante novo: {nome}! Muito obrigado!',
    'Olha {nome} apoiando de verdade! Virou assinante!',
    '{nome} assinou a live! Gratidão, família!',
    'Assinatura nova na área: {nome}! Valeu demais!',
    'Que presente pra live: {nome} virou assinante!',
    '{nome} tá junto de verdade agora! Assinante novo!',
    'Obrigado por assinar, {nome}! Isso sustenta a live!',
    '{nome} entrou pra lista de assinantes! Que honra!',
    'Assinante na casa: {nome}! Muito obrigado pelo apoio!',
  ]),
  /*
   * O PRESENTE, que é o evento que mais importa aqui.
   *
   * Ele é o único que conta voto — a pessoa gastou moeda e a urna recebeu —, e
   * até esta versão ele não era falado: a tela animava a mão digitando e a voz
   * ficava quieta, que é o silêncio mais estranho possível para quem acabou de
   * pagar por ele.
   *
   * `{vezes}` é "5x " quando o presente veio em combo, e vazio quando veio um
   * só — "1x Rosa" não existe na língua falada, é "mandou Rosa". A convenção é
   * a mesma do `tiktok-live-horse`, de onde estas frases vieram.
   *
   * `{urna}` é o nome de quem recebeu o voto. Ele aparece porque é o que a
   * pessoa quer ouvir de volta: o presente dela fez diferença PARA ALGUÉM.
   * Nenhuma frase põe artigo antes dele: as urnas deste projeto são gente, e
   * "a {urna} agradece" sairia errado para metade dos nomes.
   *
   * A lista foi ampliada com as do `tiktok-live-horse`, e a troca é sempre a
   * mesma: onde lá a frase apontava para o corredor, aqui ela aponta para a
   * urna, sem artigo na frente; o combo, que lá chegava em `{quantidade}`,
   * chega aqui em `{vezes}`; e o resto da frase veio palavra por palavra.
   *
   * O que só existia por causa da prova — arrancada, velocidade, spa, o
   * corredor ganhando asas ou massagem — ficou de fora, e sem substituto: uma
   * frase inventada para preencher cota soa pior do que a lista menor.
   */
  presente: Object.freeze([
    'Olha o presente! {nome} mandou {vezes}{presente}!',
    '{nome} mandou {vezes}{presente}! Valeu, família!',
    'Presente na área! {nome} mandou {vezes}{presente}!',
    '{nome} mandou {vezes}{presente} pra {urna}! Valeu demais!',
    'Que presente! {nome} mandou {vezes}{presente} pra {urna}!',
    'É presente! {nome} mandou {vezes}{presente}!',
    'Uhuu! {nome} mandou {vezes}{presente} pra {urna}!',
    '{nome} mandou {vezes}{presente}! {urna} agradece!',
    'Gratidão, {nome}! {vezes}{presente} pra {urna}!',
    'Olha a força! {nome} mandou {vezes}{presente} pra {urna}!',
    '{nome} mandou {vezes}{presente}! Isso é apoio de verdade!',
    'Presente pra {urna}! {nome} mandou {vezes}{presente}!',
    'Família, olha isso! {nome} mandou {vezes}{presente} pra {urna}!',
    '{nome} mandou {vezes}{presente}! Obrigado pelo apoio!',
    'Chegou presente! {nome} mandou {vezes}{presente} pra {urna}!',
    '{nome} mandou {vezes}{presente}! Chega mais, família!',
    'Aeee! {nome} mandou {vezes}{presente} pra {urna}!',
    '{nome} mandou {vezes}{presente}! A urna agradece o apoio!',
    'Olha o presente! {nome} mandou {vezes}{presente} pra {urna}!',
    'Aeee! {nome} mandou {vezes}{presente} pra {urna}! Valeu, família!',
    'Presente na área! {nome} mandou {vezes}{presente}! {urna} agradece!',
    'Que jogada! {nome} mandou {vezes}{presente} pra {urna}! Valeu demais!',
    'É presente! {nome} mandou {vezes}{presente} pra {urna}!',
    'Olha a força! {nome} mandou {vezes}{presente} pra {urna}! Obrigado!',
    'Forte! {nome} mandou {vezes}{presente} pra {urna}! Muito obrigado!',
    'Chegou chegando! {nome} mandou {vezes}{presente} pra {urna}!',
    'Uau! {nome} mandou {vezes}{presente}, família!',
    'Valeu, {nome}! {vezes}{presente} recebido!',
    'Que carinho! {nome} mandou {vezes}{presente}!',
    'Combustível novo! {nome} mandou {vezes}{presente} pra {urna}! Obrigado!',
    'Sentiu o empurrão? {nome} mandou {vezes}{presente} pra {urna}! Valeu!',
    'Que vento a favor! {nome} mandou {vezes}{presente}! {urna} agradece!',
    'Acelerou! {nome} mandou {vezes}{presente}! Não para mais!',
    'Haja coração! {nome} mandou {vezes}{presente} pra {urna}! Obrigadão!',
    'É emoção demais! {nome} mandou {vezes}{presente}!',
    'Isso é amor! {nome} mandou {vezes}{presente} pra {urna}! Valeu!',
    'Grita aí, família! {nome} mandou {vezes}{presente} pra {urna}!',
    'Que coração bonito, {nome}! {vezes}{presente} pra {urna}! Obrigado!',
    'Obrigado pelo carinho, {nome}! {vezes}{presente} pra {urna}!',
    'Você é demais, {nome}! {vezes}{presente} pra {urna}! Gratidão!',
    'Que gesto lindo! {nome} mandou {vezes}{presente} pra {urna}! Valeu!',
    'Família linda! {nome} mandou {vezes}{presente}! {urna} agradece!',
    'Isso aquece o coração! {nome} mandou {vezes}{presente} pra {urna}!',
    'De coração, {nome}! {vezes}{presente} pra {urna}! Muito obrigado!',
    'Alô, alô! {nome} mandou {vezes}{presente}!',
    '{nome} não veio brincar! {vezes}{presente} pra {urna}! Valeu!',
    'Tapete vermelho pra {nome}! Mandou {vezes}{presente} pra {urna}!',
    'Tá chovendo presente! {nome} mandou {vezes}{presente} pra {urna}!',
    'Dá-lhe, {nome}! {vezes}{presente} pra {urna}! Valeu demais!',
    'Cuidado, adversários! {nome} mandou {vezes}{presente} pra {urna}!',
    'Aplausos pra {nome}! {vezes}{presente} pra {urna}! Valeu, família!',
    'Valeu, {nome}! {vezes}{presente} pra {urna}!',
    'Obrigado, {nome}! {vezes}{presente}!',
    'Show, {nome}! {vezes}{presente} pra {urna}!',
    'Gratidão, {nome}! {vezes}{presente}!',
    'Boa, {nome}! {vezes}{presente} pra {urna}!',
    'Top, {nome}! {vezes}{presente}! {urna} agradece!',
    'Chegou {vezes}{presente} de {nome}!',
    'É isso, {nome}! {vezes}{presente} pra {urna}! Valeu!',
  ]),
  /*
   * A cobrança de quem mandou um presente que não está no painel.
   *
   * Ela não é um cumprimento: é a resposta a um SILÊNCIO. O presente chegou,
   * não achou urna, e o espectador ficou olhando para uma tela que não fez
   * nada — do lado dele, o presente caro simplesmente não funcionou. A fala
   * existe para transformar isso numa instrução que ele consegue seguir.
   *
   * Por isso a frase diz o que FAZER, e não o que faltou: "escreve o número
   * no chat" resolve; "este presente não está cadastrado" não resolve nada
   * para quem está do outro lado.
   */
  espera: Object.freeze([
    '{nome}, escreve o número da urna no chat!',
    '{nome}, faltou o número! Escreve no chat qual urna.',
    'Não entendi seu voto, {nome}! Escreve o número da urna no chat.',
    '{nome}, manda o número da urna no chat para o voto valer!',
  ]),
});

/**
 * Quanto tempo cada tipo fica quieto para a MESMA pessoa.
 *
 * Entrada e seguidor são os alvos dos eventos repetidos — o TikTok manda a
 * entrada de novo para quem sai e volta, e a reconexão reentrega o que já
 * tinha chegado. Um minuto é folgado para o caso real e curto o bastante para
 * quem voltou de verdade merecer o oi outra vez.
 */
const COOLDOWN_MS = Object.freeze({
  entrada: 60_000,
  seguidor: 60_000,
  compartilhou: 60_000,
  assinatura: 60_000,
  curtida: 60_000,
  /*
   * O do presente é CURTO — trinta segundos —, e é o único que não podia ser
   * um minuto.
   *
   * Ele não existe para calar o presente: existe para quem manda DEZ presentes
   * seguidos não virar dez falas e a fila inteira parar atrás dessa pessoa.
   * Trinta segundos é o meio-termo: o primeiro presente sempre fala, e quem
   * continua mandando é anunciado de novo antes de a live esquecer o nome
   * dele. Com um minuto, quem presenteia a cada quarenta segundos a noite
   * inteira teria METADE dos presentes falados — e é o evento que a pessoa
   * pagou para ver.
   */
  presente: 30_000,
  /*
   * O da cobrança é CURTO, e de propósito: ele não protege contra repetição —
   * quem protege é a própria espera, que só vence uma vez por presente. Ele
   * está aqui só para um caso patológico, o de alguém mandando presentes
   * órfãos em sequência rápida e sem escrever nada. Com um minuto, a segunda
   * cobrança legítima da noite ficaria muda; quinze segundos é o mesmo prazo
   * da janela, e nunca cala uma cobrança que ainda faz sentido.
   */
  espera: 15_000,
});

/**
 * A curtida só vira fala quando vira GESTO.
 *
 * O TikTok manda um evento por toque. Falar cada um encheria a fila de
 * "valeu pela curtida" centenas de vezes, e o narrador ficaria minutos atrás
 * da live. Vinte toques são um gesto; uma curtida perdida no meio da noite
 * não é, e é a janela abaixo que separa os dois.
 *
 * Vinte, e não cinco, é o número do `tiktok-live-horse`: lá ele foi ajustado
 * ouvindo a live, e a cinco a fala saía em toda rajada pequena — o que soa
 * como o narrador comemorando qualquer coisa. Aqui ele é o mesmo por dois
 * motivos: é um número já testado no ar, e as duas lives são do mesmo dono,
 * com a mesma plateia.
 */
const LIMIAR_CURTIDA = 20;
const JANELA_CURTIDA_MS = 3_000;

/**
 * O limiar da curtida, para quem precisa MANDAR uma curtida que fale.
 *
 * Ele sai daqui por causa do botão de teste do painel: um botão de "curtiu"
 * que mandasse um toque só sairia mudo, porque um toque não é um gesto — e o
 * Leonardo apertaria, não ouviria nada, e concluiria que a voz está quebrada.
 * `tests/servidor-hub.test.js` compara os dois números, então o limiar e o
 * botão não podem se separar em silêncio.
 */
export const LIMIAR_DA_CURTIDA = LIMIAR_CURTIDA;

/*
 * O apelido do TikTok é escrito para ser LIDO, e não para ser falado.
 *
 * Ele vem com bandeira, coração, cifrão, caveirinha — e um sintetizador de voz
 * ou tenta ler aquilo (e sai "bandeira do Brasil" no meio do nome de quem
 * acabou de chegar) ou trava na pontuação. O nome tem que chegar na voz como
 * uma pessoa o diria.
 *
 * A limpeza é uma LISTA DO QUE FICA, e não do que sai: letra, número, espaço e
 * os três sinais que aparecem em nome de verdade (hífen, ponto, sublinhado,
 * apóstrofo). Uma lista do que sai — "tira emoji, tira cifrão, tira estrela" —
 * envelhece a cada emoji novo que o TikTok lança, e o dia em que ela falha é o
 * dia em que a voz lê um emoji no ar. `\p{L}` e `\p{N}` deixam passar acento,
 * cedilha e nome em outra escrita, que é o que interessa num nome brasileiro.
 *
 * Isto acontece ANTES de a frase ser montada, e vale para a tela também: a
 * faixa que o OBS captura mostra o mesmo texto que a voz fala. Duas versões do
 * mesmo nome — uma escrita e outra falada — divergiriam no dia em que alguém
 * mexesse numa só, e ninguém veria.
 */
const NAO_SE_FALA = /[^\p{L}\p{N}\s._'\-]/gu;

/** A parte que dá para falar de um nome, ou string vazia. */
function falavel(bruto) {
  return String(bruto ?? '')
    .replace(NAO_SE_FALA, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Nome TODO em maiúsculas vira nome, e não sigla.
 *
 * Voz neural com palavra curta em caixa alta tende a soletrar: "ANA" sai
 * "á-ene-á". Apelido de três letras em maiúscula é comuníssimo no TikTok, e o
 * efeito no ar é a voz lendo sigla em vez de chamar a pessoa.
 *
 * A regra é cirúrgica de propósito: só mexe em nome que não tem UMA letra
 * minúscula sequer. Um "João Pedro" com a caixa certa atravessa intacto,
 * porque o nome dele na tela é o nome dele — e o `.capitalize()` do narrador
 * do horse, aplicado a todo mundo, transformaria "João Pedro" em "João pedro".
 */
function emCaixaDeNome(texto) {
  return texto.replace(/(^|[\s\-])(\p{L})/gu, (_, antes, letra) => antes + letra.toUpperCase());
}

/**
 * O nome como a voz deve dizê-lo.
 *
 * A ordem dos degraus é a do narrador do horse, e cada um existe por um caso
 * real: o apelido é o nome que a pessoa escolheu; quando ele não sobra em nada
 * falável, o @ é o nome que aparece embaixo do presente e que ela reconhece; e
 * "Alguém" é o fim da linha, para quando nem um nem outro tem uma letra.
 */
export function nomeFalavel(nome, usuario = '') {
  const apelido = falavel(nome);
  const arroba = falavel(usuario);
  const quem = apelido || arroba;
  if (!quem) return 'Alguém';
  // `\p{Ll}` é "letra minúscula" em qualquer escrita — um nome em cirílico ou
  // em grego também tem caixa, e uma faixa `a-z` os trataria como se não
  // tivessem.
  return /\p{Ll}/u.test(quem) ? quem : emCaixaDeNome(quem.toLowerCase());
}

/**
 * Troca os marcadores pelos valores.
 *
 * `{nome}` em branco vira "Alguém" porque o apelido vem da rede e chega nulo
 * para conta sem nome definido — "Fala, !" na tela da live é o tipo de coisa
 * que ninguém vê no teste e todo mundo vê na transmissão.
 *
 * `usuario` é o @: ele só é consultado quando o apelido não tem nada que se
 * possa falar.
 *
 * `{vezes}` chega PRONTO de quem chama ("5x " ou vazio), e não é calculado
 * aqui: o mesmo `{quantidade}` quer dizer números diferentes em tipos
 * diferentes — "6 curtidas" é uma contagem, "5x Rosa" é um prefixo —, e
 * juntar os dois numa regra só faria uma das duas frases sair errada.
 */
export function preencher(modelo, {
  nome = '', usuario = '', quantidade = 0, presente = '', urna = '', vezes = '',
} = {}) {
  const quem = nomeFalavel(nome, usuario);
  return String(modelo ?? '')
    // `replaceAll`, e não `replace`: uma frase com `{nome}` duas vezes sairia
    // com o segundo marcador cru na tela.
    .replaceAll('{nome}', quem)
    .replaceAll('{quantidade}', String(quantidade))
    .replaceAll('{presente}', String(presente))
    .replaceAll('{urna}', String(urna))
    .replaceAll('{vezes}', String(vezes));
}

/**
 * @param {object|Function} opcoes.falas as frases do painel, por tipo — ou uma
 *   função que as devolve. A função existe porque o hub troca a configuração
 *   inteira a cada salvamento do painel: um narrador que guardasse a lista do
 *   dia em que nasceu continuaria falando as frases antigas até o servidor
 *   reiniciar, e ninguém descobriria por quê.
 * @param {Function} [opcoes.sorteio] 0..1; existe para o teste ser determinístico
 * @param {Function} [opcoes.agora]  o relógio, em ms; idem
 * @param {Function} [opcoes.aoNarrar] avisado com o texto já montado
 */
export function criarNarrador({ falas = {}, sorteio = Math.random, agora = Date.now, aoNarrar = null } = {}) {
  /** As frases que valem AGORA — o painel pode ter salvado desde a última fala. */
  const frasesDeAgora = () => (typeof falas === 'function' ? falas() : falas);
  /** tipo → { modelos, saco } — o baralho de onde as frases são tiradas. */
  const baralhos = new Map();
  /** tipo → a última frase dita, para não repetir. */
  const ultima = new Map();
  /** `tipo:userId` → quando esta pessoa pode falar de novo. */
  const liberadoEm = new Map();
  /** userId → { total, desde } da rajada de curtidas em andamento. */
  const rajadas = new Map();
  /** tipo → { lista, modelos } — a última lista resolvida de cada tipo. */
  const resolvidas = new Map();

  /**
   * As frases de um tipo AGORA, com o padrão do código quando o painel não
   * tem — e sempre o MESMO array enquanto a lista do painel não mudar.
   *
   * A guarda não é economia: o `escolher` compara a lista por referência para
   * saber se o painel trocou as frases, e um `.filter` devolve um array novo
   * a cada chamada. Sem ela, o baralho se reconstruía a cada fala e o sorteio
   * degenerava em alternar entre as duas primeiras frases — as outras nunca
   * eram ditas, e o comentário do baralho virava mentira.
   */
  function modelosDe(tipo) {
    const lista = frasesDeAgora()?.[tipo];
    const guardado = resolvidas.get(tipo);
    if (guardado && guardado.lista === lista) return guardado.modelos;
    // Lista VAZIA é silêncio deliberado; lista AUSENTE cai no padrão. A
    // diferença importa: o painel mostra o padrão escrito desde o começo,
    // então apagar tudo é uma decisão, e não um campo esquecido.
    const modelos = Array.isArray(lista)
      ? lista.filter((f) => typeof f === 'string' && f.trim())
      : (FALAS_PADRAO[tipo] ?? []);
    resolvidas.set(tipo, { lista, modelos });
    return modelos;
  }

  /**
   * Tira uma frase do baralho, sem repetir a anterior.
   *
   * O baralho é reabastecido só quando esvazia — é o que garante que TODAS as
   * frases de um tipo sejam ditas antes de qualquer uma repetir. A versão
   * ingênua, sortear a cada vez, pode dar a mesma frase três vezes seguidas,
   * e a live ouve a repetição como defeito.
   */
  function escolher(tipo, modelos) {
    let baralho = baralhos.get(tipo);
    // A lista pode ter mudado no painel no meio da live; um baralho com as
    // frases antigas falaria o que já não está escrito em lugar nenhum.
    if (!baralho || baralho.modelos !== modelos) {
      baralho = { modelos, saco: [] };
      baralhos.set(tipo, baralho);
    }
    if (baralho.saco.length === 0) {
      const anterior = ultima.get(tipo);
      // Com uma frase só não há o que evitar — e filtrar deixaria o saco
      // vazio, calando justamente quem tem uma frase só.
      baralho.saco = modelos.length > 1 && anterior != null
        ? modelos.filter((m) => m !== anterior)
        : modelos.slice();
    }
    const indice = Math.min(baralho.saco.length - 1, Math.floor(sorteio() * baralho.saco.length));
    const [escolhida] = baralho.saco.splice(indice, 1);
    ultima.set(tipo, escolhida);
    return escolhida;
  }

  /** O acumulado da rajada de curtidas, somando dentro da janela. */
  function somarCurtida(chave, quantidade, t) {
    const antes = rajadas.get(chave);
    const dentro = antes && t - antes.desde <= JANELA_CURTIDA_MS;
    const total = (dentro ? antes.total : 0) + quantidade;
    rajadas.set(chave, { total, desde: dentro ? antes.desde : t });
    return total;
  }

  return {
    /**
     * A fala que este evento merece, ou `null` para ficar quieto.
     *
     * Devolver `null` é resposta, e não erro: é o que o hub consulta antes de
     * mandar áudio para a tela.
     */
    narrar(evento) {
      const tipo = evento?.tipo;
      if (!tipo) return null;
      const modelos = modelosDe(tipo);
      if (modelos.length === 0) return null;

      /*
       * O presente só fala depois de virar VOTO.
       *
       * O presente que chega sem catálogo, ou com um que o mapeamento não
       * conhece, não conta voto nenhum: ele abre uma espera e vira uma
       * cobrança quinze segundos depois. Falar por ele agora anunciaria um
       * voto que não aconteceu — e a frase sairia "Ana mandou !", com o nome
       * do presente em branco, na frente da live inteira.
       *
       * Quem enche o `presente` é quem sabe que o voto aconteceu. Aqui, sem
       * ele, é silêncio — e a guarda fica ANTES do cooldown de propósito: um
       * presente órfão não pode gastar o silêncio de trinta segundos de quem
       * manda outro presente, dez segundos depois, que esse sim vale.
       */
      if (tipo === 'presente' && !String(evento.presente ?? '').trim()) return null;

      const t = agora();
      const quem = String(evento.userId || evento.usuario || '');
      const chave = `${tipo}:${quem || '?'}`;

      /*
       * O cooldown vem ANTES de tudo, inclusive de acumular curtida: uma
       * rajada que continua durante o silêncio encheria o contador e
       * dispararia uma segunda fala no instante em que o cooldown acabasse,
       * contando de novo um gesto que já tinha sido anunciado.
       */
      if ((liberadoEm.get(chave) ?? 0) > t) return null;

      let quantidade = 0;
      if (tipo === 'curtida') {
        quantidade = somarCurtida(chave, Number(evento.quantidade) || 1, t);
        if (quantidade < LIMIAR_CURTIDA) return null;
        rajadas.delete(chave);
      }

      /*
       * O combo do presente, que é o que `{vezes}` mostra.
       *
       * A TikTok manda "cinco rosas" como UM evento com combo 5, e não como
       * cinco eventos — então a contagem do combo é o que a pessoa fez, e
       * dizê-la é o que faz a fala valer para quem mandou. Um `1` vira vazio:
       * "mandou 1x Rosa" não é como uma pessoa fala.
       */
      const combo = tipo === 'presente' ? Math.max(1, Math.floor(Number(evento.combo) || 1)) : 1;

      liberadoEm.set(chave, t + (COOLDOWN_MS[tipo] ?? 60_000));
      const texto = preencher(escolher(tipo, modelos), {
        nome: evento.usuario,
        // O @ só é usado se o apelido não sobrar em nada falável.
        usuario: evento.userId,
        quantidade,
        presente: evento.presente,
        urna: evento.urna,
        vezes: combo > 1 ? `${combo}x ` : '',
      });
      aoNarrar?.(texto);
      return texto;
    },
  };
}
