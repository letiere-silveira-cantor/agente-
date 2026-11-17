import { gerarRelatorio, salvarEAvisar } from "../src/pipeline.js";

/**
 * Rodado pelo Cron da Vercel toda semana (ver vercel.json).
 * A Vercel manda "Authorization: Bearer <CRON_SECRET>"; qualquer outra chamada é recusada.
 * Para rodar na mão:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://SEU-PROJETO.vercel.app/api/gerar
 */
export async function GET(request: Request): Promise<Response> {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return Response.json({ erro: "não autorizado" }, { status: 401 });
  }

  try {
    const agora = new Date();
    const resultado = await gerarRelatorio({ agora });
    const salvo = await salvarEAvisar(resultado, agora);
    return Response.json({
      ok: true,
      periodo: salvo.periodo,
      mensagens: salvo.partes.length,
      entreguePara: salvo.entreguePara,
      avisos: resultado.avisos,
    });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
