import { gravarArquivo, lerArquivo, listarArquivos } from "./armazenamento.js";
import { dataPorExtenso, proximasDatas } from "./calendario.js";
import { perguntarAoClaudeComFontes, type Fonte } from "./claude.js";
import { FUSO_HORARIO, carregarConfigLoja } from "./config.js";

/**
 * Ideia de conteúdo avulsa: a IA pesquisa na internet o que está em alta agora
 * (ou o tema pedido) e cria 1 story, 1 reels e 1 post para a RBTech.
 */

const MAX_BUSCAS = 6;

export interface IdeiaSalva {
  /** AAAA-MM-DDTHH-MM-SS, também usado no nome do arquivo. */
  id: string;
  geradoEm: string;
  tema: string;
  texto: string;
  fontes: Fonte[];
}

export function montarPromptIdeias(sobreALoja: string): string {
  return `Você é o estrategista de conteúdo da RBTech, uma loja de iPhones e celulares em Florianópolis. Quando o dono pede, você cria uma ideia de conteúdo avulsa pegando carona no que está viralizando no momento.

## Sobre a loja
${sobreALoja}

## Etapa 1 — Descobrir o que está em alta
Use a busca na internet para descobrir o que está bombando agora no Brasil: assuntos do momento, lançamentos, memes, trends do Instagram e do TikTok, áudios em alta, jogos, séries, futebol, notícias de tecnologia. Se o dono informar um tema, pesquise sobre ele (o que está acontecendo, por que está em alta, como as pessoas estão falando disso).

Escolha UM assunto que:
- esteja realmente em alta agora (prefira coisas das últimas duas semanas);
- dê para ligar de forma natural com celular, iPhone ou com a loja;
- não seja tragédia, crime, política, religião, doença ou polêmica pesada.

## Etapa 2 — Criar o conteúdo
Crie exatamente 1 story, 1 reels e 1 post para o feed, todos sobre o mesmo assunto, que o dono consiga gravar sozinho com o celular.

Regras:
- A ligação com o assunto tem que ser esperta e leve, não forçada.
- Use a referência sem usar material de terceiros: nada de logo, trilha ou cena original de jogo, filme ou música com direitos. Recrie com a loja, os produtos e o próprio dono.
- Use só produtos, preços e condições que estiverem no estoque e nas informações da loja. O estoque é escrito do jeito que o dono quiser; interprete com bom senso e não complete o que estiver ambíguo. Nunca invente preço, especificação, garantia ou promoção.
- Escreva como o dono falaria: português do Brasil, frases curtas, natural, sem cara de anúncio.
- Não fale mal de concorrentes.

## Formato da resposta
Responda só com o conteúdo abaixo, sem introdução nem despedida. Use *negrito* com um asterisco, listas com "•" e nada de tabelas ou títulos com #.

*🔥 O QUE ESTÁ EM ALTA*
• Assunto: [qual é]
• Por que está bombando: [1 ou 2 frases]
• Ligação com a RBTech: [1 frase]
• Validade: [quanto tempo a trend deve durar; quando postar]

*📱 STORY*
*Cena:* [o que filmar]
*Fala:* "..."
*Texto na tela:* "..."
*Figurinha:* [enquete, caixa de perguntas, quiz, link...]

*🎬 REELS*
*Duração:* [segundos]
*Gancho (0–3s)*
Fala: "..."
Texto na tela: "..."
*Desenvolvimento*
• Fala: "..." | Na tela: "..."
• (uma linha por corte)
*Chamada final*
Fala: "..."
*Áudio:* [sugestão: áudio em alta no Instagram ou voz original]
*Legenda:* [pronta, com chamada para o WhatsApp e até 5 hashtags]

*🖼️ POST*
*Formato:* [foto única ou carrossel com N cards]
• Card 1: [texto e imagem]
• (um por card)
*Legenda:* [pronta, com chamada para o WhatsApp e até 5 hashtags]`;
}

function novoId(agora: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_HORARIO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(agora);
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "00";
  return `${p("year")}-${p("month")}-${p("day")}T${p("hour")}-${p("minute")}-${p("second")}`;
}

export async function gerarIdeia(tema: string, agora = new Date()): Promise<IdeiaSalva> {
  const config = await carregarConfigLoja();
  const temaLimpo = tema.trim().slice(0, 200);
  const datas = proximasDatas(agora, FUSO_HORARIO, 30)
    .map((d) => `- ${d.nome}: ${d.data}`)
    .join("\n");

  const mensagem = `Hoje é ${dataPorExtenso(agora, FUSO_HORARIO)}.

## Tema pedido pelo dono
${temaLimpo || "Nenhum. Descubra o que está viralizando agora e escolha o melhor assunto."}

## Datas comerciais próximas (para combinar, se fizer sentido)
${datas || "Nenhuma nas próximas semanas."}

## Estoque da semana
${config.estoque || "Não informado. Use exemplos genéricos e avise."}

Crie a ideia de conteúdo.`;

  const { texto, fontes } = await perguntarAoClaudeComFontes({
    sistema: montarPromptIdeias(config.sobreALoja),
    texto: mensagem,
    buscasNaInternet: MAX_BUSCAS,
  });

  const ideia: IdeiaSalva = { id: novoId(agora), geradoEm: agora.toISOString(), tema: temaLimpo, texto, fontes };
  await gravarArquivo(`ideias/${ideia.id}.json`, JSON.stringify(ideia, null, 2), "application/json");
  return ideia;
}

const ID_VALIDO = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/;

export async function carregarIdeia(id: string): Promise<IdeiaSalva | null> {
  if (!ID_VALIDO.test(id)) return null;
  const conteudo = await lerArquivo(`ideias/${id}.json`);
  return conteudo ? (JSON.parse(conteudo) as IdeiaSalva) : null;
}

/** Ideias geradas, da mais nova para a mais antiga. */
export async function listarIdeias(): Promise<string[]> {
  return (await listarArquivos("ideias/"))
    .map((c) => c.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.json$/)?.[1])
    .filter((d): d is string => Boolean(d))
    .sort()
    .reverse();
}
