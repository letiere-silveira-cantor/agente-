/**
 * Datas comerciais que importam para uma loja de celulares no Brasil.
 * O código só calcula quando cada data cai; a estratégia fica com o Claude.
 */

export interface DataComercial {
  nome: string;
  /** dd/mm/aaaa */
  data: string;
  diasAte: number;
}

type Dia = { ano: number; mes: number; dia: number }; // mes: 1-12

const utc = (d: Dia) => Date.UTC(d.ano, d.mes - 1, d.dia);
const deUtc = (ms: number): Dia => {
  const d = new Date(ms);
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() };
};
const somarDias = (d: Dia, n: number) => deUtc(utc(d) + n * 86400000);
const diaDaSemana = (d: Dia) => new Date(utc(d)).getUTCDay(); // 0 = domingo

/** Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function pascoa(ano: number): Dia {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return { ano, mes, dia };
}

/** n-ésimo dia da semana do mês (ex.: 2º domingo de maio). */
function enesimo(ano: number, mes: number, semana: number, n: number): Dia {
  let d: Dia = { ano, mes, dia: 1 };
  while (diaDaSemana(d) !== semana) d = somarDias(d, 1);
  return somarDias(d, 7 * (n - 1));
}

/** Última sexta-feira de novembro. */
export function blackFriday(ano: number): Dia {
  let d: Dia = { ano, mes: 11, dia: 30 };
  while (diaDaSemana(d) !== 5) d = somarDias(d, -1);
  return d;
}

function datasDoAno(ano: number): { nome: string; dia: Dia }[] {
  const p = pascoa(ano);
  const bf = blackFriday(ano);
  return [
    { nome: "Ano Novo", dia: { ano, mes: 1, dia: 1 } },
    { nome: "Volta às aulas (fevereiro)", dia: { ano, mes: 2, dia: 1 } },
    { nome: "Carnaval", dia: somarDias(p, -47) },
    { nome: "Dia do Consumidor", dia: { ano, mes: 3, dia: 15 } },
    { nome: "Páscoa", dia: p },
    { nome: "Dia das Mães", dia: enesimo(ano, 5, 0, 2) },
    { nome: "Dia dos Namorados", dia: { ano, mes: 6, dia: 12 } },
    { nome: "Dia dos Pais", dia: enesimo(ano, 8, 0, 2) },
    { nome: "Lançamento do novo iPhone (data aproximada, a Apple anuncia em setembro)", dia: enesimo(ano, 9, 2, 2) },
    { nome: "Dia do Cliente", dia: { ano, mes: 9, dia: 15 } },
    { nome: "Dia das Crianças", dia: { ano, mes: 10, dia: 12 } },
    { nome: "Black Friday", dia: bf },
    { nome: "Cyber Monday", dia: somarDias(bf, 3) },
    { nome: "Prazo da 1ª parcela do 13º salário", dia: { ano, mes: 11, dia: 30 } },
    { nome: "Começo da alta temporada de verão em Florianópolis", dia: { ano, mes: 12, dia: 15 } },
    { nome: "Prazo da 2ª parcela do 13º salário", dia: { ano, mes: 12, dia: 20 } },
    { nome: "Natal", dia: { ano, mes: 12, dia: 25 } },
  ];
}

/** Dia de hoje no fuso da loja. */
export function hojeNoFuso(agora: Date, fuso: string): Dia {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(agora)
    .split("-")
    .map(Number);
  return { ano: partes[0], mes: partes[1], dia: partes[2] };
}

const formatar = (d: Dia) =>
  `${String(d.dia).padStart(2, "0")}/${String(d.mes).padStart(2, "0")}/${d.ano}`;

/** Datas comerciais de hoje até `dias` dias à frente, da mais próxima para a mais distante. */
export function proximasDatas(agora: Date, fuso: string, dias = 45): DataComercial[] {
  const hoje = hojeNoFuso(agora, fuso);
  return [...datasDoAno(hoje.ano), ...datasDoAno(hoje.ano + 1)]
    .map(({ nome, dia }) => ({ nome, data: formatar(dia), diasAte: Math.round((utc(dia) - utc(hoje)) / 86400000) }))
    .filter((d) => d.diasAte >= 0 && d.diasAte <= dias)
    .sort((a, b) => a.diasAte - b.diasAte);
}

/** Data por extenso, ex.: "terça-feira, 17 de novembro de 2026". */
export function dataPorExtenso(agora: Date, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, dateStyle: "full" }).format(agora);
}
