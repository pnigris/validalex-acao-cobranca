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

module.exports.assemble = function assemble(parsed, { payload } = {}) {
  const ok = !!(parsed && parsed.ok);

  // 1) sections sempre como OBJETO
  const sections = normalizeSectionsObject(parsed && parsed.sections);

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

