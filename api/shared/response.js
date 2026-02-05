/* ************************************************************************* */
/* Nome do codigo: api/shared/response.js                                    */
/* Objetivo: respostas JSON padronizadas                                     */
/* - Protege contra double-send (headers já enviados)                        */
/* ************************************************************************* */

function sendJson(res, status, payload, extraHeaders) {
  try {
    if (res && res.headersSent) return;
  } catch (_) {}

  // Node puro (Vercel Functions)
  try {
    res.statusCode = status;
  } catch (_) {}

  // headers extras (ex: Retry-After)
  if (extraHeaders && typeof extraHeaders === "object") {
    for (const [k, v] of Object.entries(extraHeaders)) {
      try {
        res.setHeader(k, String(v));
      } catch (_) {}
    }
  }

  try {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
  } catch (_) {}

  try {
    res.end(JSON.stringify(payload));
  } catch (_) {}
}

function sendError(res, status, code, message, details, meta, extraHeaders) {
  const out = {
    ok: false,
    status,
    code: code || "ERROR",
    error: message || "Erro",
  };

  if (details) out.details = String(details);
  if (meta && typeof meta === "object") out.meta = meta;

  return sendJson(res, status, out, extraHeaders);
}

module.exports = { sendJson, sendError };
