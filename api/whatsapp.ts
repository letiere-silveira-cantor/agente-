import { waitUntil } from "@vercel/functions";
import { atualizarUltimo, carregarUltimo } from "../src/armazenamento.js";
import { destinatarios, exigirEnv } from "../src/config.js";
import {
  assinaturaValida,
  chaveNumero,
  enviarPartes,
  enviarTexto,
  extrairMensagens,
  mesmoNumero,
} from "../src/whatsapp.js";

/** Verificação do webhook: a Meta chama uma vez, ao cadastrar a URL. */
export function GET(request: Request): Response {
  const url = new URL(request.url);
  const modo = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const desafio = url.searchParams.get("hub.challenge");
  if (modo === "subscribe" && token === exigirEnv("WHATSAPP_VERIFY_TOKEN") && desafio) {
    return new Response(desafio, { status: 200 });
  }
  return new Response("proibido", { status: 403 });
}

const PEDIDO_DE_REENVIO = /relat[oó]rio|reenvi|de novo|roteiro/i;

const AJUDA =
  "Sou o agente de reels da RBTech. Toda segunda eu mando o relatório da semana. " +
  "Para receber o último de novo, responda *relatório*.";

async function responder(de: string, texto: string): Promise<void> {
  const relatorio = await carregarUltimo();
  if (!relatorio) {
    await enviarTexto(de, "Ainda não tenho nenhum relatório pronto.");
    return;
  }

  const jaRecebeu = relatorio.entreguePara.some((n) => mesmoNumero(n, de));
  if (jaRecebeu && !PEDIDO_DE_REENVIO.test(texto)) {
    await enviarTexto(de, AJUDA);
    return;
  }

  await enviarPartes(de, relatorio.partes);
  if (!jaRecebeu) {
    relatorio.entreguePara.push(de);
    await atualizarUltimo(relatorio);
  }
}

/** Mensagens recebidas no número do WhatsApp. */
export async function POST(request: Request): Promise<Response> {
  const corpoBruto = await request.text();
  const assinatura = request.headers.get("x-hub-signature-256");
  if (!assinaturaValida(corpoBruto, assinatura, exigirEnv("META_APP_SECRET"))) {
    return new Response("assinatura inválida", { status: 401 });
  }

  const autorizados = new Set(destinatarios().map(chaveNumero));
  // Uma resposta por número, mesmo que a pessoa tenha mandado várias mensagens seguidas.
  const ultimaPorNumero = new Map<string, { de: string; texto: string }>();
  for (const m of extrairMensagens(JSON.parse(corpoBruto))) {
    if (autorizados.has(chaveNumero(m.de))) ultimaPorNumero.set(chaveNumero(m.de), m);
  }

  // Responde 200 na hora (a Meta reenvia se demorar) e manda o relatório em seguida.
  if (ultimaPorNumero.size > 0) {
    const tarefas = [...ultimaPorNumero.values()].map((m) => responder(m.de, m.texto));
    waitUntil(Promise.all(tarefas).catch((e) => console.error(e)));
  }
  return new Response("ok", { status: 200 });
}
