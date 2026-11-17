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

// ---------- abas ----------

const carregadas = new Set();
function abrirAba(nome) {
  for (const botao of document.querySelectorAll(".abas button")) {
    botao.setAttribute("aria-selected", String(botao.dataset.aba === nome));
  }
  for (const secao of document.querySelectorAll(".aba")) secao.hidden = secao.id !== `aba-${nome}`;
  try { localStorage.setItem("aba", nome); } catch {}
  if (!carregadas.has(nome)) {
    carregadas.add(nome);
    ({ stories: iniciarStories, ideias: iniciarIdeias, prints: carregarPrints, reels: iniciarReels, config: carregarConfig })[nome]();
  }
}
for (const botao of document.querySelectorAll(".abas button")) {
  botao.addEventListener("click", () => abrirAba(botao.dataset.aba));
}

$("#sair").addEventListener("click", async () => {
  await fetch("/api/painel/sessao", { method: "DELETE" });
  location.replace("/login.html");
});

// ---------- stories ----------

function chavePostados(data) {
  return `postados-${data}`;
}
function lerPostados(data) {
  try { return new Set(JSON.parse(localStorage.getItem(chavePostados(data)) || "[]")); } catch { return new Set(); }
}
function gravarPostados(data, conjunto) {
  try { localStorage.setItem(chavePostados(data), JSON.stringify([...conjunto])); } catch {}
}

function textoDoStory(s) {
  return [
    `Story ${s.numero} — ${s.horario} — ${s.tipo}`,
    s.cena && `Cena: ${s.cena}`,
    s.fala && `Fala: "${s.fala}"`,
    s.textoNaTela && `Texto na tela: ${s.textoNaTela}`,
    s.interacao && `Interação: ${s.interacao}`,
    s.produto && `Produto: ${s.produto}`,
  ].filter(Boolean).join("\n");
}

function campo(rotulo, valor, classe = "") {
  if (!valor) return null;
  return el("div", { class: "campo" }, el("b", {}, rotulo), el("div", { class: classe }, valor));
}

function mostrarStories(roteiro) {
  const alvo = $("#stories-conteudo");
  const postados = lerPostados(roteiro.data);
  const r = roteiro.resumo;

  const resumo = el("div", { class: "cartao hud" },
    el("dl", { class: "resumo" },
      el("dt", {}, "Época"), el("dd", {}, r.epoca),
      el("dt", {}, "Estratégia do dia"), el("dd", {}, r.estrategiaDoDia),
      el("dt", {}, "O que as concorrentes fizeram"), el("dd", {}, r.oQueAsConcorrentesFizeram),
      r.observacoes ? [el("dt", {}, "Observações"), el("dd", {}, r.observacoes)] : null,
    ),
    roteiro.avisos?.length ? el("p", { class: "avisos" }, roteiro.avisos.join(" · ")) : null,
    el("p", { class: "suave pequeno-texto" },
      `${roteiro.stories.length} stories · ${roteiro.printsUsados} print(s) usados · gerado às `,
      new Date(roteiro.geradoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    ),
  );

  const cartoes = roteiro.stories.map((s) => {
    const cartao = el("article", { class: `cartao story${postados.has(s.numero) ? " postado" : ""}` },
      el("div", { class: "story-topo" },
        el("span", { class: "numero" }, String(s.numero)),
        el("div", { class: "info" },
          el("div", {}, el("span", { class: "horario" }, s.horario), el("span", { class: "etiqueta" }, s.tipo)),
          el("p", { class: "objetivo" }, s.objetivo),
        ),
      ),
      campo("Cena", s.cena),
      campo("Fala", s.fala, "fala"),
      campo("Texto na tela", s.textoNaTela, "tela"),
      campo("Interação", s.interacao),
      campo("Produto", s.produto),
      campo("Inspiração", s.inspiracao, "suave"),
    );
    const marcar = el("label", { class: "check" },
      el("input", {
        type: "checkbox",
        ...(postados.has(s.numero) ? { checked: "" } : {}),
        onchange: (e) => {
          if (e.target.checked) postados.add(s.numero); else postados.delete(s.numero);
          gravarPostados(roteiro.data, postados);
          cartao.classList.toggle("postado", e.target.checked);
        },
      }),
      "Postado",
    );
    cartao.append(el("div", { class: "acoes" },
      el("button", { class: "botao pequeno", onclick: () => copiar(textoDoStory(s)) }, "Copiar"),
      marcar,
    ));
    return cartao;
  });

  alvo.replaceChildren(resumo, ...cartoes);
}

async function carregarStories(data) {
  const alvo = $("#stories-conteudo");
  if (!data) {
    alvo.replaceChildren(el("div", { class: "vazio" }, "Ainda não há roteiro de stories. Toque em Gerar agora ou espere amanhã cedo."));
    return;
  }
  alvo.replaceChildren(el("div", { class: "carregando" }, "Carregando…"));
  try {
    mostrarStories(await api(`/api/painel/historico?tipo=stories&data=${data}`));
  } catch (e) {
    alvo.replaceChildren(el("div", { class: "vazio" }, e.message));
  }
}

async function iniciarStories(selecionar) {
  const { datas } = await api("/api/painel/historico?tipo=stories").catch((e) => (avisar(e.message), { datas: [] }));
  preencherDatas($("#stories-data"), datas, "Nenhum roteiro ainda");
  if (selecionar) $("#stories-data").value = selecionar;
  await carregarStories($("#stories-data").value);
}

$("#stories-data").addEventListener("change", (e) => carregarStories(e.target.value));
$("#stories-gerar").addEventListener("click", (e) =>
  comBotaoOcupado(e.target, "Gerando… (alguns minutos)", async () => {
    $("#stories-conteudo").replaceChildren(el("div", { class: "carregando" }, "A IA está montando o roteiro. Pode levar alguns minutos; não feche a página."));
    try {
      const { roteiro } = await api("/api/stories", { method: "POST" });
      await iniciarStories(roteiro.data);
      avisar("Roteiro pronto");
    } catch (erro) {
      await carregarStories($("#stories-data").value);
      throw erro;
    }
  }),
);

// ---------- ideias ----------

function rotuloIdeia(id) {
  const [data, hora] = id.split("T");
  const [ano, mes, dia] = data.split("-");
  const [h, m] = hora.split("-");
  return `${dia}/${mes}/${ano} às ${h}:${m}`;
}

function mostrarIdeia(ideia) {
  const secoes = ideia.texto.split(/\n(?=\*(?:🔥|📱|🎬|🖼️))/u).map((x) => x.trim()).filter(Boolean);
  const cartoes = secoes.map((secao, i) => el("div", { class: i === 0 ? "cartao hud" : "cartao" },
    el("div", { class: "mensagem" }, whatsappParaNos(secao)),
    el("div", { class: "acoes" }, el("button", { class: "botao pequeno", onclick: () => copiar(secao) }, "Copiar")),
  ));
  const cabecalho = el("p", { class: "suave pequeno-texto" },
    ideia.tema ? `Tema pedido: ${ideia.tema}` : "Tema escolhido pela IA");
  const fontes = ideia.fontes?.length
    ? el("div", { class: "cartao" },
        el("h3", {}, "Fontes da pesquisa"),
        el("ul", { class: "fontes" }, ideia.fontes.map((f) =>
          el("li", {}, el("a", { href: f.url, target: "_blank", rel: "noopener noreferrer" }, f.titulo)))),
      )
    : null;
  $("#ideias-conteudo").replaceChildren(cabecalho, ...cartoes, ...(fontes ? [fontes] : []));
}

async function carregarIdeia(id) {
  const alvo = $("#ideias-conteudo");
  if (!id) {
    alvo.replaceChildren(el("div", { class: "vazio" }, "Nenhuma ideia ainda. Toque em Gerar ideia."));
    return;
  }
  alvo.replaceChildren(el("div", { class: "carregando" }, "Carregando…"));
  try {
    mostrarIdeia(await api(`/api/painel/historico?tipo=ideias&data=${encodeURIComponent(id)}`));
  } catch (e) {
    alvo.replaceChildren(el("div", { class: "vazio" }, e.message));
  }
}

async function iniciarIdeias(selecionar) {
  const { datas } = await api("/api/painel/historico?tipo=ideias").catch((e) => (avisar(e.message), { datas: [] }));
  const select = $("#ideias-data");
  select.replaceChildren(
    ...(datas.length ? datas.map((id) => el("option", { value: id }, rotuloIdeia(id))) : [el("option", { value: "" }, "Nenhuma ideia ainda")]),
  );
  if (selecionar) select.value = selecionar;
  await carregarIdeia(select.value);
}

$("#ideias-data").addEventListener("change", (e) => carregarIdeia(e.target.value));
$("#ideia-gerar").addEventListener("click", (e) =>
  comBotaoOcupado(e.target, "Pesquisando e criando… (1 a 3 min)", async () => {
    $("#ideias-conteudo").replaceChildren(el("div", { class: "carregando" }, "A IA está pesquisando o que está em alta e criando o conteúdo. Não feche a página."));
    try {
      const { ideia } = await api("/api/ideias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tema: $("#ideia-tema").value }),
      });
      await iniciarIdeias(ideia.id);
      avisar("Ideia pronta");
    } catch (erro) {
      await carregarIdeia($("#ideias-data").value);
      throw erro;
    }
  }),
);

// ---------- prints ----------

/** Reduz o print para no máximo 1080 px de largura, em JPEG, antes de enviar. */
async function comprimir(arquivo) {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, 1080 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolver) => canvas.toBlob(resolver, "image/jpeg", 0.82));
}

async function carregarPrints() {
  const alvo = $("#prints-lista");
  try {
    const { ontem, hoje, prints } = await api("/api/painel/prints");
    const grupos = [[hoje, "Enviados hoje (entram no roteiro de amanhã)"], [ontem, "Enviados ontem (entram no roteiro de hoje)"]];
    alvo.replaceChildren(...grupos.map(([data, titulo]) => {
      const lista = prints.filter((p) => p.includes(`/${data}/`));
      return el("div", {},
        el("h2", {}, titulo, " ", el("span", { class: "suave" }, `(${lista.length})`)),
        lista.length
          ? el("div", { class: "grade-prints" }, lista.map((caminho) => el("div", { class: "print" },
              el("img", { src: `/api/painel/prints?caminho=${encodeURIComponent(caminho)}`, alt: "Print de story", loading: "lazy" }),
              el("button", {
                "aria-label": "Apagar print",
                onclick: async () => {
                  if (!confirm("Apagar este print?")) return;
                  await api(`/api/painel/prints?caminho=${encodeURIComponent(caminho)}`, { method: "DELETE" }).catch((e) => avisar(e.message));
                  carregarPrints();
                },
              }, "×"),
            )))
          : el("p", { class: "suave" }, "Nenhum."),
      );
    }));
  } catch (e) {
    alvo.replaceChildren(el("p", { class: "avisos" }, e.message));
  }
}

$("#prints-arquivos").addEventListener("change", async (e) => {
  const arquivos = [...e.target.files];
  const status = $("#prints-status");
  let enviados = 0;
  for (const arquivo of arquivos) {
    status.textContent = `Enviando ${enviados + 1} de ${arquivos.length}…`;
    try {
      const imagem = await comprimir(arquivo);
      await api("/api/painel/prints", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: imagem });
      enviados++;
    } catch (erro) {
      avisar(`${arquivo.name}: ${erro.message}`);
    }
  }
  status.textContent = `${enviados} de ${arquivos.length} print(s) enviados.`;
  e.target.value = "";
  carregarPrints();
});

// ---------- reels ----------

async function carregarReels(data) {
  const alvo = $("#reels-conteudo");
  if (!data) {
    alvo.replaceChildren(el("div", { class: "vazio" }, "Ainda não há relatório de reels."));
    return;
  }
  alvo.replaceChildren(el("div", { class: "carregando" }, "Carregando…"));
  try {
    const relatorio = await api(`/api/painel/historico?tipo=reels&data=${data}`);
    alvo.replaceChildren(
      el("p", { class: "suave pequeno-texto" }, `Período: ${relatorio.periodo}`),
      ...relatorio.partes.map((parte, i) => el("div", { class: i === 0 ? "cartao hud" : "cartao" },
        el("div", { class: "mensagem" }, whatsappParaNos(parte)),
        el("div", { class: "acoes" }, el("button", { class: "botao pequeno", onclick: () => copiar(parte) }, "Copiar")),
      )),
    );
  } catch (e) {
    alvo.replaceChildren(el("div", { class: "vazio" }, e.message));
  }
}

async function iniciarReels(selecionar) {
  const { datas } = await api("/api/painel/historico?tipo=reels").catch((e) => (avisar(e.message), { datas: [] }));
  preencherDatas($("#reels-data"), datas, "Nenhum relatório ainda");
  if (selecionar) $("#reels-data").value = selecionar;
  await carregarReels($("#reels-data").value);
}

$("#reels-data").addEventListener("change", (e) => carregarReels(e.target.value));
$("#reels-gerar").addEventListener("click", (e) =>
  comBotaoOcupado(e.target, "Gerando… (alguns minutos)", async () => {
    $("#reels-conteudo").replaceChildren(el("div", { class: "carregando" }, "A IA está analisando as lojas. Pode levar alguns minutos; não feche a página."));
    try {
      const { relatorio } = await api("/api/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enviar: $("#reels-enviar").checked }),
      });
      await iniciarReels(relatorio.geradoEm.slice(0, 10));
      avisar("Relatório pronto");
    } catch (erro) {
      await carregarReels($("#reels-data").value);
      throw erro;
    }
  }),
);

// ---------- configurações ----------

async function carregarConfig() {
  const form = $("#form-config");
  try {
    const c = await api("/api/painel/config");
    form.contas.value = c.contas.contasReferencia.map((x) => `@${x}`).join("\n");
    form.quantidadeStories.value = c.contas.quantidadeStories;
    form.quantidadeRoteiros.value = c.contas.quantidadeRoteiros;
    form.diasAnalise.value = c.contas.diasAnalise;
    form.estoque.value = c.estoque;
    form.loja.value = c.loja;
    form.transcricoes.value = c.transcricoes;
  } catch (e) {
    avisar(e.message);
  }
}

$("#form-config").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  const status = $("#config-status");
  comBotaoOcupado(form.querySelector("button[type=submit]"), "Salvando…", async () => {
    await api("/api/painel/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loja: form.loja.value,
        estoque: form.estoque.value,
        transcricoes: form.transcricoes.value,
        contas: {
          contasReferencia: form.contas.value.split(/[\s,]+/).filter(Boolean),
          quantidadeStories: Number(form.quantidadeStories.value),
          quantidadeRoteiros: Number(form.quantidadeRoteiros.value),
          diasAnalise: Number(form.diasAnalise.value),
        },
      }),
    });
    status.textContent = `Salvo às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    await carregarConfig();
  });
});

// ---------- início ----------

fetch("/api/painel/sessao").then((r) => {
  if (!r.ok) return location.replace("/login.html");
  let inicial = "stories";
  try { inicial = localStorage.getItem("aba") || "stories"; } catch {}
  abrirAba(inicial);
});
