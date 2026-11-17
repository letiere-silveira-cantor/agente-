import assert from "node:assert/strict";
import { test } from "node:test";
import { montarPromptIdeias } from "../src/ideias.js";

test("prompt da ideia avulsa pede pesquisa, 1 story, 1 reels, 1 post e evita temas sensíveis", () => {
  const prompt = montarPromptIdeias("Loja de teste");
  assert.match(prompt, /busca na internet/);
  assert.match(prompt, /exatamente 1 story, 1 reels e 1 post/);
  assert.match(prompt, /tragédia, crime, política/);
  assert.match(prompt, /\*📱 STORY\*/);
  assert.match(prompt, /\*🎬 REELS\*/);
  assert.match(prompt, /\*🖼️ POST\*/);
  assert.match(prompt, /Loja de teste/);
});
