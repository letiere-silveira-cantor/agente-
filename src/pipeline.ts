import { gerarComClaude } from "./claude.js";
import { FUSO_HORARIO, carregarConfigLoja, destinatarios, env } from "./config.js";
import { coletarDados } from "./meta.js";
import { analisarProprios, analisarReferencias } from "./metricas.js";
import { montarMensagemSemanal, montarPromptSistema } from "./prompt.js";
import { salvarRelatorio, type RelatorioSalvo } from "./armazenamento.js";
import type { DadosColetados } from "./tipos.js";
import { dividirMensagem, enviarModeloAviso, enviarPartes } from "./whatsapp.js";

function formatarData(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO_HORARIO, dateStyle: "short" }).format(d);
}

export interface ResultadoGeracao {
  periodo: string;
  texto: string;
  partes: string[];
  avisos: string[];
  /** Mensagem enviada ao Claude, útil para conferir o que ele recebeu. */
  mensagem: string;
}

export interface OpcoesGeracao {
  agora?: Date;
  /** Dados já coletados (para testar sem chamar a API da Meta). */
  dados?: DadosColetados;
}

export async function gerarRelatorio(opcoes: OpcoesGeracao = {}): Promise<ResultadoGeracao> {
  const agora = opcoes.agora ?? new Date();
  const config = await carregarConfigLoja();
  const { diasAnalise } = config.contas;

  const dados =
    opcoes.dados ?? (await coletarDados(config.contas.contasReferencia, config.contas.postsPorConta, agora));
  if (dados.referencias.length === 0) {
    throw new Error(`Nenhuma conta de referência pôde ser lida.\n${dados.avisos.join("\n")}`);
  }

  const referencias = analisarReferencias(dados.referencias, { agora, diasAnalise, fuso: FUSO_HORARIO });
  const proprios = dados.proprios.length > 0 ? analisarProprios(dados.proprios, { agora, fuso: FUSO_HORARIO }) : null;

  const inicio = new Date(agora.getTime() - diasAnalise * 24 * 3600 * 1000);
  const periodo = { inicio: formatarData(inicio), fim: formatarData(agora) };

  const mensagem = montarMensagemSemanal({
    periodo,
    referencias,
    proprios,
    avisos: dados.avisos,
    transcricoes: config.transcricoes,
    estoque: config.estoque,
  });
  const texto = await gerarComClaude(montarPromptSistema(config.sobreALoja, config.contas.quantidadeRoteiros), mensagem);

  return {
    periodo: `${periodo.inicio} a ${periodo.fim}`,
    texto,
    partes: dividirMensagem(texto),
    avisos: dados.avisos,
    mensagem,
  };
}

/**
 * Salva o relatório e avisa os destinatários.
 * - modo "modelo" (padrão): manda o modelo aprovado; o relatório vai quando a pessoa responder.
 * - modo "direto": manda o relatório na hora. Só funciona se a pessoa falou com o número
 *   nas últimas 24 horas (regra do WhatsApp).
 */
export async function salvarEAvisar(resultado: ResultadoGeracao, agora = new Date()): Promise<RelatorioSalvo> {
  const numeros = destinatarios();
  const modo = env("WHATSAPP_MODO", "modelo");

  const relatorio: RelatorioSalvo = {
    geradoEm: agora.toISOString(),
    periodo: resultado.periodo,
    partes: resultado.partes,
    entreguePara: [],
  };

  if (modo === "direto") {
    for (const numero of numeros) {
      await enviarPartes(numero, resultado.partes);
      relatorio.entreguePara.push(numero);
    }
    await salvarRelatorio(relatorio);
  } else {
    // Salva antes de avisar, para o relatório já existir quando a resposta chegar.
    await salvarRelatorio(relatorio);
    for (const numero of numeros) await enviarModeloAviso(numero, resultado.periodo);
  }
  return relatorio;
}
