/* api/shared/htmlRender.js - HTML final para htmlRelatorio (versão revisada) */

function renderHtmlRelatorio({ title, subtitle, alertsForHtml, sections, meta }) {
  const safeTitle = esc(title || "");
  const safeSubtitle = esc(subtitle || "");

  const alertsHtml = renderGroupedAlerts(alertsForHtml || {});
  const sectionsHtml = (sections || []).map(renderSection).join("\n");
  const metaHtml = renderMeta(meta || {});

  return `
<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${safeTitle}</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:18px;background:#fff;color:#111}
    .card{border:1px solid #e6e6e6;border-radius:12px;padding:16px;margin:0 0 14px 0}
    h1{font-size:20px;margin:0 0 6px 0}
    h2{font-size:14px;margin:18px 0 8px 0}
    p{margin:8px 0;line-height:1.45}
    ul{margin:8px 0 8px 18px}
    .sub{color:#555;font-size:13px;margin:0}
    .badge{display:inline-block;font-size:11px;padding:3px 7px;border-radius:999px;margin-right:6px;font-weight:bold}
    .badge.error{background:#ffdddd;color:#a30000;border:1px solid #e6a8a8}
    .badge.warn{background:#fff4d6;color:#8a5a00;border:1px solid #e6c98a}
    .badge.info{background:#e8f0ff;color:#003c8f;border:1px solid #bcd0f7}
    .alert{border-radius:10px;padding:10px 12px;margin:8px 0;border:1px solid #ddd;font-size:13px}
    .alert.error{border-color:#f2b8b5;background:#fff5f5}
    .alert.warn{border-color:#f3d6a5;background:#fffaf2}
    .alert.info{border-color:#cfe0ff;background:#f5f9ff}
    .muted{color:#666;font-size:12px}
    hr{border:none;border-top:1px solid #eee;margin:14px 0}
  </style>
</head>
<body>

  <div class="card">
    <h1>${safeTitle}</h1>
    <p class="sub">${safeSubtitle}</p>
    ${alertsHtml}
    ${metaHtml}
  </div>

  ${sectionsHtml}

  <div class="card">
    <p class="muted">
      Observação: este conteúdo é um rascunho técnico gerado a partir de dados fornecidos e deve ser revisado por profissional habilitado antes do protocolo.
    </p>
  </div>

</body>
</html>
  `.trim();
}

/* -------------------------------------------------------------------------- */
/* Renderização de alertas agrupados                                           */
/* -------------------------------------------------------------------------- */

function renderGroupedAlerts(grouped) {
  const { error = [], warn = [], info = [] } = grouped;

  if (error.length + warn.length + info.length === 0) return "";

  let html = `<div style="margin-top:10px">`;

  if (error.length) {
    html += `<h2>Erros</h2>`;
    html += error.map(a => renderAlert(a, "error")).join("");
  }

  if (warn.length) {
    html += `<h2>Avisos</h2>`;
    html += warn.map(a => renderAlert(a, "warn")).join("");
  }

  if (info.length) {
    html += `<h2>Informações</h2>`;
    html += info.map(a => renderAlert(a, "info")).join("");
  }

  html += `</div>`;
  return html;
}

function renderAlert(a, level) {
  const code = a.code ? `<span class="badge ${level}">${esc(a.code)}</span>` : "";
  const msg = esc(a.message || "");
  return `<div class="alert ${level}">${code}${msg}</div>`;
}

/* -------------------------------------------------------------------------- */
/* Renderização de seções                                                      */
/* -------------------------------------------------------------------------- */

function renderSection(s) {
  const heading = esc(s.heading || "");
  const bodyHtml = s.bodyHtml || "";
  return `
  <div class="card">
    <h2>${heading}</h2>
    ${bodyHtml}
  </div>
  `.trim();
}

/* -------------------------------------------------------------------------- */
/* Renderização de metadados                                                   */
/* -------------------------------------------------------------------------- */

function renderMeta(meta) {
  const kv = Object.entries(meta || {})
    .map(([k, v]) => `<div><span class="muted">${esc(k)}</span>: <span class="muted">${esc(String(v))}</span></div>`)
    .join("");
  if (!kv) return "";
  return `<hr/><div class="muted">${kv}</div>`;
}

/* -------------------------------------------------------------------------- */
/* Utilidades                                                                  */
/* -------------------------------------------------------------------------- */

function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

module.exports = { renderHtmlRelatorio };

  