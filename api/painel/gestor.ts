import { exigirLogin } from "../../src/auth.js";
import { ErroDeDados, apagarCard, atualizarCard, contarNoDia, criarCard, listarCards, type Card } from "../../src/gestor.js";
import { comErros } from "../../src/http.js";

/**
 * Gestor de conteúdo.
 * GET ?de=AAAA-MM-DD&ate=AAAA-MM-DD: cards do período. GET ?contar=AAAA-MM-DD: quantos cards no dia.
 * POST: cria (corpo = card + "posicao"). PUT ?id=: edita e/ou move. DELETE ?id=: apaga.
 */
type Entrada = Partial<Card> & { posicao?: number };

function comValidacao(acao: (request: Request) => Promise<Response>) {
  return comErros(async (request) => {
    const bloqueio = exigirLogin(request);
    if (bloqueio) return bloqueio;
    try {
      return await acao(request);
    } catch (e) {
      if (e instanceof ErroDeDados) return Response.json({ erro: e.message }, { status: 400 });
      throw e;
    }
  });
}

async function corpo(request: Request): Promise<Entrada> {
  const dados = (await request.json().catch(() => null)) as Entrada | null;
  if (!dados || typeof dados !== "object") throw new ErroDeDados("Dados inválidos.");
  if (dados.posicao !== undefined) dados.posicao = Number(dados.posicao);
  return dados;
}

export const GET = comValidacao(async (request) => {
  const url = new URL(request.url);
  const contar = url.searchParams.get("contar");
  if (contar) return Response.json({ total: await contarNoDia(contar) });
  return Response.json({ cards: await listarCards(url.searchParams.get("de") ?? "", url.searchParams.get("ate") ?? "") });
});

export const POST = comValidacao(async (request) => Response.json({ card: await criarCard(await corpo(request)) }));

export const PUT = comValidacao(async (request) => {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  return Response.json({ card: await atualizarCard(id, await corpo(request)) });
});

export const DELETE = comValidacao(async (request) => {
  await apagarCard(new URL(request.url).searchParams.get("id") ?? "");
  return Response.json({ ok: true });
});
