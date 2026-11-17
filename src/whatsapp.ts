import { createHmac, timingSafeEqual } from "node:crypto";
import { VERSAO_GRAPH, env, exigirEnv } from "./config.js";

/** O WhatsApp aceita até 4096 caracteres por mensagem de texto; deixamos folga. */
export const LIMITE_MENSAGEM = 3900;

/**
 * Divide o relatório em mensagens: o resumo numa, cada roteiro na sua.
 * Se um pedaço ainda passar do limite, quebra por parágrafo e, em último caso, por linha.
 */
export function dividirMensagem(texto: string, limite = LIMITE_MENSAGEM): string[] {
  const blocos = texto
    .split(/\n(?=\*🎬 ROTEIRO)/u)
    .map((b) => b.trim())
    .filter(Boolean);

  const partes: string[] = [];
  for (const bloco of blocos) {
    if (bloco.length <= limite) partes.push(bloco);
    else partes.push(...agrupar(bloco.split(/\n\s*\n/), "\n\n", limite));
  }
  return partes;
}

function agrupar(pedacos: string[], separador: string, limite: number): string[] {
  const saida: string[] = [];
  let atual = "";
  for (const pedaco of pedacos) {
    if (pedaco.length > limite) {
      if (atual) saida.push(atual);
      atual = "";
      if (separador === "\n\n") {
        saida.push(...agrupar(pedaco.split("\n"), "\n", limite));
      } else {
        for (let i = 0; i < pedaco.length; i += limite) saida.push(pedaco.slice(i, i + limite));
      }
      continue;
    }
    const junto = atual ? `${atual}${separador}${pedaco}` : pedaco;
    if (junto.length > limite) {
      saida.push(atual);
      atual = pedaco;
    } else {
      atual = junto;
    }
  }
  if (atual) saida.push(atual);
  return saida.map((s) => s.trim()).filter(Boolean);
}

async function enviar(corpo: Record<string, unknown>): Promise<void> {
  const phoneNumberId = exigirEnv("WHATSAPP_PHONE_NUMBER_ID");
  const resposta = await fetch(`https://graph.facebook.com/${VERSAO_GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${exigirEnv("WHATSAPP_TOKEN")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...corpo }),
  });
  if (!resposta.ok) {
    throw new Error(`WhatsApp recusou o envio (${resposta.status}): ${await resposta.text()}`);
  }
}

export function enviarTexto(para: string, texto: string): Promise<void> {
  return enviar({ to: para, type: "text", text: { body: texto, preview_url: false } });
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Envia as partes em ordem, com uma pausa curta para não chegarem embaralhadas. */
export async function enviarPartes(para: string, partes: string[]): Promise<void> {
  for (const [i, parte] of partes.entries()) {
    await enviarTexto(para, parte);
    if (i < partes.length - 1) await pausa(1200);
  }
}

/**
 * Fora da janela de 24 horas o WhatsApp só entrega mensagens de modelo aprovado.
 * O modelo tem uma variável no corpo: o período do relatório.
 */
export function enviarModeloAviso(para: string, periodo: string): Promise<void> {
  return enviar({
    to: para,
    type: "template",
    template: {
      name: env("WHATSAPP_TEMPLATE", "relatorio_semanal"),
      language: { code: env("WHATSAPP_TEMPLATE_IDIOMA", "pt_BR") },
      components: [{ type: "body", parameters: [{ type: "text", text: periodo }] }],
    },
  });
}

/** Confere a assinatura X-Hub-Signature-256 que a Meta põe em cada chamada do webhook. */
export function assinaturaValida(corpoBruto: string, cabecalho: string | null, segredo: string): boolean {
  if (!cabecalho?.startsWith("sha256=")) return false;
  const esperado = createHmac("sha256", segredo).update(corpoBruto, "utf8").digest("hex");
  const recebido = cabecalho.slice("sha256=".length);
  if (recebido.length !== esperado.length) return false;
  return timingSafeEqual(Buffer.from(recebido, "hex"), Buffer.from(esperado, "hex"));
}

/**
 * No Brasil, o WhatsApp às vezes identifica celulares sem o nono dígito
 * (554899999999 em vez de 5548999999999). Esta forma serve só para comparar números.
 */
export function chaveNumero(numero: string): string {
  const n = numero.replace(/\D/g, "");
  return n.length === 13 && n.startsWith("55") && n[4] === "9" ? n.slice(0, 4) + n.slice(5) : n;
}

export function mesmoNumero(a: string, b: string): boolean {
  return chaveNumero(a) === chaveNumero(b);
}

export interface MensagemRecebida {
  de: string;
  texto: string;
}

interface CorpoWebhook {
  entry?: {
    changes?: {
      value?: {
        messages?: {
          from: string;
          type: string;
          text?: { body?: string };
          button?: { text?: string };
          interactive?: { button_reply?: { title?: string } };
        }[];
      };
    }[];
  }[];
}

/** Extrai as mensagens recebidas do corpo do webhook (ignora status de entrega). */
export function extrairMensagens(corpo: unknown): MensagemRecebida[] {
  const saida: MensagemRecebida[] = [];
  for (const entrada of (corpo as CorpoWebhook).entry ?? []) {
    for (const mudanca of entrada.changes ?? []) {
      for (const m of mudanca.value?.messages ?? []) {
        saida.push({
          de: m.from,
          texto: m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? "",
        });
      }
    }
  }
  return saida;
}
