import { exigirLogin } from "../../src/auth.js";
import { lerTextosLoja, salvarTextosLoja, type TextosLoja } from "../../src/config.js";

/** Informações da loja, estoque, transcrições e lojas de referência. */
export async function GET(request: Request): Promise<Response> {
  return exigirLogin(request) ?? Response.json(await lerTextosLoja());
}

export async function PUT(request: Request): Promise<Response> {
  const bloqueio = exigirLogin(request);
  if (bloqueio) return bloqueio;
  const corpo = (await request.json().catch(() => null)) as Partial<TextosLoja> | null;
  if (!corpo) return Response.json({ erro: "dados inválidos" }, { status: 400 });
  // Mantém os campos que o site não mostra (ex.: postsPorConta).
  const atual = await lerTextosLoja();
  await salvarTextosLoja({ ...corpo, contas: corpo.contas ? { ...atual.contas, ...corpo.contas } : undefined });
  return Response.json(await lerTextosLoja());
}
