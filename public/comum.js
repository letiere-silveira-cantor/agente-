"use strict";

// ---------- utilidades ----------

async function api(caminho, opcoes = {}) {
  const resposta = await fetch(caminho, {
    ...opcoes,
    headers: { "X-Painel": "1", ...(opcoes.headers || {}) },
  });
  if (resposta.status === 401) {
    location.replace("/login.html");
    throw new Error("sessão expirada");
  }
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(corpo.erro || `Erro ${resposta.status}`);
  return corpo;
}

const $ = (seletor) => document.querySelector(seletor);

function el(tag, atributos = {}, ...filhos) {
  const no = document.createElement(tag);
  for (const [chave, valor] of Object.entries(atributos)) {
    if (valor == null || valor === false) continue;
    if (chave === "class") no.className = valor;
    else if (chave.startsWith("on")) no.addEventListener(chave.slice(2), valor);
    else no.setAttribute(chave, valor);
  }
  for (const filho of filhos.flat()) if (filho != null && filho !== false) no.append(filho);
  return no;
}

let timerAviso;
function avisar(texto) {
  const aviso = $("#aviso");
  aviso.textContent = texto;
  aviso.hidden = false;
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => (aviso.hidden = true), 3500);
}

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    avisar("Copiado");
  } catch {
    avisar("Não consegui copiar");
  }
}

function formatarData(iso) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}

function preencherDatas(select, datas, rotuloVazio) {
  select.replaceChildren(
    ...(datas.length ? datas.map((d) => el("option", { value: d }, formatarData(d))) : [el("option", { value: "" }, rotuloVazio)]),
  );
}

/** Texto no formato do WhatsApp (*negrito*, _itálico_) para HTML seguro. */
function whatsappParaNos(texto) {
  const frag = document.createDocumentFragment();
  const padrao = /(\*[^*\n]+\*|_[^_\n]+_|https?:\/\/[^\s)]+)/g;
  let ultimo = 0;
  for (const m of texto.matchAll(padrao)) {
    frag.append(texto.slice(ultimo, m.index));
    const t = m[0];
    if (t.startsWith("*")) frag.append(el("strong", {}, t.slice(1, -1)));
    else if (t.startsWith("_")) frag.append(el("em", {}, t.slice(1, -1)));
    else frag.append(el("a", { href: t, target: "_blank", rel: "noopener noreferrer" }, t));
    ultimo = m.index + t.length;
  }
  frag.append(texto.slice(ultimo));
  return frag;
}

async function comBotaoOcupado(botao, textoOcupado, acao) {
  const original = botao.textContent;
  botao.disabled = true;
  botao.textContent = textoOcupado;
  try {
    await acao();
  } catch (e) {
    avisar(e.message);
  } finally {
    botao.disabled = false;
    botao.textContent = original;
  }
}

// ---------- datas ----------

/** AAAA-MM-DD de uma data, no horário local do aparelho. */
function isoDia(data) {
  const p = (n) => String(n).padStart(2, "0");
  return `${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}`;
}

function somarDias(iso, n) {
  const [a, m, d] = iso.split("-").map(Number);
  return isoDia(new Date(a, m - 1, d + n));
}

function diaCurto(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

// ---------- gestor: editor de card ----------

const TIPOS_CARD = { story: "Story", reels: "Reels", post: "Post", outro: "Outro" };
const STATUS_CARD = ["a fazer", "gravado", "postado"];

/**
 * Abre a janela para criar ou editar um card do gestor.
 * - Sem `card.id`: cria (usado pelo botão "Adicionar ao gestor").
 * - Com `card.id`: edita e pode mover de dia ou de posição.
 * Resolve com o card salvo, ou null se cancelar/apagar.
 */
function editarCard(card) {
  const novo = !card.id;
  return new Promise((resolver) => {
    const dialogo = el("dialog", { class: "janela" });
    const f = (rotulo, campo) => el("label", {}, rotulo, campo);

    const dia = el("input", { type: "date", required: "", value: card.dia || somarDias(isoDia(new Date()), 1) });
    const posicao = el("select", {});
    const tipo = el("select", {}, Object.entries(TIPOS_CARD).map(([v, r]) => el("option", { value: v }, r)));
    tipo.value = card.tipo || "story";
    const horario = el("input", { type: "time", value: card.horario || "" });
    const status = el("select", {}, STATUS_CARD.map((s) => el("option", { value: s }, s)));
    status.value = card.status || "a fazer";
    const titulo = el("input", { type: "text", maxlength: "200", required: "", value: card.titulo || "" });
    const conteudo = el("textarea", { rows: "10" });
    conteudo.value = card.conteudo || "";

    async function atualizarPosicoes() {
      posicao.replaceChildren(el("option", { value: "" }, "Carregando…"));
      let total = 0;
      try {
        total = (await api(`/api/painel/gestor?contar=${dia.value}`)).total;
      } catch {}
      const mesmoDia = !novo && dia.value === card.dia;
      const vagas = mesmoDia ? total : total + 1;
      posicao.replaceChildren(...Array.from({ length: vagas }, (_, i) =>
        el("option", { value: String(i + 1) }, i + 1 === vagas && !mesmoDia ? `${i + 1}º (no fim)` : `${i + 1}º`)));
      posicao.value = mesmoDia ? String(card.ordem) : String(vagas);
    }
    dia.addEventListener("change", atualizarPosicoes);

    const fechar = (valor) => { dialogo.close(); dialogo.remove(); resolver(valor); };
    const erro = el("p", { class: "erro", hidden: "" });

    const salvar = el("button", { type: "submit", class: "botao primario" }, novo ? "Adicionar" : "Salvar");
    const form = el("form", { method: "dialog" },
      el("h2", {}, novo ? "Adicionar ao gestor" : "Editar card"),
      card.origem ? el("p", { class: "suave pequeno-texto" }, `Origem: ${card.origem}`) : null,
      el("div", { class: "grade-numeros" }, f("Dia", dia), f("Posição na sequência", posicao)),
      el("div", { class: "grade-numeros" }, f("Tipo", tipo), f("Horário", horario), novo ? null : f("Status", status)),
      f("Título", titulo),
      f("Conteúdo (pode editar à vontade)", conteudo),
      erro,
      el("div", { class: "acoes-janela" },
        novo ? null : el("button", {
          type: "button", class: "botao fantasma perigo",
          onclick: async () => {
            if (!confirm("Apagar este card?")) return;
            await api(`/api/painel/gestor?id=${card.id}`, { method: "DELETE" }).catch((e) => avisar(e.message));
            fechar(null);
          },
        }, "Apagar"),
        el("span", { class: "espaco" }),
        el("button", { type: "button", class: "botao", onclick: () => fechar(null) }, "Cancelar"),
        salvar,
      ),
    );

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      erro.hidden = true;
      const dados = {
        dia: dia.value, posicao: Number(posicao.value) || undefined, tipo: tipo.value, horario: horario.value,
        titulo: titulo.value, conteudo: conteudo.value, origem: card.origem || "",
        ...(novo ? {} : { status: status.value }),
      };
      salvar.disabled = true;
      try {
        const { card: salvo } = await api(novo ? "/api/painel/gestor" : `/api/painel/gestor?id=${card.id}`, {
          method: novo ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dados),
        });
        if (novo) avisar(`Adicionado em ${diaCurto(salvo.dia)}, ${salvo.ordem}º da sequência`);
        fechar(salvo);
      } catch (e2) {
        erro.textContent = e2.message;
        erro.hidden = false;
        salvar.disabled = false;
      }
    });

    dialogo.addEventListener("cancel", (e) => { e.preventDefault(); fechar(null); });
    dialogo.append(form);
    document.body.append(dialogo);
    dialogo.showModal();
    atualizarPosicoes();
  });
}

/** Botão "Adicionar ao gestor" para colocar nos cartões do agente. */
function botaoGestor(dadosDoCard) {
  return el("button", { class: "botao pequeno gestor-add", onclick: () => editarCard(dadosDoCard()) }, "+ Gestor");
}
