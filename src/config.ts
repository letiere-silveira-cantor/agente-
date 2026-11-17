import { readFile } from "node:fs/promises";
import path from "node:path";

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
export const VERSAO_GRAPH = env("META_GRAPH_VERSION", "v24.0");

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
  /** Quantos dias para trás entram na análise das lojas de referência. */
  diasAnalise: number;
  /** Quantos posts buscar por conta (a API devolve os mais recentes primeiro). */
  postsPorConta: number;
}

export interface ConfigLoja {
  contas: ConfigContas;
  sobreALoja: string;
  estoque: string;
  transcricoes: string;
}

const PASTA_CONFIG = path.join(process.cwd(), "config");

async function lerTexto(arquivo: string): Promise<string> {
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

export async function carregarConfigLoja(): Promise<ConfigLoja> {
  const bruto = await lerTexto("contas.json");
  if (!bruto) throw new Error("Arquivo config/contas.json não encontrado.");
  const json = JSON.parse(bruto) as Partial<ConfigContas>;

  const contasReferencia = (json.contasReferencia ?? [])
    .map((c) => c.replace(/^@/, "").trim())
    .filter(Boolean);
  if (contasReferencia.length === 0) {
    throw new Error("Nenhuma conta de referência em config/contas.json.");
  }

  const sobreALoja = semComentarios(await lerTexto("loja.md"));
  if (!sobreALoja || sobreALoja.includes("{{")) {
    throw new Error("Preencha config/loja.md com as informações da loja (ainda há campos {{ }} sem trocar).");
  }

  return {
    contas: {
      contasReferencia,
      quantidadeRoteiros: json.quantidadeRoteiros ?? 5,
      diasAnalise: json.diasAnalise ?? 30,
      postsPorConta: json.postsPorConta ?? 50,
    },
    sobreALoja,
    estoque: semComentarios(await lerTexto("estoque.md")),
    transcricoes: semComentarios(await lerTexto("transcricoes.md")),
  };
}
