/* src/draft-cobranca/assemble.js */

function assembleHtml({ data, sections, alerts, meta }) {
  // Agrupa alertas por nível para exibição mais elegante
  const groupedAlerts = groupAlerts(alerts);

  const sectionsForHtmlRelatorio = [
    {
      heading: "Endereçamento",
      bodyHtml: toParagraphs(sections.enderecamento)
    },
    {
      heading: "Qualificação das partes",
      bodyHtml: toParagraphs(sections.qualificacao)
    },
    {
      heading: "Dos fatos",
      bodyHtml: toParagraphs(sections.fatos)
    },
    {
      heading: "Do direito",
      bodyHtml: toParagraphs(sections.direito)
    },
    {
      heading: "Dos pedidos",
      bodyHtml: toParagraphs(sections.pedidos)
    },
    {
      heading: "Do valor da causa",
      bodyHtml: toParagraphs(sections.valor_causa)
    },
    {
      heading: "Requerimentos finais",
      bodyHtml: toParagraphs(sections.requerimentos_finais)
    }
  ];

  const model = (meta && meta.model) ? meta.model : (process.env.OPENAI_MODEL || "unknown");

  return {
    sectionsForHtmlRelatorio,
    alertsForHtml: groupedAlerts,
    meta: {
      jobId: data.jobId || undefined,
      promptVersion: meta.promptVersion || "cobranca-1.0.0",
      templateVersion: meta.templateVersion || "cobranca_v1",
      model
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function groupAlerts(alerts) {
  const out = {
    error: [],
    warn: [],
    info: []
  };

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
    return `<p><i>Seção não gerada. Verifique dados e tente novamente.</i></p>`;
  }

  const parts = t
    .split(/\n{2,}/g)
    .map((p) => p.trim())
    .filter(Boolean);

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

  