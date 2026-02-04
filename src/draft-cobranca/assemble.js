/* src/draft-cobranca/assemble.js — versão corrigida para incluir sections */

function assembleHtml({ data, sections, alerts, meta }) {
  const groupedAlerts = groupAlerts(alerts);

  const safe = (k) =>
    (sections && typeof sections[k] === "string" && sections[k].trim().length > 0)
      ? sections[k]
      : `[PENDENTE – SEÇÃO '${k}' NÃO GERADA]`;

  const sectionsForHtmlRelatorio = [
    { heading: "Endereçamento",         bodyHtml: toParagraphs(safe("enderecamento")) },
    { heading: "Qualificação das partes", bodyHtml: toParagraphs(safe("qualificacao")) },
    { heading: "Dos fatos",              bodyHtml: toParagraphs(safe("fatos")) },
    { heading: "Do direito",             bodyHtml: toParagraphs(safe("direito")) },
    { heading: "Dos pedidos",            bodyHtml: toParagraphs(safe("pedidos")) },
    { heading: "Do valor da causa",      bodyHtml: toParagraphs(safe("valor_causa")) },
    { heading: "Requerimentos finais",   bodyHtml: toParagraphs(safe("requerimentos_finais")) }
  ];

  const model = meta?.model || process.env.OPENAI_MODEL || "unknown";

  return {
    // ✅ CORREÇÃO: incluir sections "plain" no retorno
    sections,
    sectionsForHtmlRelatorio,
    alertsForHtml: groupedAlerts,
    meta: {
      jobId: data.jobId || undefined,
      promptVersion: meta?.promptVersion || "unknown",
      templateVersion: meta?.templateVersion || "unknown",
      model
    }
  };
}

/* Helpers */

function groupAlerts(alerts) {
  const out = { error: [], warn: [], info: [] };
  for (const a of alerts || []) {
    const lvl = (a.level || "info").toLowerCase();
    if (lvl === "error") out.error.push(a);
    else if (lvl === "warn") out.warn.push(a);
    else out.info.push(a);
  }
  return out;
}

function toParagraphs(text) {
  const t = String(text || "").trim();
  if (!t) {
    return `<p><i>[PENDENTE – TEXTO NÃO FORNECIDO]</i></p>`;
  }
  const parts = t.split(/\n{2,}/g).map((p) => p.trim()).filter(Boolean);
  return parts
    .map((p) => `<p>${esc(p).replaceAll("\n", "<br/>")}</p>`)
    .join("");
}

function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

module.exports = { assembleHtml };