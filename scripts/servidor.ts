/**
 * Roda o site no seu computador, igual à Vercel: arquivos de public/ e rotas de api/.
 *
 *   npm run site      →  http://localhost:3000
 *
 * Lê as variáveis do .env. Sem BLOB_READ_WRITE_TOKEN, guarda tudo na pasta .dados/.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

try {
  process.loadEnvFile(".env");
} catch {
  // sem .env: usa as variáveis já exportadas no terminal
}

const PORTA = Number(process.env.PORT ?? 3000);
const PUBLICO = path.resolve("public");
const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

type Handler = (request: Request) => Response | Promise<Response>;

async function rotaDaApi(caminho: string, metodo: string): Promise<Handler | null> {
  if (!/^\/api\/[a-z/]+$/.test(caminho)) return null;
  const arquivo = path.resolve(`.${caminho}.ts`);
  try {
    const modulo = (await import(pathToFileURL(arquivo).href)) as Record<string, Handler | undefined>;
    return modulo[metodo] ?? null;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORTA}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const handler = await rotaDaApi(url.pathname, req.method ?? "GET");
      if (!handler) {
        res.writeHead(404).end("rota não encontrada");
        return;
      }
      const corpo = req.method === "GET" || req.method === "HEAD" ? undefined : await new Response(req as unknown as ReadableStream).arrayBuffer();
      const cabecalhos = new Headers();
      for (const [chave, valor] of Object.entries(req.headers)) if (typeof valor === "string") cabecalhos.set(chave, valor);
      const resposta = await handler(new Request(url, { method: req.method, headers: cabecalhos, body: corpo }));
      res.writeHead(resposta.status, Object.fromEntries(resposta.headers));
      res.end(Buffer.from(await resposta.arrayBuffer()));
      return;
    }

    const relativo = url.pathname === "/" ? "/index.html" : url.pathname;
    const arquivo = path.join(PUBLICO, path.normalize(relativo));
    if (!arquivo.startsWith(PUBLICO)) {
      res.writeHead(403).end();
      return;
    }
    const conteudo = await readFile(arquivo);
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(arquivo)] ?? "application/octet-stream" }).end(conteudo);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") res.writeHead(404).end("não encontrado");
    else {
      console.error(e);
      res.writeHead(500).end("erro");
    }
  }
}).listen(PORTA, () => console.log(`Site em http://localhost:${PORTA}`));
