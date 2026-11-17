import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, get, list, put } from "@vercel/blob";

/**
 * Guarda arquivos no Vercel Blob (privado). Sem BLOB_READ_WRITE_TOKEN,
 * usa a pasta .dados/ do computador, para testar localmente.
 */
/**
 * Chave do Vercel Blob. Normalmente BLOB_READ_WRITE_TOKEN, mas a Vercel deixa
 * escolher outro prefixo (ex.: AGENTE_READ_WRITE_TOKEN). As chaves do Blob
 * sempre começam com "vercel_blob_rw_".
 */
function tokenBlob(): string | undefined {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  for (const [nome, valor] of Object.entries(process.env)) {
    if (nome.endsWith("_READ_WRITE_TOKEN") && valor?.startsWith("vercel_blob_rw_")) return valor;
  }
  return undefined;
}

function usarBlob(): boolean {
  if (tokenBlob()) return true;
  if (process.env.VERCEL) {
    throw new Error(
      "Armazenamento sem chave. Na Vercel, em Storage, conecte um Blob com a opção \"Add a read-write token\" marcada e faça Redeploy.",
    );
  }
  return false;
}
const PASTA_LOCAL = path.join(process.cwd(), ".dados");

export async function lerArquivo(caminho: string): Promise<string | null> {
  if (!usarBlob()) {
    try {
      return await readFile(path.join(PASTA_LOCAL, caminho), "utf8");
    } catch {
      return null;
    }
  }
  const resultado = await get(caminho, { access: "private", useCache: false, token: tokenBlob() });
  if (!resultado) return null;
  return new Response(resultado.stream).text();
}

export async function gravarArquivo(caminho: string, conteudo: string, contentType = "text/plain"): Promise<void> {
  if (!usarBlob()) {
    const destino = path.join(PASTA_LOCAL, caminho);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, conteudo);
    return;
  }
  await put(caminho, conteudo, {
    access: "private",
    contentType: `${contentType}; charset=utf-8`,
    addRandomSuffix: false,
    allowOverwrite: true,
    token: tokenBlob(),
  });
}

export async function gravarBinario(caminho: string, dados: Buffer, contentType: string): Promise<void> {
  if (!usarBlob()) {
    const destino = path.join(PASTA_LOCAL, caminho);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, dados);
    return;
  }
  await put(caminho, dados, {
    access: "private",
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
    token: tokenBlob(),
  });
}

export async function lerBinario(caminho: string): Promise<Buffer | null> {
  if (!usarBlob()) {
    try {
      return await readFile(path.join(PASTA_LOCAL, caminho));
    } catch {
      return null;
    }
  }
  const resultado = await get(caminho, { access: "private", useCache: false, token: tokenBlob() });
  if (!resultado) return null;
  return Buffer.from(await new Response(resultado.stream).arrayBuffer());
}

export async function apagarArquivo(caminho: string): Promise<void> {
  if (!usarBlob()) {
    await unlink(path.join(PASTA_LOCAL, caminho)).catch(() => undefined);
    return;
  }
  await del(caminho, { token: tokenBlob() });
}

/** Caminhos dos arquivos que começam com `prefixo` (ex.: "relatorios/"). */
export async function listarArquivos(prefixo: string): Promise<string[]> {
  if (!usarBlob()) {
    try {
      const nomes = await readdir(path.join(PASTA_LOCAL, prefixo), { recursive: true, withFileTypes: true });
      return nomes
        .filter((n) => n.isFile())
        .map((n) => path.relative(PASTA_LOCAL, path.join(n.parentPath, n.name)).split(path.sep).join("/"));
    } catch {
      return [];
    }
  }
  const caminhos: string[] = [];
  let cursor: string | undefined;
  do {
    const pagina = await list({ prefix: prefixo, cursor, token: tokenBlob() });
    caminhos.push(...pagina.blobs.map((b) => b.pathname));
    cursor = pagina.hasMore ? pagina.cursor : undefined;
  } while (cursor);
  return caminhos;
}

/** Relatório guardado até o dono pedir para receber. */
export interface RelatorioSalvo {
  geradoEm: string;
  periodo: string;
  partes: string[];
  /** Números que já receberam este relatório. */
  entreguePara: string[];
}

const ULTIMO = "relatorios/ultimo.json";

async function gravarRelatorio(caminho: string, relatorio: RelatorioSalvo): Promise<void> {
  await gravarArquivo(caminho, JSON.stringify(relatorio, null, 2), "application/json");
}

/** Salva como "último" e também uma cópia com a data, para o histórico. */
export async function salvarRelatorio(relatorio: RelatorioSalvo): Promise<void> {
  const data = relatorio.geradoEm.slice(0, 10);
  await Promise.all([gravarRelatorio(ULTIMO, relatorio), gravarRelatorio(`relatorios/${data}.json`, relatorio)]);
}

export async function atualizarUltimo(relatorio: RelatorioSalvo): Promise<void> {
  await gravarRelatorio(ULTIMO, relatorio);
}

export async function carregarUltimo(): Promise<RelatorioSalvo | null> {
  return carregarRelatorio("ultimo");
}

/** `id` é a data (AAAA-MM-DD) ou "ultimo". */
export async function carregarRelatorio(id: string): Promise<RelatorioSalvo | null> {
  if (!/^(ultimo|\d{4}-\d{2}-\d{2})$/.test(id)) return null;
  const texto = await lerArquivo(`relatorios/${id}.json`);
  return texto ? (JSON.parse(texto) as RelatorioSalvo) : null;
}

/** Datas dos relatórios guardados, da mais nova para a mais antiga. */
export async function listarRelatorios(): Promise<string[]> {
  return (await listarArquivos("relatorios/"))
    .map((c) => c.match(/(\d{4}-\d{2}-\d{2})\.json$/)?.[1])
    .filter((d): d is string => Boolean(d))
    .sort()
    .reverse();
}
