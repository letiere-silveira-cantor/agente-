import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { assinaturaValida, chaveNumero, dividirMensagem, extrairMensagens, mesmoNumero } from "../src/whatsapp.js";

test("resumo e cada roteiro viram mensagens separadas", () => {
  const texto = [
    "*📊 RESUMO DA SEMANA*\n• 3 contas",
    "*🎬 ROTEIRO 1 — Bateria*\nFala: \"oi\"",
    "*🎬 ROTEIRO 2 — Troca*\nFala: \"olá\"",
  ].join("\n\n");
  const partes = dividirMensagem(texto);
  assert.equal(partes.length, 3);
  assert.ok(partes[1].startsWith("*🎬 ROTEIRO 1"));
});

test("nenhuma parte passa do limite e nada se perde", () => {
  const paragrafos = Array.from({ length: 30 }, (_, i) => `Parágrafo ${i} ` + "x".repeat(300));
  const linhaGigante = "y".repeat(2500);
  const texto = `*📊 RESUMO*\n\n${paragrafos.join("\n\n")}\n\n${linhaGigante}`;
  const partes = dividirMensagem(texto, 1000);
  assert.ok(partes.every((p) => p.length <= 1000));
  const semEspacos = (s: string) => s.replace(/\s/g, "");
  assert.equal(semEspacos(partes.join("")), semEspacos(texto));
});

test("número com e sem o nono dígito é o mesmo", () => {
  assert.equal(chaveNumero("5548999998888"), "554899998888");
  assert.ok(mesmoNumero("+55 (48) 99999-8888", "554899998888"));
  assert.ok(!mesmoNumero("5548999998888", "5548999997777"));
});

test("assinatura do webhook", () => {
  const corpo = '{"a":1}';
  const assinatura = "sha256=" + createHmac("sha256", "segredo").update(corpo).digest("hex");
  assert.ok(assinaturaValida(corpo, assinatura, "segredo"));
  assert.ok(!assinaturaValida(corpo, assinatura, "outro"));
  assert.ok(!assinaturaValida(corpo, null, "segredo"));
  assert.ok(!assinaturaValida(corpo, "sha256=abc", "segredo"));
});

test("extrai texto e clique em botão do webhook", () => {
  const corpo = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                { from: "554899998888", type: "text", text: { body: "relatório" } },
                { from: "554899998888", type: "button", button: { text: "Ver relatório" } },
              ],
            },
          },
          { value: { statuses: [{ status: "delivered" }] } },
        ],
      },
    ],
  };
  assert.deepEqual(extrairMensagens(corpo), [
    { de: "554899998888", texto: "relatório" },
    { de: "554899998888", texto: "Ver relatório" },
  ]);
});
