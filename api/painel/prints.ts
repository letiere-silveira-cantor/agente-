import { comErros } from "../../src/http.js";
import { exigirLogin } from "../../src/auth.js";
import { FUSO_HORARIO } from "../../src/config.js";
import {
  TAMANHO_MAXIMO,
  apagarPrint,
  dataLocal,
  lerPrint,
  listarPrints,
  salvarPrint,
  tipoAceito,
} from "../../src/prints.js";

/**
 * Prints dos stories das lojas de referência.
 * GET: lista os de ontem e de hoje, ou devolve a imagem com ?caminho=.
 * POST: envia uma imagem (corpo = bytes da imagem). DELETE ?caminho=: apaga.
 */
async function get_(request: Request): Promise<Response> {
  const bloqueio = exigirLogin(request);
  if (bloqueio) return bloqueio;

  const caminho = new URL(request.url).searchParams.get("caminho");
  if (caminho) {
    const print = await lerPrint(caminho);
    if (!print) return new Response("não encontrado", { status: 404 });
    return new Response(new Uint8Array(print.dados), {
      headers: { "Content-Type": print.tipo, "Cache-Control": "private, max-age=86400" },
    });
  }

  const agora = new Date();
  const ontem = dataLocal(new Date(agora.getTime() - 24 * 3600 * 1000), FUSO_HORARIO);
  const hoje = dataLocal(agora, FUSO_HORARIO);
  return Response.json({ ontem, hoje, prints: await listarPrints([ontem, hoje]) });
}

async function post_(request: Request): Promise<Response> {
  const bloqueio = exigirLogin(request);
  if (bloqueio) return bloqueio;

  const tipo = request.headers.get("content-type");
  if (!tipoAceito(tipo)) return Response.json({ erro: "Envie JPG, PNG ou WebP." }, { status: 415 });
  const dados = Buffer.from(await request.arrayBuffer());
  if (dados.length === 0 || dados.length > TAMANHO_MAXIMO) {
    return Response.json({ erro: "Imagem vazia ou maior que 3 MB." }, { status: 413 });
  }
  const caminho = await salvarPrint(dados, tipo, new Date(), FUSO_HORARIO);
  return Response.json({ ok: true, caminho });
}

async function delete_(request: Request): Promise<Response> {
  const bloqueio = exigirLogin(request);
  if (bloqueio) return bloqueio;
  const caminho = new URL(request.url).searchParams.get("caminho") ?? "";
  return (await apagarPrint(caminho))
    ? Response.json({ ok: true })
    : Response.json({ erro: "caminho inválido" }, { status: 400 });
}

export const GET = comErros(get_);
export const POST = comErros(post_);
export const DELETE = comErros(delete_);
