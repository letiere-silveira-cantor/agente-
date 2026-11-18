import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// Armazenamento local numa pasta temporária (sem Blob).
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL;
process.chdir(mkdtempSync(path.join(tmpdir(), "gestor-")));
const { apagarCard, atualizarCard, criarCard, listarCards } = await import("../src/gestor.js");

const sequencia = async (dia: string) => (await listarCards(dia, dia)).map((c) => `${c.ordem}:${c.titulo}`);

test("cria em sequência, insere na posição pedida, move entre dias e apaga", async () => {
  await criarCard({ dia: "2026-11-20", titulo: "A" });
  await criarCard({ dia: "2026-11-20", titulo: "B" });
  const c = await criarCard({ dia: "2026-11-20", titulo: "C", posicao: 1, tipo: "reels", horario: "09:30" });
  assert.deepEqual(await sequencia("2026-11-20"), ["1:C", "2:A", "3:B"]);

  await atualizarCard(c.id, { posicao: 3 });
  assert.deepEqual(await sequencia("2026-11-20"), ["1:A", "2:B", "3:C"]);

  await atualizarCard(c.id, { dia: "2026-11-21", titulo: "C editado", status: "gravado" });
  assert.deepEqual(await sequencia("2026-11-20"), ["1:A", "2:B"]);
  const [movido] = await listarCards("2026-11-21", "2026-11-21");
  assert.equal(movido.titulo, "C editado");
  assert.equal(movido.status, "gravado");
  assert.equal(movido.tipo, "reels");

  const [a] = await listarCards("2026-11-20", "2026-11-20");
  await apagarCard(a.id);
  assert.deepEqual(await sequencia("2026-11-20"), ["1:B"]);
});

test("recusa dados inválidos", async () => {
  await assert.rejects(criarCard({ dia: "amanhã", titulo: "X" }), /Dia inválido/);
  await assert.rejects(criarCard({ dia: "2026-11-20", titulo: "" }), /título/);
  await assert.rejects(criarCard({ dia: "2026-11-20", titulo: "X", horario: "25:00" }), /Horário/);
});
