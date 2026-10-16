/**
 * A fonte que troca de fonte.
 *
 * O hub recebe UMA fonte quando nasce e fica com ela para sempre. Isso era
 * verdade enquanto só existia o simulador, e deixou de ser no dia em que a
 * live real passou a ser uma escolha do painel: trocar de modo gravava a
 * configuração e não trocava nada, e o Leonardo só descobriria isso no ar,
 * com a tela contando pelo simulador e a live mandando presente para
 * ninguém.
 *
 * A alternativa óbvia — o hub perguntar a cada evento qual é a fonte de
 * agora — espalharia a decisão por todo lugar que já fala com uma fonte, e
 * cada um desses lugares é um lugar a mais para esquecer. Aqui a resposta é
 * outra: o hub continua falando com o mesmo objeto, e o objeto troca de
 * identidade por baixo. Quem fala com ele não precisa saber que a fonte
 * mudou, pelo mesmo motivo que quem pede um voto não precisa saber se ele
 * veio da live ou do painel.
 *
 * O que NÃO pode acontecer, e por isso tem atenção aqui:
 *
 *   - dois processos ao mesmo tempo. A fonte velha é parada ANTES de a nova
 *     entrar em cena — dois Pythons na mesma live contariam o mesmo presente
 *     duas vezes, que é o defeito mais caro que este sistema pode ter;
 *   - a conexão cair a cada salvamento. O `config.changed` chega toda vez que
 *     o operador salva qualquer aba, e derrubar e levantar a live porque ele
 *     mudou o tempo da rodada seria um defeito que ele provocaria sem
 *     perceber.
 */
import { criarSimulador } from './simulator.js';
import { criarFonteTiktok } from './tiktok.js';

/** Qual fonte a configuração pede. */
export function fonteParaConfig(config) {
  return config?.integracao?.modo === 'tiktok'
    ? criarFonteTiktok({ usuario: config.integracao.usuario })
    : criarSimulador();
}

/**
 * A fonte de fora, com um mecanismo de troca por dentro.
 *
 * @param {object} opcoes
 * @param {object} opcoes.config  a configuração que vale agora
 * @param {Function} [opcoes.criar]  como uma fonte é feita a partir da config
 */
export function criarTrocaDeFontes({ config, criar = fonteParaConfig } = {}) {
  const ouvintes = new Set();
  const ouvintesDeStatus = new Set();
  let atual = criar(config);

  /**
   * Repassa os avisos da fonte de agora para quem está inscrito em MIM.
   *
   * As inscrições ficam aqui, e não na fonte de baixo, porque são elas que
   * precisam sobreviver à troca. Se cada fonte nova recebesse os ouvintes de
   * novo, o hub teria de se reinscrever a cada troca — e uma troca que
   * esquecesse de fazer isso deixaria o painel mudo com a live no ar.
   */
  function ligar(fonte) {
    fonte.aoEvento((evento) => {
      for (const fn of [...ouvintes]) {
        // Um ouvinte quebrado não pode calar os outros — a mesma regra da
        // casca, repetida aqui porque esta camada também entrega eventos.
        try { fn(evento); } catch (e) { console.error(`[fonte] ouvinte falhou: ${e.message}`); }
      }
    });
    fonte.aoStatus((estado) => {
      for (const fn of [...ouvintesDeStatus]) {
        try { fn(estado); } catch (e) { console.error(`[fonte] ouvinte falhou: ${e.message}`); }
      }
    });
  }
  ligar(atual);

  function trocar(nova) {
    const velha = atual;
    /*
     * A ordem importa e não é gosto.
     *
     * `atual` muda primeiro para que um evento que chegue no meio da troca já
     * saia pela fonte certa. A velha é parada em seguida, e só então a nova
     * liga: entre parar e ligar existe um instante sem ninguém contando, e é
     * melhor perder um evento desse instante do que contar o mesmo duas vezes.
     */
    atual = nova;
    ligar(nova);
    velha.parar();
    nova.iniciar();
    // O painel precisa ver o estado da fonte NOVA agora, e não no próximo
    // evento: uma fonte recém-nascida pode ficar minutos sem dizer nada.
    for (const fn of [...ouvintesDeStatus]) {
      try { fn(nova.status()); } catch { /* já registrado acima */ }
    }
  }

  return {
    get modo() { return atual.modo; },
    get conectada() { return atual.conectada; },
    get usuario() { return atual.usuario ?? ''; },
    status: () => atual.status(),
    aoEvento(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    aoStatus(fn) { ouvintesDeStatus.add(fn); return () => ouvintesDeStatus.delete(fn); },
    emitir: (evento) => atual.emitir(evento),
    iniciar: () => atual.iniciar(),
    parar: () => atual.parar(),

    /*
     * O que só o simulador tem.
     *
     * O painel chama estes dois para disparar um presente de teste e para
     * fazer o narrador falar, e eles não existem na fonte da live — não há
     * botão que fabrique um presente da TikTok. O `?.` de dentro é o que
     * responde certo nos dois casos: no simulador dispara, na live não faz
     * nada, e nenhum dos dois quebra.
     *
     * Isto já foi um defeito: a troca repassava só a interface comum, e o
     * botão de disparar presente do painel ficou inerte sem nada acusando
     * erro — o pior tipo de defeito, porque a tela responde e o voto não vem.
     */
    enviar: (args) => atual.enviar?.(args) ?? false,
    social: (args) => atual.social?.(args) ?? false,
    /*
     * E o comentário, que faltava aqui.
     *
     * É o mesmo defeito do parágrafo acima, repetido: o `sim.comment` do
     * painel — o botão que escreve no chat para conferir o voto por escrito —
     * chegava no hub, achava `fonte.comentario` indefinido, e o `?.` do hub
     * engolia a chamada. O botão respondia na tela e nada acontecia na cena.
     * Achado pela sonda `ficha-do-voto.js`, que manda o comentário pelo canal
     * do painel e não viu voto nenhum sair do outro lado.
     *
     * Na live quem traz comentário é o `aoEvento` da ponte, e é por isso que
     * este caminho só existe no simulador — mas é o caminho que o operador
     * usa para ensaiar antes de ir ao ar, e um ensaio que não conta voto faz
     * o operador procurar defeito onde não tem.
     */
    comentario: (args) => atual.comentario?.(args) ?? false,

    /**
     * A configuração mudou. Troca a fonte se — e só se — ela mudou de fato.
     *
     * O `usuario` entra na comparação porque é o caso que mais acontece: o
     * operador erra o nome da live, a ponte desiste, ele corrige no painel e
     * salva. Sem esta linha, corrigir o nome não levantaria ponte nenhuma, e
     * a única saída seria reiniciar o servidor no meio da transmissão.
     */
    aplicarConfig(nova) {
      const modo = nova?.integracao?.modo === 'tiktok' ? 'tiktok' : 'simulador';
      const usuario = String(nova?.integracao?.usuario ?? '').trim().replace(/^@+/, '');
      if (atual.modo === modo && (modo !== 'tiktok' || atual.usuario === usuario)) {
        return false;
      }
      trocar(criar(nova));
      return true;
    },
  };
}
