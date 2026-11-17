import assert from "node:assert/strict";
import { test } from "node:test";
import { blackFriday, pascoa, proximasDatas } from "../src/calendario.js";

test("Páscoa e Black Friday", () => {
  assert.deepEqual(pascoa(2026), { ano: 2026, mes: 4, dia: 5 });
  assert.deepEqual(pascoa(2027), { ano: 2027, mes: 3, dia: 28 });
  assert.deepEqual(blackFriday(2026), { ano: 2026, mes: 11, dia: 27 });
  assert.deepEqual(blackFriday(2027), { ano: 2027, mes: 11, dia: 26 });
});

test("datas próximas a partir de 17/11/2026, no fuso de Florianópolis", () => {
  const datas = proximasDatas(new Date("2026-11-17T12:00:00Z"), "America/Sao_Paulo", 45);
  const nomes = datas.map((d) => d.nome);
  assert.equal(datas[0].nome, "Black Friday");
  assert.equal(datas[0].diasAte, 10);
  assert.ok(nomes.includes("Natal"));
  assert.ok(nomes.includes("Ano Novo"));
  assert.ok(!nomes.includes("Dia das Mães"));
});
