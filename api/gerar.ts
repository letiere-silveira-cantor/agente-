import { ehCron, exigirLogin } from "../src/auth.js";
import { gerarRelatorio, salvarEAvisar, salvarSemAvisar } from "../src/pipeline.js";

/**
 * Relatório semanal de reels.
 * - GET: Cron da Vercel (segunda de manhã). Gera, salva e, se o WhatsApp estiver configurado, avisa.
 * - POST: botão do site. Gera e salva; só avisa no WhatsApp se pedir { "enviar": true }.
 */
async function gerar(enviar: boolean): Promise<Response> {
  try {
    const agora = new Date();
    const resultado = await gerarRelatorio({ agora });
    const salvo = enviar ? await salvarEAvisar(resultado, agora) : await salvarSemAvisar(resultado, agora);
    return Response.json({ ok: true, relatorio: salvo, avisos: resultado.avisos });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}

export async function GET(request: Request): Promise<Response> {
  if (!ehCron(request)) return Response.json({ erro: "não autorizado" }, { status: 401 });
  // Sem WhatsApp configurado, o relatório fica só no site.
  return gerar(Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_DESTINATARIOS));
}

export async function POST(request: Request): Promise<Response> {
  const bloqueio = exigirLogin(request);
  if (bloqueio) return bloqueio;
  const corpo = (await request.json().catch(() => ({}))) as { enviar?: boolean };
  return gerar(corpo.enviar === true);
}
