/* ************************************************************************* */
/* Nome do codigo: src/draft-cobranca/assemble.js                            */
/* Objetivo: normalizar saída final com html + sections (OBJETO por chave)   */
/* ************************************************************************* */

function normalizeSectionsObject(sections) {
  // Esperado: objeto com chaves fixas
  // enderecamento, qualificacao, fatos, direito, pedidos, valor_causa, requerimentos_finais
  const s = (sections && typeof sections === "object") ? sections : {};

  return {
    enderecamento: safeText(s.enderecamento),
    qualificacao: safeText(s.qualificacao),
    fatos: safeText(s.fatos),
    direito: safeText(s.direito),
    pedidos: safeText(s.pedidos),
    valor_causa: safeText(s.valor_causa),
    requerimentos_finais: safeText(s.requerimentos_finais),
  };
}

function safeText(v) {
  return (typeof v === "string") ? v.trim() : "";
}

function hasAnySectionText(sectionsObj) {
  if (!sectionsObj || typeof sectionsObj !== "object") return false;
  return Object.values(sectionsObj).some((t) => typeof t === "string" && t.trim().length > 0);
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function nl2br(s) {
  return escapeHtml(s).replace(/\n/g, "<br>");
}

function buildHtmlFromSections(sectionsObj) {
  // HTML simples, determinístico (sem inventar conteúdo).
  // Serve como fallback caso parsed.html não venha.
  const order = [
    ["enderecamento", "Endereçamento"],
    ["qualificacao", "Qualificação"],
    ["fatos", "Fatos"],
    ["direito", "Fundamentos Jurídicos"],
    ["pedidos", "Pedidos"],
    ["valor_causa", "Valor da Causa"],
    ["requerimentos_finais", "Requerimentos Finais"],
  ];

  let html = `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.5;">`;

  for (const [key, label] of order) {
    const txt = sectionsObj && sectionsObj[key] ? String(sectionsObj[key]).trim() : "";
    if (!txt) continue;

    html += `
      <h3 style="margin: 18px 0 8px 0;">${escapeHtml(label)}</h3>
      <div style="margin: 0 0 14px 0;">${nl2br(txt)}</div>
    `;
  }

  html += `</div>`;
  return html;
}

/* ============================================================================
   PROVAS (determinístico): payload.data.provas.documentos -> texto humano
   - Não depende do modelo listar as provas.
   - Mantém a arquitetura: injeta no campo sections.pedidos (chave já existente).
============================================================================ */

const DOC_LABELS = {
  // chkDocs
  contrato: "Contrato Assinado",
  orcamento: "Orçamento aprovado",
  pedido_compra: "Pedido de Compra",

  // chkDocs1
  nota_fiscal: "Nota Fiscal",
  boleto: "Boleto bancário",
  planilha: "Planilha de cálculo",

  // chkDocs2
  canhoto: "Canhoto da Nota Fiscal",
  aceite: "Termo de Aceite/Entrega",
  tecno: "Contexto tecnológico",

  // chkDocs3
  email: "E-mails de cobrança",
  conversas: "Conversas de WhatsApp/Telegram",
  envio: "Envio de carta/Telegrama",

  // chkDocs4
  outros: "Outros",
};

function normalizeDocsList(docsRaw) {
  if (!Array.isArray(docsRaw)) return [];

  // Aceita strings como 'outros' e também 'outros:algum texto'
  const out = [];
  const seen = new Set();

  for (const item of docsRaw) {
    const s = String(item || "").trim();
    if (!s) continue;

    // normaliza
    const key = s.toLowerCase();

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }

  return out;
}

function docsToHumanList(docs) {
  const human = [];
  let outrosDetalhe = "";

  for (const raw of docs) {
    const s = String(raw || "").trim();
    if (!s) continue;

    // caso especial: "outros:detalhe"
    if (s.toLowerCase().startsWith("outros:")) {
      const det = s.slice("outros:".length).trim();
      if (det) outrosDetalhe = det;
      continue;
    }

    const key = s.toLowerCase();
    const label = DOC_LABELS[key] || s; // fallback: não inventa, usa o que veio
    if (!human.includes(label)) human.push(label);
  }

  // Se marcou "Outros" e veio detalhe, renderiza como "Outros (detalhe...)"
  if (human.includes(DOC_LABELS.outros) && outrosDetalhe) {
    const idx = human.indexOf(DOC_LABELS.outros);
    human[idx] = `${DOC_LABELS.outros} (${outrosDetalhe})`;
  }

  return human;
}

function buildProvasParagraphFromPayload(payload) {
  const docsRaw = payload && payload.data && payload.data.provas && payload.data.provas.documentos;
  const docs = normalizeDocsList(docsRaw);

  if (!docs.length) return "";

  const humanList = docsToHumanList(docs);
  if (!humanList.length) return "";

  // Texto padrão de petição, determinístico, sem criar fatos:
  // apenas lista documentos selecionados.
  return `Protesta provar o alegado por todos os meios em direito admitidos, especialmente pela prova documental, consistente em: ${humanList.join("; ")}.`;
}

function appendParagraph(baseText, paragraph) {
  const a = safeText(baseText);
  const p = safeText(paragraph);
  if (!p) return a;

  // Evita duplicar se já estiver presente literalmente
  if (a && a.includes(p)) return a;

  if (!a) return p;
  return `${a}\n\n${p}`;
}

module.exports.assemble = function assemble(parsed, { payload } = {}) {
  const ok = !!(parsed && parsed.ok);

  // 1) sections sempre como OBJETO
  const sections = normalizeSectionsObject(parsed && parsed.sections);

  // 1.1) Injeta "Provas" de forma determinística (sem depender do modelo)
  const provasParagraph = buildProvasParagraphFromPayload(payload);
  if (provasParagraph) {
    sections.pedidos = appendParagraph(sections.pedidos, provasParagraph);
  }

  // 2) html: usa o que vier do parse; se não vier, constrói a partir das sections
  let html = (parsed && typeof parsed.html === "string") ? parsed.html : "";
  if (!html && hasAnySectionText(sections)) {
    html = buildHtmlFromSections(sections);
  }

  const alerts = Array.isArray(parsed && parsed.alerts) ? parsed.alerts : [];
  const missing = Array.isArray(parsed && parsed.missing) ? parsed.missing : [];

  const meta = {
    ...(parsed && parsed.meta ? parsed.meta : {}),
    hasSections: hasAnySectionText(sections),
  };

  return {
    ok,
    html,
    sections,
    alerts,
    missing,
    meta,
  };
};
