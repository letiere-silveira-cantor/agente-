import { VERSAO_GRAPH, exigirEnv } from "./config.js";
import type { ContaBruta, DadosColetados, PostBruto, PostProprio } from "./tipos.js";

const CAMPOS_POST = "caption,like_count,comments_count,media_type,media_product_type,permalink,timestamp";

interface ErroGraph {
  error?: { message?: string; code?: number; error_subcode?: number };
}

async function chamarGraph<T>(caminho: string, parametros: Record<string, string>): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${VERSAO_GRAPH}/${caminho}`);
  for (const [chave, valor] of Object.entries(parametros)) url.searchParams.set(chave, valor);
  url.searchParams.set("access_token", exigirEnv("META_ACCESS_TOKEN"));

  const resposta = await fetch(url);
  const corpo = (await resposta.json()) as T & ErroGraph;
  if (!resposta.ok || corpo.error) {
    const e = corpo.error;
    throw new Error(`API da Meta (${resposta.status}, código ${e?.code ?? "?"}): ${e?.message ?? "erro desconhecido"}`);
  }
  return corpo;
}

interface RespostaBusinessDiscovery {
  business_discovery: {
    username: string;
    followers_count?: number;
    media_count?: number;
    media?: { data: PostBruto[] };
  };
}

/** Posts de uma loja de referência. Só funciona com contas comerciais ou de criador. */
export async function buscarContaReferencia(username: string, limite: number): Promise<ContaBruta> {
  const igUserId = exigirEnv("IG_USER_ID");
  const campos =
    `business_discovery.username(${username}){username,followers_count,media_count,` +
    `media.limit(${limite}){${CAMPOS_POST}}}`;
  const { business_discovery: bd } = await chamarGraph<RespostaBusinessDiscovery>(igUserId, { fields: campos });
  return {
    username: bd.username,
    followers_count: bd.followers_count,
    media_count: bd.media_count,
    posts: bd.media?.data ?? [],
  };
}

interface Insight {
  name: string;
  values?: { value: number }[];
  total_value?: { value: number };
}

async function buscarInsights(mediaId: string): Promise<{ alcance?: number; visualizacoes?: number }> {
  // Os nomes das métricas mudam entre versões da API; se "views" falhar, tenta só "reach".
  for (const metricas of ["reach,views", "reach"]) {
    try {
      const { data } = await chamarGraph<{ data: Insight[] }>(`${mediaId}/insights`, { metric: metricas });
      const valor = (nome: string) => {
        const m = data.find((i) => i.name === nome);
        return m?.total_value?.value ?? m?.values?.[0]?.value;
      };
      return { alcance: valor("reach"), visualizacoes: valor("views") };
    } catch {
      // tenta a próxima combinação
    }
  }
  return {};
}

/** Posts recentes da própria RBTech; os dos últimos 7 dias ganham alcance e visualizações. */
export async function buscarPostsProprios(agora: Date, limite = 30): Promise<PostProprio[]> {
  const igUserId = exigirEnv("IG_USER_ID");
  const { data } = await chamarGraph<{ data: (PostBruto & { id: string })[] }>(`${igUserId}/media`, {
    fields: `id,${CAMPOS_POST}`,
    limit: String(limite),
  });

  const inicioSemana = agora.getTime() - 7 * 24 * 3600 * 1000;
  return Promise.all(
    data.map(async (post) => {
      if (new Date(post.timestamp).getTime() < inicioSemana) return post;
      return { ...post, ...(await buscarInsights(post.id)) };
    }),
  );
}

/** Coleta tudo da semana. Um erro numa conta vira aviso e não derruba as outras. */
export async function coletarDados(contas: string[], postsPorConta: number, agora: Date): Promise<DadosColetados> {
  const avisos: string[] = [];

  const resultados = await Promise.allSettled(contas.map((c) => buscarContaReferencia(c, postsPorConta)));
  const referencias: ContaBruta[] = [];
  resultados.forEach((r, i) => {
    if (r.status === "fulfilled") referencias.push(r.value);
    else avisos.push(`Não consegui ler @${contas[i]}: ${(r.reason as Error).message}`);
  });

  let proprios: PostProprio[] = [];
  try {
    proprios = await buscarPostsProprios(agora);
  } catch (e) {
    avisos.push(`Não consegui ler os posts da própria RBTech: ${(e as Error).message}`);
  }

  return { referencias, proprios, avisos };
}
