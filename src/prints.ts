import { randomBytes } from "node:crypto";
import { apagarArquivo, gravarBinario, lerBinario, listarArquivos } from "./armazenamento.js";
import { hojeNoFuso } from "./calendario.js";
import type { Imagem } from "./claude.js";

/**
 * Prints dos stories das lojas de referência, enviados pelo site.
 * Ficam em prints/AAAA-MM-DD/, pela data (de Florianópolis) em que foram enviados.
 */

const TIPOS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type TipoImagem = keyof typeof TIPOS;
export const TAMANHO_MAXIMO = 3 * 1024 * 1024;
const CAMINHO_VALIDO = /^prints\/\d{4}-\d{2}-\d{2}\/[\w-]+\.(jpg|png|webp)$/;

export function dataLocal(agora: Date, fuso: string): string {
  const d = hojeNoFuso(agora, fuso);
  return `${d.ano}-${String(d.mes).padStart(2, "0")}-${String(d.dia).padStart(2, "0")}`;
}

export function caminhoValido(caminho: string): boolean {
  return CAMINHO_VALIDO.test(caminho);
}

export function tipoAceito(tipo: string | null): tipo is TipoImagem {
  return tipo !== null && tipo in TIPOS;
}

export async function salvarPrint(dados: Buffer, tipo: TipoImagem, agora: Date, fuso: string): Promise<string> {
  const caminho = `prints/${dataLocal(agora, fuso)}/${agora.getTime()}-${randomBytes(3).toString("hex")}.${TIPOS[tipo]}`;
  await gravarBinario(caminho, dados, tipo);
  return caminho;
}

/** Prints das datas pedidas (AAAA-MM-DD), mais antigos primeiro. */
export async function listarPrints(datas: string[]): Promise<string[]> {
  const todos = await Promise.all(datas.map((d) => listarArquivos(`prints/${d}/`)));
  return todos.flat().filter(caminhoValido).sort();
}

export async function lerPrint(caminho: string): Promise<{ dados: Buffer; tipo: TipoImagem } | null> {
  if (!caminhoValido(caminho)) return null;
  const dados = await lerBinario(caminho);
  if (!dados) return null;
  const extensao = caminho.split(".").pop();
  const tipo = (Object.keys(TIPOS) as TipoImagem[]).find((t) => TIPOS[t] === extensao) ?? "image/jpeg";
  return { dados, tipo };
}

export async function apagarPrint(caminho: string): Promise<boolean> {
  if (!caminhoValido(caminho)) return false;
  await apagarArquivo(caminho);
  return true;
}

/** Prints prontos para mandar ao Claude, com a hora em que foram enviados. */
export async function printsParaClaude(caminhos: string[], fuso: string): Promise<Imagem[]> {
  const formatador = new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, dateStyle: "short", timeStyle: "short" });
  const imagens: Imagem[] = [];
  for (const [i, caminho] of caminhos.entries()) {
    const print = await lerPrint(caminho);
    if (!print) continue;
    const enviadoEm = Number(caminho.split("/").pop()?.split("-")[0]);
    imagens.push({
      tipo: print.tipo,
      base64: print.dados.toString("base64"),
      legenda: `Print ${i + 1} de story de loja de referência (enviado em ${formatador.format(new Date(enviadoEm))}):`,
    });
  }
  return imagens;
}
