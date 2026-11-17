import assert from "node:assert/strict";
import { test } from "node:test";

process.env.ADMIN_EMAIL = "Loja@Exemplo.com";
process.env.ADMIN_PASSWORD = "senha-certa";
process.env.SESSION_SECRET = "segredo";
process.env.CRON_SECRET = "cron";
const { credenciaisCorretas, criarToken, ehCron, exigirLogin, tokenValido } = await import("../src/auth.js");

test("aceita só o e-mail (sem diferenciar maiúsculas) e a senha certos", () => {
  assert.ok(credenciaisCorretas(" loja@exemplo.com ", "senha-certa"));
  assert.ok(!credenciaisCorretas("loja@exemplo.com", "senha-errada"));
  assert.ok(!credenciaisCorretas("outra@exemplo.com", "senha-certa"));
});

test("sessão assinada vale 7 dias e não aceita adulteração", () => {
  const agora = Date.now();
  const token = criarToken(agora);
  assert.ok(tokenValido(token, agora));
  assert.ok(!tokenValido(token, agora + 8 * 24 * 3600 * 1000));
  const [dados] = token.split(".");
  assert.ok(!tokenValido(`${dados}.assinaturafalsa`, agora));
  assert.ok(!tokenValido(undefined));
});

test("rotas do painel exigem login e o cabeçalho X-Painel nas alterações", () => {
  const cookie = `rbtech_sessao=${criarToken()}`;
  assert.equal(exigirLogin(new Request("https://x/api"))?.status, 401);
  assert.equal(exigirLogin(new Request("https://x/api", { headers: { cookie } })), null);
  assert.equal(exigirLogin(new Request("https://x/api", { method: "PUT", headers: { cookie } }))?.status, 403);
  assert.equal(exigirLogin(new Request("https://x/api", { method: "PUT", headers: { cookie, "x-painel": "1" } })), null);
});

test("cron só com o segredo certo", () => {
  assert.ok(ehCron(new Request("https://x", { headers: { authorization: "Bearer cron" } })));
  assert.ok(!ehCron(new Request("https://x", { headers: { authorization: "Bearer outro" } })));
});
