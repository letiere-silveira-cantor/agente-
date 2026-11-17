import { exigirLogin } from "../src/auth.js";
import { comErros } from "../src/http.js";
import { gerarIdeia } from "../src/ideias.js";

/** POST { tema?: string }: gera uma ideia avulsa (1 story, 1 reels, 1 post). */
export const POST = comErros(async (request) => {
  const bloqueio = exigirLogin(request);
  if (bloqueio) return bloqueio;
  const { tema } = (await request.json().catch(() => ({}))) as { tema?: unknown };
  const ideia = await gerarIdeia(typeof tema === "string" ? tema : "");
  return Response.json({ ok: true, ideia });
});
