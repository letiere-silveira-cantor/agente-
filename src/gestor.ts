import { randomBytes } from "node:crypto";
import { gravarArquivo, lerArquivo } from "./armazenamento.js";

/**
 * Gestor de conteúdo (quadro tipo Trello): cards organizados por dia, em sequência.
 * Tudo fica num arquivo só (gestor/quadro.json); é um usuário só, então basta.
 */

export const TIPOS = ["story", "reels", "post", "outro"] as const;
export const STATUS = ["a fazer", "gravado", "postado"] as const;
export type TipoCard = (typeof TIPOS)[number];
export type StatusCard = (typeof STATUS)[number];

export interface Card {
  id: string;
  /** AAAA-MM-DD */
  dia: string;
  /** Posição na sequência do dia, começando em 1. */
  ordem: number;
  tipo: TipoCard;
  titulo: string;
  conteudo: string;
  /** HH:MM ou vazio. */
  horario: string;
  status: StatusCard;
  /** De onde veio, ex.: "Stories de 18/11, nº 3". */
  origem: string;
  criadoEm: string;
  atualizadoEm: string;
}

interface Quadro {
  cards: Card[];
}

const ARQUIVO = "gestor/quadro.json";
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

async function lerQuadro(): Promise<Quadro> {
  const texto = await lerArquivo(ARQUIVO);
  if (!texto?.trim()) return { cards: [] };
  return JSON.parse(texto) as Quadro;
}

async function gravarQuadro(quadro: Quadro): Promise<void> {
  await gravarArquivo(ARQUIVO, JSON.stringify(quadro, null, 2), "application/json");
}

export class ErroDeDados extends Error {}

/** Valida e limpa o que vem do site. Campos ausentes ficam com o valor atual (ou o padrão). */
function limpar(entrada: Partial<Card>, atual?: Card): Omit<Card, "id" | "ordem" | "criadoEm" | "atualizadoEm"> {
  const dia = entrada.dia ?? atual?.dia;
  if (!dia || !DIA.test(dia)) throw new ErroDeDados("Dia inválido.");
  const tipo = entrada.tipo ?? atual?.tipo ?? "story";
  if (!TIPOS.includes(tipo)) throw new ErroDeDados("Tipo inválido.");
  const status = entrada.status ?? atual?.status ?? "a fazer";
  if (!STATUS.includes(status)) throw new ErroDeDados("Status inválido.");
  const horario = String(entrada.horario ?? atual?.horario ?? "").trim();
  if (horario && !HORA.test(horario)) throw new ErroDeDados("Horário inválido (use HH:MM).");
  const titulo = String(entrada.titulo ?? atual?.titulo ?? "").trim().slice(0, 200);
  if (!titulo) throw new ErroDeDados("Dê um título ao card.");
  return {
    dia,
    tipo,
    status,
    horario,
    titulo,
    conteudo: String(entrada.conteudo ?? atual?.conteudo ?? "").slice(0, 20000),
    origem: String(entrada.origem ?? atual?.origem ?? "").slice(0, 200),
  };
}

function doDia(cards: Card[], dia: string): Card[] {
  return cards.filter((c) => c.dia === dia).sort((a, b) => a.ordem - b.ordem);
}

/** Renumera a sequência de um dia: 1, 2, 3... */
function renumerar(cards: Card[], dia: string): void {
  doDia(cards, dia).forEach((c, i) => (c.ordem = i + 1));
}

/** Coloca o card na posição pedida do dia (1 = primeiro; além do fim = último). */
function posicionar(cards: Card[], card: Card, posicao: number | undefined): void {
  const outros = doDia(cards, card.dia).filter((c) => c.id !== card.id);
  const indice = posicao && posicao >= 1 ? Math.min(Math.floor(posicao) - 1, outros.length) : outros.length;
  outros.splice(indice, 0, card);
  outros.forEach((c, i) => (c.ordem = i + 1));
}

/** Cards entre duas datas (inclusive), ordenados por dia e sequência. */
export async function listarCards(de: string, ate: string): Promise<Card[]> {
  if (!DIA.test(de) || !DIA.test(ate)) throw new ErroDeDados("Período inválido.");
  const { cards } = await lerQuadro();
  return cards
    .filter((c) => c.dia >= de && c.dia <= ate)
    .sort((a, b) => (a.dia === b.dia ? a.ordem - b.ordem : a.dia.localeCompare(b.dia)));
}

export async function contarNoDia(dia: string): Promise<number> {
  if (!DIA.test(dia)) throw new ErroDeDados("Dia inválido.");
  return doDia((await lerQuadro()).cards, dia).length;
}

export async function criarCard(entrada: Partial<Card> & { posicao?: number }): Promise<Card> {
  const quadro = await lerQuadro();
  const agora = new Date().toISOString();
  const card: Card = { id: randomBytes(6).toString("hex"), ordem: 0, criadoEm: agora, atualizadoEm: agora, ...limpar(entrada) };
  quadro.cards.push(card);
  posicionar(quadro.cards, card, entrada.posicao);
  await gravarQuadro(quadro);
  return card;
}

/** Edita um card. Com `dia` e/ou `posicao`, também move o card. */
export async function atualizarCard(id: string, entrada: Partial<Card> & { posicao?: number }): Promise<Card> {
  const quadro = await lerQuadro();
  const card = quadro.cards.find((c) => c.id === id);
  if (!card) throw new ErroDeDados("Card não encontrado.");
  const diaAntigo = card.dia;
  Object.assign(card, limpar(entrada, card), { atualizadoEm: new Date().toISOString() });
  if (card.dia !== diaAntigo || entrada.posicao !== undefined) {
    posicionar(quadro.cards, card, entrada.posicao ?? (card.dia === diaAntigo ? card.ordem : undefined));
    renumerar(quadro.cards, diaAntigo);
  }
  await gravarQuadro(quadro);
  return card;
}

export async function apagarCard(id: string): Promise<void> {
  const quadro = await lerQuadro();
  const card = quadro.cards.find((c) => c.id === id);
  if (!card) return;
  quadro.cards = quadro.cards.filter((c) => c.id !== id);
  renumerar(quadro.cards, card.dia);
  await gravarQuadro(quadro);
}
