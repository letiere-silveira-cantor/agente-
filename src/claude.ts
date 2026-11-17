import Anthropic from "@anthropic-ai/sdk";
import { env } from "./config.js";

type Esforco = "low" | "medium" | "high" | "xhigh" | "max";

/** Uma imagem (print de story) para o Claude ler. */
export interface Imagem {
  tipo: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
  /** Texto que vai logo antes da imagem, ex.: "Print 1 (enviado em 16/11 às 20:14)". */
  legenda: string;
}

interface Pedido {
  sistema: string;
  texto: string;
  imagens?: Imagem[];
  /** JSON Schema: quando presente, a resposta vem em JSON válido nesse formato. */
  esquema?: Record<string, unknown>;
}

/**
 * Chama o Claude.
 * - Streaming, para a resposta longa não estourar o tempo da requisição HTTP.
 * - Fallback no servidor: se o modelo recusar por política, a API tenta de novo
 *   num modelo substituto dentro da mesma chamada.
 */
export async function perguntarAoClaude(pedido: Pedido): Promise<string> {
  const client = new Anthropic(); // lê ANTHROPIC_API_KEY
  const modelo = env("CLAUDE_MODEL", "claude-opus-5-5");
  const esforco = env("CLAUDE_EFFORT", "medium") as Esforco;

  const conteudo: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const imagem of pedido.imagens ?? []) {
    conteudo.push({ type: "text", text: imagem.legenda });
    conteudo.push({ type: "image", source: { type: "base64", media_type: imagem.tipo, data: imagem.base64 } });
  }
  conteudo.push({ type: "text", text: pedido.texto });

  const stream = client.beta.messages.stream({
    model: modelo,
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: esforco,
      ...(pedido.esquema ? { format: { type: "json_schema" as const, schema: pedido.esquema } } : {}),
    },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: pedido.sistema,
    messages: [{ role: "user", content: conteudo }],
  });
  const resposta = await stream.finalMessage();

  if (resposta.stop_reason === "refusal") {
    throw new Error(`O Claude recusou o pedido (${resposta.stop_details?.category ?? "sem categoria"}).`);
  }
  if (resposta.stop_reason === "max_tokens") {
    throw new Error("A resposta passou do limite de tamanho e veio cortada.");
  }

  const texto = resposta.content
    .flatMap((bloco) => (bloco.type === "text" ? [bloco.text] : []))
    .join("")
    .trim();
  if (!texto) throw new Error("O Claude não devolveu texto.");

  console.log(
    `Claude: modelo ${resposta.model}, ${resposta.usage.input_tokens} tokens de entrada, ` +
      `${resposta.usage.output_tokens} de saída.`,
  );
  return texto;
}

/** Relatório semanal de reels: texto livre no formato do WhatsApp. */
export function gerarComClaude(promptSistema: string, mensagem: string): Promise<string> {
  return perguntarAoClaude({ sistema: promptSistema, texto: mensagem });
}
