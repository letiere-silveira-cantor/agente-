import Anthropic from "@anthropic-ai/sdk";
import { env } from "./config.js";

type Esforco = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Gera o relatório com o Claude.
 * - Streaming, para a resposta longa não estourar o tempo da requisição HTTP.
 * - Fallback no servidor: se o modelo recusar por política, a API tenta de novo
 *   num modelo substituto dentro da mesma chamada.
 */
export async function gerarComClaude(promptSistema: string, mensagem: string): Promise<string> {
  const client = new Anthropic(); // lê ANTHROPIC_API_KEY
  const modelo = env("CLAUDE_MODEL", "claude-opus-5-5");
  const esforco = env("CLAUDE_EFFORT", "medium") as Esforco;

  const stream = client.beta.messages.stream({
    model: modelo,
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    output_config: { effort: esforco },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: promptSistema,
    messages: [{ role: "user", content: mensagem }],
  });
  const resposta = await stream.finalMessage();

  if (resposta.stop_reason === "refusal") {
    throw new Error(`O Claude recusou gerar o relatório (${resposta.stop_details?.category ?? "sem categoria"}).`);
  }

  const texto = resposta.content
    .flatMap((bloco) => (bloco.type === "text" ? [bloco.text] : []))
    .join("")
    .trim();

  if (resposta.stop_reason === "max_tokens") {
    throw new Error("O relatório passou do limite de tamanho e veio cortado. Reduza a quantidade de roteiros.");
  }
  if (!texto) throw new Error("O Claude não devolveu texto.");

  console.log(
    `Claude: modelo ${resposta.model}, ${resposta.usage.input_tokens} tokens de entrada, ` +
      `${resposta.usage.output_tokens} de saída.`,
  );
  return texto;
}
