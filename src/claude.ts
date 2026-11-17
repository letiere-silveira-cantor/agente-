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
  /** Liga a busca na internet (o Claude pesquisa sozinho, até este número de buscas). */
  buscasNaInternet?: number;
}

export interface Fonte {
  titulo: string;
  url: string;
}

export interface Resposta {
  texto: string;
  /** Páginas citadas pela busca na internet, sem repetição. */
  fontes: Fonte[];
}

/**
 * Chama o Claude.
 * - Streaming, para a resposta longa não estourar o tempo da requisição HTTP.
 * - Fallback no servidor: se o modelo recusar por política, a API tenta de novo
 *   num modelo substituto dentro da mesma chamada.
 * - Com busca na internet, a API pode pausar a resposta longa ("pause_turn");
 *   nesse caso a conversa é reenviada para ela continuar de onde parou.
 */
export async function perguntarAoClaudeComFontes(pedido: Pedido): Promise<Resposta> {
  const client = new Anthropic(); // lê ANTHROPIC_API_KEY
  const modelo = env("CLAUDE_MODEL", "claude-opus-5-5");
  const esforco = env("CLAUDE_EFFORT", "medium") as Esforco;

  const conteudo: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const imagem of pedido.imagens ?? []) {
    conteudo.push({ type: "text", text: imagem.legenda });
    conteudo.push({ type: "image", source: { type: "base64", media_type: imagem.tipo, data: imagem.base64 } });
  }
  conteudo.push({ type: "text", text: pedido.texto });

  const ferramentas: Anthropic.Beta.BetaToolUnion[] = pedido.buscasNaInternet
    ? [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: pedido.buscasNaInternet,
          user_location: { type: "approximate", country: "BR", region: "SC", city: "Florianópolis", timezone: "America/Sao_Paulo" },
        },
      ]
    : [];

  const mensagens: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: conteudo }];
  const textos: string[] = [];
  const fontes = new Map<string, Fonte>();

  for (let rodada = 0; rodada < 4; rodada++) {
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
      messages: mensagens,
      ...(ferramentas.length ? { tools: ferramentas } : {}),
    });
    const resposta = await stream.finalMessage();

    if (resposta.stop_reason === "refusal") {
      throw new Error(`O Claude recusou o pedido (${resposta.stop_details?.category ?? "sem categoria"}).`);
    }
    if (resposta.stop_reason === "max_tokens") {
      throw new Error("A resposta passou do limite de tamanho e veio cortada.");
    }

    for (const bloco of resposta.content) {
      // Texto escrito antes de uma busca ("Vou pesquisar...") não faz parte da resposta final.
      if (bloco.type === "server_tool_use" || bloco.type === "web_search_tool_result") {
        textos.length = 0;
        continue;
      }
      if (bloco.type !== "text") continue;
      textos.push(bloco.text);
      for (const citacao of bloco.citations ?? []) {
        if (citacao.type === "web_search_result_location" && !fontes.has(citacao.url)) {
          fontes.set(citacao.url, { titulo: citacao.title ?? citacao.url, url: citacao.url });
        }
      }
    }

    console.log(
      `Claude: modelo ${resposta.model}, ${resposta.usage.input_tokens} tokens de entrada, ` +
        `${resposta.usage.output_tokens} de saída, parada: ${resposta.stop_reason}.`,
    );

    if (resposta.stop_reason !== "pause_turn") break;
    mensagens.push({ role: "assistant", content: resposta.content });
  }

  const texto = textos.join("").trim();
  if (!texto) throw new Error("O Claude não devolveu texto.");
  return { texto, fontes: [...fontes.values()] };
}

export async function perguntarAoClaude(pedido: Pedido): Promise<string> {
  return (await perguntarAoClaudeComFontes(pedido)).texto;
}

/** Relatório semanal de reels: texto livre no formato do WhatsApp. */
export function gerarComClaude(promptSistema: string, mensagem: string): Promise<string> {
  return perguntarAoClaude({ sistema: promptSistema, texto: mensagem });
}
