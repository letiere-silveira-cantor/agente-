import { ehCron, exigirLogin } from "../src/auth.js";
import { gerarStoriesDoDia } from "../src/stories.js";

/**
 * Roteiro diário de stories.
 * - GET: Cron da Vercel, todo dia antes das 9h.
 * - POST: botão "Gerar agora" do site.
 */
async function gerar(): Promise<Response> {
  try {
    return Response.json({ ok: true, roteiro: await gerarStoriesDoDia() });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}

export async function GET(request: Request): Promise<Response> {
  if (!ehCron(request)) return Response.json({ erro: "não autorizado" }, { status: 401 });
  return gerar();
}

export async function POST(request: Request): Promise<Response> {
  return exigirLogin(request) ?? gerar();
}
