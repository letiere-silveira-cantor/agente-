import { comErros } from "../../src/http.js";
import { exigirLogin } from "../../src/auth.js";
import { carregarRelatorio, listarRelatorios } from "../../src/armazenamento.js";
import { carregarStories, listarStories } from "../../src/stories.js";
import { carregarIdeia, listarIdeias } from "../../src/ideias.js";

/**
 * Histórico. ?tipo=stories, ?tipo=reels ou ?tipo=ideias.
 * Sem ?data: lista as datas (ou ids). Com ?data=: devolve aquele item.
 */
async function get_(request: Request): Promise<Response> {
  const bloqueio = exigirLogin(request);
  if (bloqueio) return bloqueio;

  const url = new URL(request.url);
  const tipo = url.searchParams.get("tipo");
  const data = url.searchParams.get("data");
  const tipos = {
    stories: { listar: listarStories, carregar: carregarStories },
    reels: { listar: listarRelatorios, carregar: carregarRelatorio },
    ideias: { listar: listarIdeias, carregar: carregarIdeia },
  } as const;
  if (tipo !== "stories" && tipo !== "reels" && tipo !== "ideias") {
    return Response.json({ erro: "tipo inválido" }, { status: 400 });
  }

  if (!data) return Response.json({ datas: await tipos[tipo].listar() });
  const item = await tipos[tipo].carregar(data);
  return item ? Response.json(item) : Response.json({ erro: "não encontrado" }, { status: 404 });
}

export const GET = comErros(get_);
