import { comErros } from "../../src/http.js";
import { exigirLogin } from "../../src/auth.js";
import { carregarRelatorio, listarRelatorios } from "../../src/armazenamento.js";
import { carregarStories, listarStories } from "../../src/stories.js";

/**
 * Histórico. ?tipo=stories ou ?tipo=reels.
 * Sem ?data: lista as datas. Com ?data=AAAA-MM-DD: devolve aquele dia.
 */
async function get_(request: Request): Promise<Response> {
  const bloqueio = exigirLogin(request);
  if (bloqueio) return bloqueio;

  const url = new URL(request.url);
  const tipo = url.searchParams.get("tipo");
  const data = url.searchParams.get("data");
  if (tipo !== "stories" && tipo !== "reels") return Response.json({ erro: "tipo inválido" }, { status: 400 });

  if (!data) {
    const datas = tipo === "stories" ? await listarStories() : await listarRelatorios();
    return Response.json({ datas });
  }
  const item = tipo === "stories" ? await carregarStories(data) : await carregarRelatorio(data);
  return item ? Response.json(item) : Response.json({ erro: "não encontrado" }, { status: 404 });
}

export const GET = comErros(get_);
