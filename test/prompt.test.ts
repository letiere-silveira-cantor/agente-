import assert from "node:assert/strict";
import { test } from "node:test";
import { montarMensagemSemanal, montarPromptSistema } from "../src/prompt.js";

test("o prompt pede ao Claude para fazer a análise", () => {
  const prompt = montarPromptSistema("Loja de teste", 4);
  assert.match(prompt, /Calcule o engajamento de cada post: curtidas \+ 2 × comentários/);
  assert.match(prompt, /Calcule a mediana de engajamento/);
  assert.match(prompt, /Descarte da análise/);
  assert.match(prompt, /Escreva 4 roteiros/);
  assert.match(prompt, /Loja de teste/);
});

test("a mensagem leva os dados brutos da API, sem números calculados", () => {
  const mensagem = montarMensagemSemanal({
    periodo: { inicio: "17/10/2026", fim: "16/11/2026" },
    agora: "2026-11-16T12:00:00.000Z",
    referencias: [
      {
        username: "loja_x",
        followers_count: 1000,
        posts: [{ caption: "Oi", like_count: 120, comments_count: 4, permalink: "https://ig/p/1", timestamp: "2026-11-10T22:40:00+0000" }],
      },
    ],
    proprios: [],
    avisos: ["Não consegui ler @loja_y"],
    transcricoes: "",
    estoque: "- iPhone 13",
  });
  assert.match(mensagem, /"like_count": 120/);
  assert.match(mensagem, /"comments_count": 4/);
  assert.doesNotMatch(mensagem, /multiplicador|mediana/i);
  assert.match(mensagem, /Data e hora da coleta: 2026-11-16T12:00:00.000Z/);
  assert.match(mensagem, /- Não consegui ler @loja_y/);
  assert.match(mensagem, /Sem posts da RBTech nos últimos 7 dias/);
});
