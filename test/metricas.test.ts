import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analisarConta,
  analisarProprios,
  analisarReferencias,
  classificar,
  diaEHora,
  engajamento,
  mediana,
  pareceSorteio,
} from "../src/metricas.js";
import type { ContaBruta, PostBruto } from "../src/tipos.js";

const AGORA = new Date("2026-11-16T12:00:00Z");
const opcoes = { agora: AGORA, diasAnalise: 30, fuso: "America/Sao_Paulo" };

function post(diasAtras: number, curtidas: number, comentarios: number, legenda = "Post normal"): PostBruto {
  return {
    caption: legenda,
    like_count: curtidas,
    comments_count: comentarios,
    media_type: "VIDEO",
    media_product_type: "REELS",
    permalink: `https://instagram.com/p/${diasAtras}-${curtidas}`,
    timestamp: new Date(AGORA.getTime() - diasAtras * 24 * 3600 * 1000).toISOString(),
  };
}

test("engajamento vale curtidas + 2 × comentários", () => {
  assert.equal(engajamento(100, 10), 120);
});

test("mediana com quantidade par e ímpar", () => {
  assert.equal(mediana([5, 1, 3]), 3);
  assert.equal(mediana([4, 1, 3, 2]), 2.5);
  assert.equal(mediana([]), 0);
});

test("classificação pelos limites 2 e 3", () => {
  assert.equal(classificar(3), "viral");
  assert.equal(classificar(2.99), "acima da média");
  assert.equal(classificar(2), "acima da média");
  assert.equal(classificar(1.9), "normal");
});

test("detecta sorteios e 'marque amigos'", () => {
  for (const legenda of [
    "SORTEIO de um iPhone 15!",
    "Vamos sortear uma capinha",
    "Comente e marque 3 amigos",
    "Marque seus amigos que precisam ver isso",
    "Pra participar é só seguir",
    "Concorra a um AirPods",
  ]) {
    assert.ok(pareceSorteio(legenda), legenda);
  }
  for (const legenda of ["Boa sorte pra quem vai trocar de celular", "Marca Apple com garantia", "iPhone 13 seminovo"]) {
    assert.ok(!pareceSorteio(legenda), legenda);
  }
});

test("dia e hora no fuso de Florianópolis", () => {
  // 22:40 UTC de uma terça = 19:40 em Florianópolis
  assert.equal(diaEHora("2026-11-10T22:40:00Z", "America/Sao_Paulo"), "ter 19:40");
});

test("multiplicador relativo à mediana da própria conta e descartes", () => {
  const conta: ContaBruta = {
    username: "loja_a",
    followers_count: 5000,
    posts: [
      post(1, 9999, 999), // menos de 48 h
      post(3, 100, 0),
      post(4, 100, 0),
      post(5, 100, 0),
      post(6, 100, 0),
      post(7, 100, 0),
      post(8, 400, 0), // 4× a mediana
      post(9, 250, 0), // 2,5×
      post(10, 5000, 2000, "Sorteio! Comente e marque 2 amigos"),
      post(45, 9000, 0), // fora do período
    ],
  };
  const r = analisarConta(conta, opcoes);
  assert.ok(!("motivo" in r));
  assert.equal(r.postsValidos, 7);
  assert.equal(r.medianaEngajamento, 100);
  assert.equal(r.posts[0].multiplicador, 4);
  assert.equal(r.posts[0].classificacao, "viral");
  assert.equal(r.posts[1].classificacao, "acima da média");
  assert.deepEqual(
    r.descartados.map((d) => d.motivo).sort(),
    ["menos de 48 horas", "sorteio ou 'marque amigos'"],
  );
});

test("legenda inteira só para viral e acima da média", () => {
  const longa = "a".repeat(500);
  const conta: ContaBruta = {
    username: "loja_b",
    posts: [post(3, 10, 0, longa), post(4, 10, 0, longa), post(5, 10, 0, longa), post(6, 10, 0, longa), post(7, 100, 0, longa)],
  };
  const r = analisarConta(conta, opcoes);
  assert.ok(!("motivo" in r));
  assert.equal(r.posts[0].legenda, longa);
  assert.ok(r.posts[1].legenda.endsWith("(trecho)"));
});

test("conta com menos de 5 posts válidos fica de fora", () => {
  const r = analisarReferencias(
    [{ username: "pequena", posts: [post(3, 10, 1), post(4, 10, 1), post(5, 10, 1), post(6, 10, 1)] }],
    opcoes,
  );
  assert.equal(r.contas.length, 0);
  assert.equal(r.contasExcluidas[0].conta, "pequena");
});

test("posts com curtidas ocultas não entram na mediana", () => {
  const ocultos = [3, 4, 5].map((d) => ({ ...post(d, 0, 5), like_count: undefined }));
  const r = analisarConta({ username: "oculta", posts: [...ocultos, post(6, 10, 0)] }, opcoes);
  assert.ok("motivo" in r);
});

test("resultados da própria loja: só os últimos 7 dias, contra a mediana da loja", () => {
  const r = analisarProprios([post(2, 300, 0), post(10, 100, 0), post(12, 100, 0)], opcoes);
  assert.equal(r.medianaEngajamento, 100);
  assert.equal(r.semanaPassada.length, 1);
  assert.equal(r.semanaPassada[0].multiplicador, 3);
});
