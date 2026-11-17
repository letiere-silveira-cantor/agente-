import { comErros } from "../../src/http.js";
import { cookieDeSaida, cookieDeSessao, estaLogado, tentarLogin } from "../../src/auth.js";

/** GET: está logado? POST: entrar. DELETE: sair. */
function get_(request: Request): Response {
  return Response.json({ logado: estaLogado(request) }, { status: estaLogado(request) ? 200 : 401 });
}

async function post_(request: Request): Promise<Response> {
  if (request.headers.get("x-painel") !== "1") return Response.json({ erro: "requisição recusada" }, { status: 403 });
  const { email, senha } = (await request.json().catch(() => ({}))) as { email?: unknown; senha?: unknown };
  if (typeof email !== "string" || typeof senha !== "string" || !email || !senha) {
    return Response.json({ erro: "Informe e-mail e senha." }, { status: 400 });
  }
  const resultado = await tentarLogin(email, senha);
  if (!resultado.ok) return Response.json({ erro: resultado.erro }, { status: resultado.status });
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookieDeSessao(request) } });
}

function delete_(request: Request): Response {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookieDeSaida(request) } });
}

export const GET = comErros(get_);
export const POST = comErros(post_);
export const DELETE = comErros(delete_);
