// Calculadora Simples Nacional — IBS/CBS.
// O DAS é estimado localmente pela LC 123; o IBS/CBS da operação vem do motor
// oficial da Receita Federal (API do Simples Nacional, NT 2026.005).
(() => {
  "use strict";

  // Base da API do motor do Simples (Render). PRECISA do sufixo "/api": as rotas
  // são /api/versao e /api/calculadora/... — sem ele, tudo responde 404 e a página
  // nasce "motor offline". Ordem: ?api= da URL > window.API_BASE > padrão.
  const HOST_PADRAO = "https://calculadora-simples-api-1.onrender.com";
  const API = (() => {
    const daUrl = new URLSearchParams(location.search).get("api");
    let base = String(daUrl || window.API_BASE || HOST_PADRAO).trim().replace(/\/+$/, "");
    if (!/\/api$/.test(base)) base += "/api";
    return base;
  })();

  // O plano gratuito do Render hiberna: o primeiro acesso depois de um tempo
  // parado pode levar ~1 min. Esperamos mais que o padrão do navegador.
  const ESPERA_MS = 90000;
  async function buscar(caminho, opcoes) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ESPERA_MS);
    try {
      return await fetch(API + caminho, Object.assign({}, opcoes, { signal: ctl.signal }));
    } finally {
      clearTimeout(t);
    }
  }
  // cbsFixo: percentual de CBS já escolhido (estimado ou digitado). Null = recalcular pelo anexo.
  const state = { atividades: [], versao: null, cbsFixo: null, calculando: false };

  const $ = (sel) => document.querySelector(sel);
  const nfMoney = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const nfPct = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

  // Alíquotas nominais e deduções da LC 123/2006 (Anexos I a V).
  // cbs = fração média do DAS correspondente a PIS+Cofins em 2027 (vira CBS), estimativa.
  const ANEXOS = {
    I: { cbs: 15.5, faixas: [[180000, 4, 0], [360000, 7.3, 5940], [720000, 9.5, 13860], [1800000, 10.7, 22500], [3600000, 14.3, 87300], [4800000, 19, 378000]] },
    II: { cbs: 15, faixas: [[180000, 4.5, 0], [360000, 7.8, 5940], [720000, 10, 13860], [1800000, 11.2, 22500], [3600000, 14.7, 85500], [4800000, 30, 720000]] },
    III: { cbs: 14.5, faixas: [[180000, 6, 0], [360000, 11.2, 9360], [720000, 13.5, 17640], [1800000, 16, 35640], [3600000, 21, 125640], [4800000, 33, 648000]] },
    IV: { cbs: 16, faixas: [[180000, 4.5, 0], [360000, 9, 8100], [720000, 10.2, 12420], [1800000, 14, 39780], [3600000, 22, 183780], [4800000, 33, 828000]] },
    V: { cbs: 14, faixas: [[180000, 15.5, 0], [360000, 18, 4500], [720000, 19.5, 9900], [1800000, 20.5, 17100], [3600000, 23, 62100], [4800000, 30.5, 540000]] },
  };
  const LIMITE = 4800000;
  const SUBLIMITE = 3600000;

  function parseNum(v) {
    const s = String(v == null ? "" : v).trim().replace(/[^\d,.-]/g, "");
    if (!s) return NaN;
    if (!s.includes(",") && /^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ""));
    return Number(s.replace(/\./g, "").replace(",", "."));
  }
  const money = (n) => (Number.isFinite(n) ? nfMoney.format(n) : "—");
  const pct = (n) => (Number.isFinite(n) ? nfPct.format(n) + "%" : "—");
  const pctInput = (n) => n.toFixed(4).replace(".", ",");
  const valor2 = (n) => (Number.isFinite(n) ? n.toFixed(2) : "0.00");
  const valor4 = (n) => (Number.isFinite(n) ? n.toFixed(4) : "0.0000");

  function hojeISO() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function atualAtividade() {
    return state.atividades.find((a) => a.codigo === $("#atividade").value) || null;
  }

  function fatorR() {
    const rbt12 = parseNum($("#rbt12").value);
    const folha = parseNum($("#folha").value);
    return rbt12 > 0 && Number.isFinite(folha) ? folha / rbt12 : NaN;
  }

  // ---------- DAS (LC 123) ----------
  function dadosDas() {
    const rbt12 = parseNum($("#rbt12").value);
    const folha = parseNum($("#folha").value);
    const anexo = $("#anexo").value;
    const atividade = atualAtividade();
    if (atividade && atividade.codigo === "90") return { zero: true };
    if (!(rbt12 > 0) || !ANEXOS[anexo]) return null;

    const tabela = ANEXOS[anexo];

    // Fora do Simples ou acima do sublimite: não se estima o DAS. Extrapolar a
    // última faixa produziria uma alíquota inventada (ex.: 11,44% com RBT12 5 mi).
    if (rbt12 > LIMITE) {
      return { fora: true, motivo: "RBT12 acima de R$ 4,8 milhões: a empresa não está no Simples Nacional; não há DAS a estimar." };
    }
    if (rbt12 > SUBLIMITE) {
      return { fora: true, motivo: "RBT12 acima do sublimite de R$ 3,6 milhões: ICMS/ISS saem do DAS, então a alíquota efetiva do anexo não se aplica." };
    }

    const faixa = tabela.faixas.find((f) => rbt12 <= f[0]) || tabela.faixas[tabela.faixas.length - 1];
    const efetiva = ((rbt12 * faixa[1] / 100 - faixa[2]) / rbt12) * 100;
    const avisos = [];

    const fr = Number.isFinite(folha) ? folha / rbt12 : NaN;
    if (atividade && atividade.sujeitaFatorR && Number.isFinite(fr)) {
      const sugerido = fr >= 0.28 ? "III" : "V";
      if (sugerido !== anexo) avisos.push(`Fator R de ${pct(fr * 100)} indica Anexo ${sugerido}; ajuste o anexo para o DAS correto.`);
    }
    return { rbt12, folha, anexo, efetiva, cbsRate: efetiva * tabela.cbs / 100, avisos, fr };
  }

  function somaBases() {
    return [...document.querySelectorAll("#itens .base")].reduce((s, i) => {
      const n = parseNum(i.value);
      return s + (Number.isFinite(n) ? n : 0);
    }, 0);
  }

  function renderDas() {
    const d = dadosDas();
    const base = somaBases();
    if (!d) {
      $("#aliqDas").textContent = "—";
      $("#dasValor").textContent = "—";
      $("#parcelaCbs").textContent = "—";
      $("#dasFonte").textContent = "Informe o RBT12 para estimar o DAS.";
      return;
    }
    if (d.zero) {
      $("#aliqDas").textContent = "Não tributável";
      $("#dasValor").textContent = money(0);
      $("#parcelaCbs").textContent = money(0);
      $("#dasFonte").textContent = "Atividade 90: operação não tributável; sem DAS sobre esta receita.";
      return;
    }
    if (d.fora) {
      $("#aliqDas").textContent = "Não se aplica";
      $("#dasValor").textContent = "—";
      $("#parcelaCbs").textContent = "—";
      $("#dasFonte").textContent = d.motivo;
      return;
    }

    if (state.cbsFixo == null) $("#pCBS").value = pctInput(d.cbsRate);
    const cbs = parseNum($("#pCBS").value);
    $("#aliqDas").textContent = pct(d.efetiva);
    $("#dasValor").textContent = money(base * d.efetiva / 100);
    $("#parcelaCbs").textContent = money(base * (Number.isFinite(cbs) ? cbs : 0) / 100);

    const partes = [];
    if (d.avisos.length) partes.push(d.avisos.join(" "));
    const atual = atualAtividade();
    if (Number.isFinite(d.fr) && atual && atual.sujeitaFatorR) partes.push(`Fator R: ${pct(d.fr * 100)}.`);
    partes.push(`Estimativa: ${pct(ANEXOS[d.anexo].cbs)} do DAS vira CBS; IBS-teste de 0,1%. Confira no PGDAS-D.`);
    $("#dasFonte").textContent = partes.join(" ");
  }

  // ---------- Itens ----------
  function renumerar() {
    [...document.querySelectorAll("#itens .item")].forEach((row, i) => {
      row.querySelector(".item-num").textContent = String(i + 1);
      row.querySelectorAll("input").forEach((inp) => inp.setAttribute("aria-label", inp.dataset.rotulo + " do item " + (i + 1)));
    });
  }

  function criarItem(dados = {}) {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML =
      '<span class="item-num" aria-hidden="true"></span>' +
      '<label>Base (R$)<input class="base" data-rotulo="Base de cálculo" inputmode="decimal" autocomplete="off" placeholder="1.000,00"></label>' +
      '<label>NCM<input class="ncm" data-rotulo="NCM" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="22030000"></label>' +
      '<label>cClassTrib<input class="cct" data-rotulo="cClassTrib" inputmode="numeric" autocomplete="off" maxlength="6" value="000001"></label>' +
      '<button type="button" class="remover" title="Remover item" aria-label="Remover item">×</button>';
    row.querySelector(".base").value = dados.base || "";
    row.querySelector(".ncm").value = dados.ncm || "";
    row.querySelector(".cct").value = dados.cct || "000001";
    row.querySelector(".remover").addEventListener("click", () => {
      if (document.querySelectorAll("#itens .item").length === 1) return;
      row.remove();
      renumerar();
      renderDas();
    });
    row.querySelector(".base").addEventListener("input", renderDas);
    $("#itens").append(row);
    renumerar();
  }

  function lerItens() {
    return [...document.querySelectorAll("#itens .item")].map((row, i) => ({
      numero: i + 1,
      base: parseNum(row.querySelector(".base").value),
      ncm: row.querySelector(".ncm").value.replace(/\D/g, ""),
      cct: row.querySelector(".cct").value.replace(/\D/g, ""),
    }));
  }

  // ---------- Catálogo e versão ----------
  async function carregarVersao() {
    try {
      const r = await buscar("/versao", { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const v = await r.json();
      state.versao = v;
      $("#motor").textContent = "motor " + v.versaoApp + " · base " + v.versaoDb;
      $("#motor").className = "motor ok";
      $("#versao").textContent = "Motor oficial " + v.versaoApp + " · base " + v.versaoDb + " · " + (v.descricaoVersaoDb || "");
    } catch (e) {
      $("#motor").textContent = "motor offline";
      $("#motor").className = "motor erro";
      $("#versao").textContent = "Motor indisponível agora. Se o serviço do Render estava parado, ele acorda em até um minuto — recarregue a página.";
    }
  }

  async function carregarAtividades() {
    const data = $("#data").value || "2027-01-01";
    const doc = $("#tpDoc").value;
    const sel = $("#atividade");
    const anterior = sel.value;
    try {
      const r = await buscar("/calculadora/simples-nacional/atividades?data=" + encodeURIComponent(data), {
        headers: { Accept: "application/json" },
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const todas = await r.json();
      // O catálogo é por documento; sem filtro (ou documento fora do catálogo) mostra todas.
      state.atividades = todas.filter((a) => a.disponivel && (a.tpDocsAdmissiveis || []).map(String).includes(String(doc)));
      if (!state.atividades.length) state.atividades = todas.filter((a) => a.disponivel);
      sel.innerHTML = "";
      for (const a of state.atividades) {
        const opt = document.createElement("option");
        opt.value = a.codigo;
        opt.textContent = a.codigo + " — " + a.descricao;
        sel.append(opt);
      }
      // O placeholder existe só no HTML; se nenhum item casou com a data, repõe para não ficar vazio sem aviso.
      if (!state.atividades.length) {
        const vazio = document.createElement("option");
        vazio.value = "";
        vazio.textContent = "Sem atividade para esta data";
        sel.append(vazio);
      }
      const mantida = state.atividades.find((a) => a.codigo === anterior);
      sel.value = mantida ? anterior : (state.atividades[0] ? state.atividades[0].codigo : "");
      atualizarAjudaAtividade();
    } catch (e) {
      sel.innerHTML = '<option value="">Catálogo indisponível</option>';
      $("#atividadeAjuda").textContent = "Não foi possível carregar o catálogo. Confira a conexão com o motor e recarregue.";
    }
  }

  function sugerirAnexo() {
    const a = atualAtividade();
    if (!a) return;
    let sugerido = null;
    if (a.sujeitaFatorR) sugerido = fatorR() >= 0.28 ? 'III' : 'V';
    else if (a.anexoSemFatorR) {
      const m = a.anexoSemFatorR.match(/(III|II|IV|I|V)/);
      if (m) sugerido = m[1];
    }
    if (sugerido && ANEXOS[sugerido]) $('#anexo').value = sugerido;
  }

  // So mexe no anexo quando a atividade e sujeita ao Fator R.
  function sugerirAnexoPeloFatorR() {
    const a = atualAtividade();
    if (a && a.sujeitaFatorR) $('#anexo').value = fatorR() >= 0.28 ? 'III' : 'V';
  }

  function atualizarAjudaAtividade() {
    const a = atualAtividade();
    if (!a) {
      $("#atividadeAjuda").textContent = "Selecione a atividade da nota.";
      return;
    }
    const anexo = a.sujeitaFatorR ? "Anexo III ou V (Fator R)" : "Anexo " + (a.anexoSemFatorR || "-");
    $("#atividadeAjuda").textContent = anexo + " - documentos " + (a.tpDocsAdmissiveis || []).join(", ") + ".";
  }
  // ---------- Resultado ----------
  function falha(titulo, mensagem, itens) {
    const box = $("#resultado");
    box.innerHTML = "";
    const h2 = document.createElement("h2");
    h2.textContent = titulo;
    box.append(h2);
    if (mensagem) {
      const p = document.createElement("p");
      p.className = "dica";
      p.textContent = mensagem;
      box.append(p);
    }
    if (itens && itens.length) {
      const ul = document.createElement("ul");
      ul.className = "erros";
      for (const it of itens) {
        const li = document.createElement("li");
        const strong = document.createElement("strong");
        strong.textContent = it.titulo || "Erro";
        li.append(strong);
        if (it.detalhe) li.append(document.createTextNode(" " + it.detalhe));
        ul.append(li);
      }
      box.append(ul);
    }
  }

  function tile(rotulo, valor, classe) {
    const div = document.createElement("div");
    div.className = "tile" + (classe ? " " + classe : "");
    const s = document.createElement("span");
    s.textContent = rotulo;
    const strong = document.createElement("strong");
    strong.textContent = valor;
    div.append(s, strong);
    return div;
  }
  // ---------- Iniciar ----------
  function iniciar() {
    const hoje = hojeISO();
    const data = $("#data");
    data.min = "2027-01-01";
    data.value = hoje >= "2027-01-01" ? hoje : "2027-01-01";
    $("#apiHost").textContent = API.startsWith("http") ? API : location.origin + API;

    criarItem();
    limparResultado();
    carregarVersao();
    carregarAtividades().then(function () {
      sugerirAnexo();
      renderDas();
    });

    $("#rbt12").addEventListener("input", function () {
      sugerirAnexoPeloFatorR();
      renderDas();
    });
    $("#folha").addEventListener("input", function () {
      sugerirAnexoPeloFatorR();
      renderDas();
    });
    $("#anexo").addEventListener("change", function () {
      state.cbsFixo = null;
      renderDas();
    });
    $("#atividade").addEventListener("change", function () {
      sugerirAnexo();
      atualizarAjudaAtividade();
      renderDas();
    });
    $("#tpDoc").addEventListener("change", function () {
      carregarAtividades().then(function () {
        sugerirAnexo();
        renderDas();
      });
    });
    $("#data").addEventListener("change", function () {
      carregarAtividades().then(function () {
        sugerirAnexo();
        renderDas();
      });
    });
    // Só o campo de CBS fixa o percentual; mexer no IBS não deve congelar a CBS.
    $("#pCBS").addEventListener("input", function () {
      state.cbsFixo = $("#pCBS").value;
      renderDas();
    });
    $("#pIBS").addEventListener("input", renderDas);
    $("#reestimar").addEventListener("click", function () {
      state.cbsFixo = null;
      $("#pIBS").value = pctInput(0.1);
      renderDas();
    });
    $("#addItem").addEventListener("click", function () {
      const bases = document.querySelectorAll("#itens .base");
      const ultimo = bases[bases.length - 1];
      criarItem({ base: ultimo ? ultimo.value : "" });
      renderDas();
    });
    $("#form").addEventListener("submit", calcular);
  }

  function limparResultado() {
    const box = $("#resultado");

    box.innerHTML = "";
    const vazio = document.createElement("div");
    vazio.className = "vazio";
    const h2 = document.createElement("h2");
    h2.textContent = "Resultado";
    const p = document.createElement("p");
    p.textContent = "Preencha os dados e clique em Calcular pelo motor oficial.";
    vazio.append(h2, p);
    box.append(vazio);
  }

  function renderResultado(j, enviado) {
    const box = $("#resultado");
    box.innerHTML = "";
    const objetos = Array.isArray(j.objetos) ? j.objetos : [];
    if (!objetos.length) {
      falha("Sem itens calculados", "O motor respondeu sem itens. Confira a operação.", []);
      return;
    }

    const ibs = Number(j.total && j.total.vIBSSNtot != null ? j.total.vIBSSNtot : 0);
    const cbs = Number(j.total && j.total.vCBSSNtot != null ? j.total.vCBSSNtot : 0);
    const baseTotal = Number(j.total && j.total.vRBSNtot != null ? j.total.vRBSNtot : enviado.bases.reduce(function (s, b) { return s + b; }, 0));
    const is = Number(j.total && j.total.totalIs != null ? j.total.totalIs : 0);
    const d = dadosDas();
    const dasAplicavel = d && !d.zero && !d.fora && Number.isFinite(d.efetiva);
    const dasOperacao = dasAplicavel ? baseTotal * d.efetiva / 100 : null;

    const h2 = document.createElement("h2");
    h2.textContent = "Resultado";
    box.append(h2);

    const resumo = document.createElement("div");
    resumo.className = "resumo";
    resumo.append(
      tile("Base da operação", money(baseTotal), ""),
      tile("IBS", money(ibs), ""),
      tile("CBS", money(cbs), ""),
      tile("Crédito ao comprador (IBS + CBS)", money(ibs + cbs), "destaque")
    );
    box.append(resumo);

    const compara = document.createElement("p");
    compara.className = "dica";
    let textoDas;
    if (d && d.zero) textoDas = "Atividade 90: operação não tributável, sem DAS sobre esta receita.";
    else if (d && d.fora) textoDas = "DAS não estimado: " + d.motivo;
    else if (dasAplicavel) textoDas = "DAS estimado sobre a mesma base: " + money(dasOperacao) +
      " (alíquota efetiva " + pct(d.efetiva) + ", Anexo " + d.anexo + ").";
    else textoDas = "Informe o RBT12 para estimar o DAS sobre esta base.";
    compara.textContent = textoDas + (is > 0 ? " Imposto Seletivo informado: " + money(is) + "." : "");
    box.append(compara);

    const tabela = document.createElement("table");
    tabela.className = "tabela";
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    for (const t of ["Item", "Base", "IBS", "CBS", "Situação"]) {
      const th = document.createElement("th");
      th.textContent = t;
      trh.append(th);
    }
    thead.append(trh);
    const tbody = document.createElement("tbody");
    for (const o of objetos) {
      const tr = document.createElement("tr");
      const tdNum = document.createElement("td");
      tdNum.textContent = String(o.nObj);
      const tdBase = document.createElement("td");
      tdBase.className = "num";
      tdBase.textContent = money(Number(o.tribCalc && o.tribCalc.vRBSNitem ? o.tribCalc.vRBSNitem : (enviado.bases[o.nObj - 1] || 0)));
      const tdIbs = document.createElement("td");
      tdIbs.className = "num";
      tdIbs.textContent = o.tribCalc ? money(Number(o.tribCalc.vIBSSN)) : "-";
      const tdCbs = document.createElement("td");
      tdCbs.className = "num";
      tdCbs.textContent = o.tribCalc ? money(Number(o.tribCalc.vCBSSN)) : "-";
      const tdEstado = document.createElement("td");
      const badge = document.createElement("span");
      const estado = o.estadoItem || "-";
      badge.className = "badge " + (estado === "CALCULADO" ? "ok" : estado === "NAO_CALCULADO" ? "aviso" : "erro");
      badge.textContent = estado === "CALCULADO" ? "Calculado" : estado === "NAO_CALCULADO" ? "Não calculado" : "Inconsistência";
      tdEstado.append(badge);
      tr.append(tdNum, tdBase, tdIbs, tdCbs, tdEstado);
      tbody.append(tr);
    }
    tabela.append(thead, tbody);
    box.append(tabela);
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function calcular(ev) {
    ev.preventDefault();
    if (state.calculando) return;

    const atividade = atualAtividade();
    const itens = lerItens();
    const data = $("#data").value;
    const tpDoc = $("#tpDoc").value;
    const pIBS = parseNum($("#pIBS").value);
    const pCBS = parseNum($("#pCBS").value);
    const problemas = [];

    if (!atividade) problemas.push("Selecione a atividade da nota.");
    if (!data || data < "2027-01-01") problemas.push("A data do fato gerador deve ser 2027-01-01 ou posterior.");
    if (!Number.isFinite(pIBS) || pIBS < 0 || pIBS > 100) problemas.push("Alíquota efetiva do IBS inválida (0 a 100%).");
    if (!Number.isFinite(pCBS) || pCBS < 0 || pCBS > 100) problemas.push("Alíquota efetiva da CBS inválida (0 a 100%).");
    for (const it of itens) {
      if (!(it.base > 0)) problemas.push("Item " + it.numero + ": informe a base de cálculo.");
      if (it.ncm.length !== 8) problemas.push("Item " + it.numero + ": o NCM deve ter 8 dígitos.");
      if (it.cct.length !== 6) problemas.push("Item " + it.numero + ": o cClassTrib deve ter 6 dígitos.");
    }
    if (problemas.length) {
      falha("Confira os dados", "", problemas.map(function (p) { return { titulo: "Atenção", detalhe: p }; }));
      $("#resultado").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const payload = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      versao: "2.0.0",
      data: data,
      tpDoc: tpDoc,
      CRT: "1",
      itens: itens.map(function (it) {
        return {
          numero: it.numero,
          cAtivSN: atividade.codigo,
          cClassTrib: it.cct,
          ncm: it.ncm,
          baseCalculo: valor2(it.base),
          valorImpostoSeletivo: "0.00",
          pIBSSN: valor4(pIBS),
          pCBSSN: valor4(pCBS),
        };
      }),
    };

    state.calculando = true;
    const botao = $("#calcular");
    botao.disabled = true;
    botao.textContent = "Calculando…";
    try {
      const r = await buscar("/calculadora/observabilidade/simples-nacional", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(function () { return null; });
      if (!r.ok) {
        const erros = ((j && j.errors) || []).map(function (e) {
          return { titulo: (e.code || "Erro") + " - " + (e.title || ""), detalhe: e.detail || "" };
        });
        falha("O motor recusou o cálculo", (j && j.detail) || ("A API respondeu HTTP " + r.status + "."), erros);
      } else {
        renderResultado(j, { bases: itens.map(function (it) { return it.base; }) });
      }
    } catch (e) {
      falha(
        "Motor indisponível",
        "Não foi possível falar com o motor do Simples. Se o serviço no Render estava hibernando, aguarde um minuto e clique de novo.",
        [{ titulo: e.name === "AbortError" ? "Tempo esgotado (90 s)" : e.message, detalhe: "" }]
      );
    } finally {
      state.calculando = false;
      botao.disabled = false;
      botao.textContent = "Calcular pelo motor oficial";
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
