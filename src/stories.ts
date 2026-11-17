import { gravarArquivo, lerArquivo, listarArquivos } from "./armazenamento.js";
import { dataPorExtenso, proximasDatas } from "./calendario.js";
import { perguntarAoClaude } from "./claude.js";
import { FUSO_HORARIO, carregarConfigLoja } from "./config.js";
import { buscarContaReferencia, buscarStoriesProprios, type StoryProprio } from "./meta.js";
import { dataLocal, listarPrints, printsParaClaude } from "./prints.js";
import type { ContaBruta } from "./tipos.js";

/** Quantos dias de posts das lojas de referência entram (o foco é ontem). */
const DIAS_DE_POSTS = 3;
/** Limite de prints por roteiro, para a chamada não ficar grande demais. */
const MAX_PRINTS = 30;

export interface Story {
  numero: number;
  horario: string;
  tipo: string;
  objetivo: string;
  cena: string;
  fala: string;
  textoNaTela: string;
  interacao: string;
  produto: string;
  inspiracao: string;
}

export interface RoteiroStories {
  resumo: {
    epoca: string;
    estrategiaDoDia: string;
    oQueAsConcorrentesFizeram: string;
    observacoes: string;
  };
  stories: Story[];
}

export interface RoteiroSalvo extends RoteiroStories {
  /** AAAA-MM-DD, no fuso de Florianópolis. */
  data: string;
  geradoEm: string;
  avisos: string[];
  printsUsados: number;
}

const texto = { type: "string" } as const;

/** Formato da resposta do Claude (saída estruturada). */
export const ESQUEMA_STORIES = {
  type: "object",
  additionalProperties: false,
  required: ["resumo", "stories"],
  properties: {
    resumo: {
      type: "object",
      additionalProperties: false,
      required: ["epoca", "estrategiaDoDia", "oQueAsConcorrentesFizeram", "observacoes"],
      properties: {
        epoca: { ...texto, description: "Momento comercial e datas próximas que pesam hoje." },
        estrategiaDoDia: { ...texto, description: "A linha do dia em 2 a 4 frases: objetivo, oferta principal, ritmo." },
        oQueAsConcorrentesFizeram: {
          ...texto,
          description: "O que as lojas de referência postaram ontem e o que se destacou. Diga se não houve dados.",
        },
        observacoes: { ...texto, description: "Avisos: produto fora do estoque, dado faltando etc. Vazio se nada." },
      },
    },
    stories: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["numero", "horario", "tipo", "objetivo", "cena", "fala", "textoNaTela", "interacao", "produto", "inspiracao"],
        properties: {
          numero: { type: "integer" },
          horario: { ...texto, description: "Horário sugerido para postar, ex.: 09:30." },
          tipo: { ...texto, description: "Bastidor, produto, prova social, enquete, dica, oferta, contagem regressiva..." },
          objetivo: { ...texto, description: "Para que serve este story na sequência do dia." },
          cena: { ...texto, description: "O que filmar ou fotografar e como enquadrar." },
          fala: { ...texto, description: "O que o dono fala. Vazio se for só imagem e texto." },
          textoNaTela: texto,
          interacao: { ...texto, description: "Figurinha: enquete, caixa de perguntas, quiz, link do WhatsApp... Vazio se nenhuma." },
          produto: { ...texto, description: "Produto da lista de estoque, ou vazio." },
          inspiracao: { ...texto, description: "Post ou print de referência que inspirou, ou 'época' / 'estoque'." },
        },
      },
    },
  },
} as const;

export function montarPromptStories(sobreALoja: string, quantidade: number): string {
  return `Você é o estrategista de stories da RBTech, uma loja de iPhones e celulares em Florianópolis. Todo dia de manhã você entrega ao dono o roteiro dos stories daquele dia, pronto para gravar com o celular, sozinho.

## Sobre a loja
${sobreALoja}

## O que você recebe
- A data de hoje e as datas comerciais das próximas semanas.
- Os posts e reels das lojas de referência dos últimos dias, como vieram da API do Instagram. A API não entrega os stories de outras contas, então isso é o que existe de dado automático delas.
- Às vezes, prints de stories das lojas de referência que o dono tirou e enviou. Quando houver, eles são a melhor pista do que as concorrentes fizeram nos stories.
- Os stories da própria RBTech das últimas 24 horas, com métricas quando a API devolver.
- O estoque da semana.

## Etapa 1 — O que as lojas de referência fizeram ontem
Foque no que foi publicado ontem. Para os posts, compare o engajamento (curtidas + 2 × comentários) de cada um com os outros posts da mesma conta para ver o que se destacou. Nos prints, identifique tipo de story, oferta, gancho, figurinhas usadas e sequência. Ignore sorteios. Se ontem não houver dados das concorrentes, diga isso e apoie o roteiro na época e no estoque.

## Etapa 2 — Estratégia da época
Olhe as datas comerciais próximas e decida o que pesa hoje: aquecimento, contagem regressiva, a data em si ou o pós. Pense também no dia da semana e no momento do mês (salário, 13º, temporada de verão em Florianópolis). A estratégia do dia tem que ser uma só, clara, e os stories inteiros servem a ela.

## Etapa 3 — Roteiro do dia
Escreva exatamente ${quantidade} stories, numerados em ordem, espalhados ao longo do dia, com horário sugerido para cada um.

Regras:
- Monte uma sequência com ritmo: abertura do dia, bastidores, produto, prova social, interação, educação, oferta e chamada para o WhatsApp. Não repita o mesmo tipo três vezes seguidas.
- Use figurinhas de interação (enquete, caixa de perguntas, quiz, contagem regressiva, link) em pelo menos um quarto dos stories.
- Adapte a fórmula, nunca o conteúdo. Não reaproveite frases, artes ou bordões de outras lojas.
- Use só produtos, preços e condições que estiverem no estoque e nas informações da loja. Nunca invente preço, especificação, garantia ou promoção. Se a estratégia pedir uma oferta que não existe, sugira em "observacoes" em vez de anunciar.
- Escreva as falas como o dono falaria: português do Brasil, frases curtas, natural, sem cara de anúncio.
- Não fale mal de concorrentes nem de outras lojas.
- Cada story precisa ser possível de gravar em menos de um minuto, com o celular.`;
}

interface DadosDoDia {
  hoje: string;
  ontem: string;
  datas: ReturnType<typeof proximasDatas>;
  referencias: ContaBruta[];
  storiesProprios: StoryProprio[];
  estoque: string;
  avisos: string[];
  quantidadePrints: number;
}

export function montarMensagemStories(d: DadosDoDia): string {
  const datas = d.datas.length
    ? d.datas.map((x) => `- ${x.nome}: ${x.data} (${x.diasAte === 0 ? "hoje" : `em ${x.diasAte} dia(s)`})`).join("\n")
    : "Nenhuma data comercial nas próximas semanas.";
  return `Hoje é ${d.hoje}. Ontem foi ${d.ontem}.
Os horários dos posts (timestamp) estão em UTC. Florianópolis é UTC−3.

## Datas comerciais próximas
${datas}

## Prints de stories das lojas de referência
${d.quantidadePrints > 0 ? `${d.quantidadePrints} print(s), nas imagens acima.` : "Nenhum print enviado."}

## Posts das lojas de referência (últimos ${DIAS_DE_POSTS} dias)
${JSON.stringify(d.referencias, null, 2)}

## Stories da RBTech nas últimas 24 horas
${d.storiesProprios.length ? JSON.stringify(d.storiesProprios, null, 2) : "Nenhum story no ar ou dado indisponível."}

## Estoque da semana
${d.estoque || "Lista de estoque não informada. Use exemplos genéricos e avise em observacoes."}

## Avisos da coleta
${d.avisos.length ? d.avisos.map((a) => `- ${a}`).join("\n") : "Nenhum."}

Monte o roteiro de stories de hoje.`;
}

export async function gerarStoriesDoDia(agora = new Date()): Promise<RoteiroSalvo> {
  const config = await carregarConfigLoja();
  const avisos: string[] = [];
  const inicio = agora.getTime() - DIAS_DE_POSTS * 24 * 3600 * 1000;
  const ontemData = new Date(agora.getTime() - 24 * 3600 * 1000);

  const resultados = await Promise.allSettled(config.contas.contasReferencia.map((c) => buscarContaReferencia(c, 15)));
  const referencias: ContaBruta[] = [];
  resultados.forEach((r, i) => {
    if (r.status === "fulfilled") {
      const posts = r.value.posts
        .filter((p) => new Date(p.timestamp).getTime() >= inicio)
        .map(({ id: _id, ...resto }) => resto);
      referencias.push({ ...r.value, posts });
    } else {
      avisos.push(`Não consegui ler @${config.contas.contasReferencia[i]}: ${(r.reason as Error).message}`);
    }
  });

  let storiesProprios: StoryProprio[] = [];
  try {
    storiesProprios = await buscarStoriesProprios();
  } catch (e) {
    avisos.push(`Não consegui ler os stories da RBTech: ${(e as Error).message}`);
  }

  const caminhosPrints = (
    await listarPrints([dataLocal(ontemData, FUSO_HORARIO), dataLocal(agora, FUSO_HORARIO)])
  ).slice(-MAX_PRINTS);
  const imagens = await printsParaClaude(caminhosPrints, FUSO_HORARIO);

  const sistema = montarPromptStories(config.sobreALoja, config.contas.quantidadeStories);
  const mensagem = montarMensagemStories({
    hoje: dataPorExtenso(agora, FUSO_HORARIO),
    ontem: dataPorExtenso(ontemData, FUSO_HORARIO),
    datas: proximasDatas(agora, FUSO_HORARIO),
    referencias,
    storiesProprios,
    estoque: config.estoque,
    avisos,
    quantidadePrints: imagens.length,
  });

  const resposta = await perguntarAoClaude({ sistema, texto: mensagem, imagens, esquema: ESQUEMA_STORIES });
  const roteiro = JSON.parse(resposta) as RoteiroStories;
  if (roteiro.stories.length !== config.contas.quantidadeStories) {
    avisos.push(`Pedi ${config.contas.quantidadeStories} stories e vieram ${roteiro.stories.length}.`);
  }

  const salvo: RoteiroSalvo = {
    ...roteiro,
    data: dataLocal(agora, FUSO_HORARIO),
    geradoEm: agora.toISOString(),
    avisos,
    printsUsados: imagens.length,
  };
  await gravarArquivo(`stories/${salvo.data}.json`, JSON.stringify(salvo, null, 2), "application/json");
  return salvo;
}

export async function carregarStories(data: string): Promise<RoteiroSalvo | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  const conteudo = await lerArquivo(`stories/${data}.json`);
  return conteudo ? (JSON.parse(conteudo) as RoteiroSalvo) : null;
}

/** Datas com roteiro de stories, da mais nova para a mais antiga. */
export async function listarStories(): Promise<string[]> {
  return (await listarArquivos("stories/"))
    .map((c) => c.match(/(\d{4}-\d{2}-\d{2})\.json$/)?.[1])
    .filter((d): d is string => Boolean(d))
    .sort()
    .reverse();
}
