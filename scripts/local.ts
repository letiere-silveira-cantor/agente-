/**
 * Roda o agente no seu computador, sem esperar o Cron.
 *
 *   npm run gerar:local                          gera e salva em saida/ (não envia nada)
 *   npm run gerar:local -- --salvar-dados        também guarda os dados da Meta em saida/dados-*.json
 *   npm run gerar:local -- --dados arquivo.json  usa dados salvos em vez de chamar a Meta
 *   npm run gerar:local -- --enviar              salva no Blob e avisa no WhatsApp, igual ao Cron
 *
 * Lê as variáveis do arquivo .env (Node 20.6+).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { carregarConfigLoja } from "../src/config.js";
import { coletarDados } from "../src/meta.js";
import { gerarRelatorio, salvarEAvisar } from "../src/pipeline.js";
import type { DadosColetados } from "../src/tipos.js";

try {
  process.loadEnvFile(".env");
} catch {
  // sem .env: usa as variáveis já exportadas no terminal
}

const args = process.argv.slice(2);
const agora = new Date();
const data = agora.toISOString().slice(0, 10);
await mkdir("saida", { recursive: true });

let dados: DadosColetados | undefined;
const iDados = args.indexOf("--dados");
if (iDados >= 0) {
  dados = JSON.parse(await readFile(args[iDados + 1], "utf8")) as DadosColetados;
} else if (args.includes("--salvar-dados")) {
  const { contas } = await carregarConfigLoja();
  dados = await coletarDados(contas.contasReferencia, contas.postsPorConta, agora);
  await writeFile(`saida/dados-${data}.json`, JSON.stringify(dados, null, 2));
  console.log(`Dados da Meta salvos em saida/dados-${data}.json`);
}

console.log("Gerando relatório com o Claude (pode levar alguns minutos)...");
const resultado = await gerarRelatorio({ agora, dados });

await writeFile(`saida/mensagem-${data}.md`, resultado.mensagem);
await writeFile(`saida/relatorio-${data}.txt`, resultado.partes.join("\n\n──────────\n\n"));

for (const aviso of resultado.avisos) console.warn(`Aviso: ${aviso}`);
console.log(`\n${resultado.texto}\n`);
console.log(`Relatório salvo em saida/relatorio-${data}.txt (${resultado.partes.length} mensagens de WhatsApp).`);

if (args.includes("--enviar")) {
  const salvo = await salvarEAvisar(resultado, agora);
  console.log(
    salvo.entreguePara.length > 0
      ? `Enviado para ${salvo.entreguePara.join(", ")}.`
      : "Aviso enviado. O relatório vai quando a pessoa responder no WhatsApp.",
  );
}
