"use strict";

const DIAS_VISIVEIS = 7;
let inicio = isoDia(new Date());
let cards = [];

const proximoStatus = (s) => STATUS_CARD[(STATUS_CARD.indexOf(s) + 1) % STATUS_CARD.length];

async function salvarCard(card, mudancas) {
  await api(`/api/painel/gestor?id=${card.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mudancas),
  });
}

function cartaoMini(card, total) {
  const resumo = card.conteudo.split("\n").filter(Boolean).slice(0, 3).join("\n");
  const mover = (delta) => async (e) => {
    e.stopPropagation();
    await salvarCard(card, { posicao: card.ordem + delta }).catch((erro) => avisar(erro.message));
    carregar();
  };
  return el("article", {
      class: `card-mini status-${card.status.replace(" ", "-")}`,
      tabindex: "0",
      onclick: () => abrir(card),
      onkeydown: (e) => { if (e.key === "Enter") abrir(card); },
    },
    el("div", { class: "card-mini-topo" },
      el("span", { class: "numero pequeno" }, String(card.ordem)),
      el("span", { class: `etiqueta tipo-${card.tipo}` }, TIPOS_CARD[card.tipo]),
      card.horario ? el("span", { class: "horario" }, card.horario) : null,
    ),
    el("h3", {}, card.titulo),
    resumo ? el("p", { class: "card-mini-texto" }, resumo) : null,
    el("div", { class: "card-mini-acoes" },
      el("button", {
        class: `status-pilula status-${card.status.replace(" ", "-")}`,
        title: "Toque para mudar o status",
        onclick: async (e) => {
          e.stopPropagation();
          await salvarCard(card, { status: proximoStatus(card.status) }).catch((erro) => avisar(erro.message));
          carregar();
        },
      }, card.status),
      el("span", { class: "espaco" }),
      el("button", { class: "botao pequeno icone", "aria-label": "Subir", disabled: card.ordem === 1 ? "" : null, onclick: mover(-1) }, "↑"),
      el("button", { class: "botao pequeno icone", "aria-label": "Descer", disabled: card.ordem === total ? "" : null, onclick: mover(1) }, "↓"),
    ),
  );
}

async function abrir(card) {
  const resultado = await editarCard(card);
  if (resultado !== undefined) carregar();
}

function desenhar() {
  const filtro = $("#filtro-tipo").value;
  const hoje = isoDia(new Date());
  const colunas = Array.from({ length: DIAS_VISIVEIS }, (_, i) => {
    const dia = somarDias(inicio, i);
    const doDia = cards.filter((c) => c.dia === dia);
    const visiveis = doDia.filter((c) => !filtro || c.tipo === filtro);
    const postados = doDia.filter((c) => c.status === "postado").length;
    return el("section", { class: `coluna${dia === hoje ? " coluna-hoje" : ""}` },
      el("header", { class: "coluna-topo" },
        el("div", {},
          el("b", {}, diaCurto(dia)),
          dia === hoje ? el("span", { class: "selo-hoje" }, "Hoje") : null,
        ),
        el("span", { class: "suave pequeno-texto" }, doDia.length ? `${postados}/${doDia.length} postados` : "vazio"),
      ),
      el("div", { class: "coluna-cards" },
        visiveis.length ? visiveis.map((c) => cartaoMini(c, doDia.length)) : el("p", { class: "suave coluna-vazia" }, "Nenhum card."),
      ),
      el("button", { class: "botao fantasma largo adicionar-coluna", onclick: () => abrir({ dia }) }, "+ Adicionar"),
    );
  });
  $("#quadro").replaceChildren(...colunas);
  const fim = somarDias(inicio, DIAS_VISIVEIS - 1);
  $("#periodo").textContent = `${diaCurto(inicio)} a ${diaCurto(fim)}`;
}

async function carregar() {
  const fim = somarDias(inicio, DIAS_VISIVEIS - 1);
  try {
    ({ cards } = await api(`/api/painel/gestor?de=${inicio}&ate=${fim}`));
    desenhar();
  } catch (e) {
    $("#quadro").replaceChildren(el("div", { class: "vazio" }, e.message));
  }
}

$("#semana-anterior").addEventListener("click", () => { inicio = somarDias(inicio, -DIAS_VISIVEIS); carregar(); });
$("#semana-seguinte").addEventListener("click", () => { inicio = somarDias(inicio, DIAS_VISIVEIS); carregar(); });
$("#hoje").addEventListener("click", () => { inicio = isoDia(new Date()); carregar(); });
$("#filtro-tipo").addEventListener("change", desenhar);
$("#novo-card").addEventListener("click", () => abrir({}));
$("#sair").addEventListener("click", async () => {
  await fetch("/api/painel/sessao", { method: "DELETE" });
  location.replace("/login.html");
});

fetch("/api/painel/sessao").then((r) => {
  if (!r.ok) return location.replace("/login.html");
  $("#quadro").replaceChildren(el("div", { class: "carregando" }, "Carregando…"));
  carregar();
});
