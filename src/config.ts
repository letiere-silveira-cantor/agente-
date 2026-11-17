import { readFile } from "node:fs/promises";
import path from "node:path";
import { gravarArquivo, lerArquivo } from "./armazenamento.js";

/** Lê uma variável de ambiente obrigatória. */
export function exigirEnv(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (!valor) {
    throw new Error(`Variável de ambiente ${nome} não configurada. Veja o .env.example.`);
  }
  return valor;
}

export function env(nome: string, padrao: string): string {
  return process.env[nome]?.trim() || padrao;
}

export const FUSO_HORARIO = env("FUSO_HORARIO", "America/Sao_Paulo");
export const VERSAO_GRAPH = env("META_GRAPH_VERSION", "v27.0");

/** Números que recebem o relatório (só dígitos, com DDI e DDD: 5548999999999). */
export function destinatarios(): string[] {
  return exigirEnv("WHATSAPP_DESTINATARIOS")
    .split(",")
    .map((n) => n.replace(/\D/g, ""))
    .filter(Boolean);
}

export interface ConfigContas {
  /** @ das lojas de referência, sem o "@". Precisam ser contas comerciais ou de criador. */
  contasReferencia: string[];
  quantidadeRoteiros: number;
  /** Quantos stories o roteiro diário traz. */
  quantidadeStories: number;
  /** Quantos dias para trás entram na análise semanal de reels. */
  diasAnalise: number;
  /** Quantos posts buscar por conta (a API devolve os mais recentes primeiro). */
  postsPorConta: number;
}

/** Textos editáveis pelo site. Os arquivos de config/ são o valor inicial. */
export interface TextosLoja {
  loja: string;
  estoque: string;
  transcricoes: string;
  contas: ConfigContas;
}

export interface ConfigLoja {
  contas: ConfigContas;
  sobreALoja: string;
  estoque: string;
  transcricoes: string;
}

const PASTA_CONFIG = path.join(process.cwd(), "config");

/** Primeiro o que foi salvo pelo site; se não houver, o arquivo do repositório. */
async function lerConfig(arquivo: string): Promise<string> {
  const salvo = await lerArquivo(`config/${arquivo}`);
  if (salvo !== null) return salvo.trim();
  try {
    return (await readFile(path.join(PASTA_CONFIG, arquivo), "utf8")).trim();
  } catch {
    return "";
  }
}

/** Remove os comentários <!-- --> que explicam como preencher cada arquivo. */
function semComentarios(texto: string): string {
  return texto.replace(/<!--[\s\S]*?-->/g, "").trim();
}

export function normalizarContas(json: Partial<ConfigContas>): ConfigContas {
  const contasReferencia = (json.contasReferencia ?? [])
    .map((c) => String(c).replace(/^@/, "").trim().toLowerCase())
    .filter((c) => /^[a-z0-9._]{1,30}$/.test(c));
  const inteiro = (v: unknown, padrao: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= min && n <= max ? n : padrao;
  };
  return {
    contasReferencia: [...new Set(contasReferencia)],
    quantidadeRoteiros: inteiro(json.quantidadeRoteiros, 5, 1, 10),
    quantidadeStories: inteiro(json.quantidadeStories, 20, 5, 30),
    diasAnalise: inteiro(json.diasAnalise, 30, 7, 90),
    postsPorConta: inteiro(json.postsPorConta, 50, 10, 100),
  };
}

/** Textos como estão, com os comentários de ajuda, para editar no site. */
export async function lerTextosLoja(): Promise<TextosLoja> {
  const contasBruto = await lerConfig("contas.json");
  return {
    loja: semComentarios(await lerConfig("loja.md")),
    estoque: semComentarios(await lerConfig("estoque.md")),
    transcricoes: semComentarios(await lerConfig("transcricoes.md")),
    contas: normalizarContas(contasBruto ? (JSON.parse(contasBruto) as Partial<ConfigContas>) : {}),
  };
}

export async function salvarTextosLoja(textos: Partial<TextosLoja>): Promise<void> {
  const tarefas: Promise<void>[] = [];
  for (const [campo, arquivo] of [
    ["loja", "loja.md"],
    ["estoque", "estoque.md"],
    ["transcricoes", "transcricoes.md"],
  ] as const) {
    const valor = textos[campo];
    if (typeof valor === "string") tarefas.push(gravarArquivo(`config/${arquivo}`, valor.slice(0, 20000)));
  }
  if (textos.contas) {
    const contas = normalizarContas(textos.contas);
    tarefas.push(gravarArquivo("config/contas.json", JSON.stringify(contas, null, 2), "application/json"));
  }
  await Promise.all(tarefas);
}

/** Configuração pronta para o agente usar, validada. */
export async function carregarConfigLoja(): Promise<ConfigLoja> {
  const textos = await lerTextosLoja();
  if (textos.contas.contasReferencia.length === 0) {
    throw new Error("Nenhuma loja de referência cadastrada. Cadastre no site, em Configurações.");
  }
  const sobreALoja = semComentarios(textos.loja);
  if (!sobreALoja) {
    throw new Error("Preencha \"Sobre a loja\" no site, em Configurações.");
  }
  return {
    contas: textos.contas,
    sobreALoja,
    estoque: semComentarios(textos.estoque),
    transcricoes: semComentarios(textos.transcricoes),
  };
}
