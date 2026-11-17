import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { gravarArquivo, lerArquivo } from "./armazenamento.js";
import { exigirEnv } from "./config.js";

/**
 * Login do painel. Só existe um acesso: o da RBTech, definido nas variáveis
 * ADMIN_EMAIL e ADMIN_PASSWORD (nunca no código). A sessão é um cookie assinado
 * com SESSION_SECRET, válido por 7 dias.
 */

const COOKIE = "rbtech_sessao";
const DURACAO_SESSAO_S = 7 * 24 * 3600;
const MAX_FALHAS = 5;
const BLOQUEIO_MS = 15 * 60 * 1000;
const ARQUIVO_TENTATIVAS = "seguranca/tentativas.json";

const hash = (s: string) => createHash("sha256").update(s, "utf8").digest();
const iguais = (a: string, b: string) => timingSafeEqual(hash(a), hash(b));
const base64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function credenciaisCorretas(email: string, senha: string): boolean {
  const emailOk = iguais(email.trim().toLowerCase(), exigirEnv("ADMIN_EMAIL").toLowerCase());
  const senhaOk = iguais(senha, exigirEnv("ADMIN_PASSWORD"));
  return emailOk && senhaOk;
}

function assinar(dados: string): string {
  return createHmac("sha256", exigirEnv("SESSION_SECRET")).update(dados).digest("base64url");
}

export function criarToken(agora = Date.now()): string {
  const dados = base64url(JSON.stringify({ exp: agora + DURACAO_SESSAO_S * 1000 }));
  return `${dados}.${assinar(dados)}`;
}

export function tokenValido(token: string | undefined, agora = Date.now()): boolean {
  if (!token) return false;
  const [dados, assinatura] = token.split(".");
  if (!dados || !assinatura) return false;
  const esperada = assinar(dados);
  if (assinatura.length !== esperada.length) return false;
  if (!timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperada))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(dados, "base64url").toString()) as { exp: number };
    return typeof exp === "number" && exp > agora;
  } catch {
    return false;
  }
}

function lerCookie(request: Request, nome: string): string | undefined {
  for (const parte of (request.headers.get("cookie") ?? "").split(";")) {
    const [chave, ...valor] = parte.trim().split("=");
    if (chave === nome) return valor.join("=");
  }
  return undefined;
}

const seguro = (request: Request) => (new URL(request.url).protocol === "https:" ? "; Secure" : "");

export function cookieDeSessao(request: Request): string {
  return `${COOKIE}=${criarToken()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${DURACAO_SESSAO_S}${seguro(request)}`;
}

export function cookieDeSaida(request: Request): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${seguro(request)}`;
}

export function estaLogado(request: Request): boolean {
  return tokenValido(lerCookie(request, COOKIE));
}

/**
 * Para usar no começo de cada rota do painel: devolve uma resposta de erro,
 * ou null se a pessoa está logada. Alterações (POST, PUT, DELETE) também precisam
 * do cabeçalho X-Painel, que só o próprio site manda (proteção contra CSRF).
 */
export function exigirLogin(request: Request): Response | null {
  if (!estaLogado(request)) return Response.json({ erro: "faça login" }, { status: 401 });
  if (request.method !== "GET" && request.headers.get("x-painel") !== "1") {
    return Response.json({ erro: "requisição recusada" }, { status: 403 });
  }
  return null;
}

interface Tentativas {
  falhas: number;
  bloqueadoAte: number;
}

async function lerTentativas(): Promise<Tentativas> {
  const texto = await lerArquivo(ARQUIVO_TENTATIVAS);
  return texto ? (JSON.parse(texto) as Tentativas) : { falhas: 0, bloqueadoAte: 0 };
}

const gravarTentativas = (t: Tentativas) =>
  gravarArquivo(ARQUIVO_TENTATIVAS, JSON.stringify(t), "application/json");

export type ResultadoLogin = { ok: true } | { ok: false; erro: string; status: number };

/** Confere o login, com bloqueio de 15 minutos depois de 5 senhas erradas seguidas. */
export async function tentarLogin(email: string, senha: string, agora = Date.now()): Promise<ResultadoLogin> {
  const tentativas = await lerTentativas();
  if (tentativas.bloqueadoAte > agora) {
    const minutos = Math.ceil((tentativas.bloqueadoAte - agora) / 60000);
    return { ok: false, status: 429, erro: `Muitas tentativas erradas. Tente de novo em ${minutos} min.` };
  }

  if (credenciaisCorretas(email, senha)) {
    if (tentativas.falhas > 0) await gravarTentativas({ falhas: 0, bloqueadoAte: 0 });
    return { ok: true };
  }

  const falhas = tentativas.falhas + 1;
  const bloquear = falhas >= MAX_FALHAS;
  await gravarTentativas({ falhas: bloquear ? 0 : falhas, bloqueadoAte: bloquear ? agora + BLOQUEIO_MS : 0 });
  await new Promise((r) => setTimeout(r, 800)); // atrasa quem tenta adivinhar
  return { ok: false, status: 401, erro: "E-mail ou senha incorretos." };
}

/** Chamada do Cron da Vercel, que manda "Authorization: Bearer <CRON_SECRET>". */
export function ehCron(request: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  return iguais(request.headers.get("authorization") ?? "", `Bearer ${segredo}`);
}
