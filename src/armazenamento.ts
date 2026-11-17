import { get, put } from "@vercel/blob";

/** Relatório guardado no Vercel Blob (privado) até o dono pedir para receber. */
export interface RelatorioSalvo {
  geradoEm: string;
  periodo: string;
  partes: string[];
  /** Números que já receberam este relatório. */
  entreguePara: string[];
}

const ULTIMO = "relatorios/ultimo.json";

async function gravar(caminho: string, relatorio: RelatorioSalvo): Promise<void> {
  await put(caminho, JSON.stringify(relatorio, null, 2), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

/** Salva como "último" e também uma cópia com a data, para histórico. */
export async function salvarRelatorio(relatorio: RelatorioSalvo): Promise<void> {
  const data = relatorio.geradoEm.slice(0, 10);
  await Promise.all([gravar(ULTIMO, relatorio), gravar(`relatorios/${data}.json`, relatorio)]);
}

export async function atualizarUltimo(relatorio: RelatorioSalvo): Promise<void> {
  await gravar(ULTIMO, relatorio);
}

export async function carregarUltimo(): Promise<RelatorioSalvo | null> {
  const resultado = await get(ULTIMO, { access: "private", useCache: false });
  if (!resultado) return null;
  return JSON.parse(await new Response(resultado.stream).text()) as RelatorioSalvo;
}
