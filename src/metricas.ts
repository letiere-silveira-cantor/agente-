import type { ContaBruta, PostBruto, PostProprio } from "./tipos.js";

export const MULTIPLICADOR_VIRAL = 3;
export const MULTIPLICADOR_ACIMA = 2;
export const MINIMO_POSTS_POR_CONTA = 5;
export const HORAS_MINIMAS = 48;
const TRECHO_LEGENDA = 140;

export type Classificacao = "viral" | "acima da média" | "normal";

export interface PostAnalisado {
  permalink: string;
  publicadoEm: string;
  /** Dia da semana e hora no fuso da loja, ex.: "ter 19:40". */
  diaEHora: string;
  tipo: string;
  curtidas: number;
  comentarios: number;
  engajamento: number;
  multiplicador: number;
  classificacao: Classificacao;
  /** Legenda inteira nos virais e acima da média; só o começo nos demais. */
  legenda: string;
}

export interface ContaAnalisada {
  conta: string;
  seguidores?: number;
  postsValidos: number;
  medianaEngajamento: number;
  /** Ordenados do maior para o menor multiplicador. */
  posts: PostAnalisado[];
  descartados: { permalink: string; motivo: string }[];
}

export interface ContaExcluida {
  conta: string;
  motivo: string;
}

export interface AnaliseReferencias {
  contas: ContaAnalisada[];
  contasExcluidas: ContaExcluida[];
  totalPostsAnalisados: number;
}

export function engajamento(curtidas: number, comentarios: number): number {
  return curtidas + 2 * comentarios;
}

export function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? (ordenados[meio - 1] + ordenados[meio]) / 2
    : ordenados[meio];
}

export function classificar(multiplicador: number): Classificacao {
  if (multiplicador >= MULTIPLICADOR_VIRAL) return "viral";
  if (multiplicador >= MULTIPLICADOR_ACIMA) return "acima da média";
  return "normal";
}

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const PADRAO_SORTEIO = new RegExp(
  [
    "sorte(io|ar|amos|ando|aremos)",
    "giveaway",
    "concorr(a|er|endo|e a)",
    "(marque|marca|marcar|marquem)\\s+(\\d+|um|uma|dois|duas|tres|seus?|suas?|os?|as?)?\\s*(amig|pessoa|parceir)",
    "(comente|comenta)\\s+e\\s+marque",
    "pr?a\\s+participar",
    "para\\s+participar",
  ].join("|"),
);

/** Detecta sorteios e posts do tipo "comente e marque amigos" pela legenda. */
export function pareceSorteio(legenda: string | undefined): boolean {
  if (!legenda) return false;
  return PADRAO_SORTEIO.test(normalizar(legenda));
}

const formatadorDiaHora = (fuso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export function diaEHora(iso: string, fuso: string): string {
  return formatadorDiaHora(fuso).format(new Date(iso)).replace(/\.,?/g, "").replace(",", "");
}

function tipoDoPost(post: PostBruto): string {
  if (post.media_product_type === "REELS") return "reel";
  if (post.media_type === "CAROUSEL_ALBUM") return "carrossel";
  if (post.media_type === "VIDEO") return "vídeo";
  if (post.media_type === "IMAGE") return "foto";
  return (post.media_product_type ?? post.media_type ?? "desconhecido").toLowerCase();
}

function trecho(legenda: string): string {
  const limpa = legenda.replace(/\s+/g, " ").trim();
  return limpa.length > TRECHO_LEGENDA ? `${limpa.slice(0, TRECHO_LEGENDA)}… (trecho)` : limpa;
}

function arredondar(n: number, casas = 2): number {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

interface Opcoes {
  agora: Date;
  diasAnalise: number;
  fuso: string;
}

export function analisarConta(conta: ContaBruta, opcoes: Opcoes): ContaAnalisada | ContaExcluida {
  const inicio = opcoes.agora.getTime() - opcoes.diasAnalise * 24 * 3600 * 1000;
  const limite48h = opcoes.agora.getTime() - HORAS_MINIMAS * 3600 * 1000;

  const descartados: ContaAnalisada["descartados"] = [];
  const validos: PostBruto[] = [];

  for (const post of conta.posts) {
    const quando = new Date(post.timestamp).getTime();
    if (Number.isNaN(quando) || quando < inicio) continue; // fora do período
    if (quando > limite48h) {
      descartados.push({ permalink: post.permalink, motivo: "menos de 48 horas" });
    } else if (pareceSorteio(post.caption)) {
      descartados.push({ permalink: post.permalink, motivo: "sorteio ou 'marque amigos'" });
    } else if (post.like_count == null) {
      descartados.push({ permalink: post.permalink, motivo: "curtidas ocultas pela conta" });
    } else {
      validos.push(post);
    }
  }

  if (validos.length < MINIMO_POSTS_POR_CONTA) {
    return {
      conta: conta.username,
      motivo: `só ${validos.length} post(s) válido(s) no período (mínimo ${MINIMO_POSTS_POR_CONTA})`,
    };
  }

  const engajamentos = validos.map((p) => engajamento(p.like_count ?? 0, p.comments_count ?? 0));
  const med = mediana(engajamentos);

  const posts: PostAnalisado[] = validos.map((p, i) => {
    const eng = engajamentos[i];
    // Mediana zero só acontece em conta sem nenhum engajamento: nada se destaca.
    const mult = med > 0 ? eng / med : 0;
    const classificacao = classificar(mult);
    const legenda = p.caption ?? "";
    return {
      permalink: p.permalink,
      publicadoEm: p.timestamp,
      diaEHora: diaEHora(p.timestamp, opcoes.fuso),
      tipo: tipoDoPost(p),
      curtidas: p.like_count ?? 0,
      comentarios: p.comments_count ?? 0,
      engajamento: eng,
      multiplicador: arredondar(mult),
      classificacao,
      legenda: classificacao === "normal" ? trecho(legenda) : legenda,
    };
  });
  posts.sort((a, b) => b.multiplicador - a.multiplicador);

  return {
    conta: conta.username,
    seguidores: conta.followers_count,
    postsValidos: validos.length,
    medianaEngajamento: arredondar(med, 1),
    posts,
    descartados,
  };
}

export function analisarReferencias(contas: ContaBruta[], opcoes: Opcoes): AnaliseReferencias {
  const resultado: AnaliseReferencias = { contas: [], contasExcluidas: [], totalPostsAnalisados: 0 };
  for (const conta of contas) {
    const analise = analisarConta(conta, opcoes);
    if ("motivo" in analise) {
      resultado.contasExcluidas.push(analise);
    } else {
      resultado.contas.push(analise);
      resultado.totalPostsAnalisados += analise.postsValidos;
    }
  }
  return resultado;
}

export interface PostProprioAnalisado {
  permalink: string;
  publicadoEm: string;
  diaEHora: string;
  tipo: string;
  curtidas: number;
  comentarios: number;
  alcance?: number;
  visualizacoes?: number;
  engajamento: number;
  /** Comparado com a mediana dos últimos posts da própria RBTech. */
  multiplicador: number;
  legenda: string;
}

export interface AnalisePropria {
  medianaEngajamento: number;
  postsUsadosNaMediana: number;
  semanaPassada: PostProprioAnalisado[];
}

/**
 * Resultados da RBTech nos últimos 7 dias, comparados com a mediana
 * dos posts recentes da própria loja.
 */
export function analisarProprios(posts: PostProprio[], opcoes: Omit<Opcoes, "diasAnalise">): AnalisePropria {
  const inicioSemana = opcoes.agora.getTime() - 7 * 24 * 3600 * 1000;
  const engajamentos = posts.map((p) => engajamento(p.like_count ?? 0, p.comments_count ?? 0));
  const med = mediana(engajamentos);

  const semanaPassada = posts
    .map((p, i) => ({ p, eng: engajamentos[i] }))
    .filter(({ p }) => new Date(p.timestamp).getTime() >= inicioSemana)
    .map(({ p, eng }) => ({
      permalink: p.permalink,
      publicadoEm: p.timestamp,
      diaEHora: diaEHora(p.timestamp, opcoes.fuso),
      tipo: tipoDoPost(p),
      curtidas: p.like_count ?? 0,
      comentarios: p.comments_count ?? 0,
      alcance: p.alcance,
      visualizacoes: p.visualizacoes,
      engajamento: eng,
      multiplicador: med > 0 ? arredondar(eng / med) : 0,
      legenda: p.caption ?? "",
    }));

  return {
    medianaEngajamento: arredondar(med, 1),
    postsUsadosNaMediana: posts.length,
    semanaPassada,
  };
}
