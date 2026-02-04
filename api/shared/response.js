/* ************************************************************************* */
/* Nome do codigo: api/shared/response.js                                    */
/* Objetivo: respostas JSON padronizadas                                     */
/* ************************************************************************* */

function sendJson(res, status, obj) {
  // Express-like (alguns runtimes)
  if (typeof res?.status === "function" && typeof res?.json === "function") {
    return res.status(status).json(obj);
  }

  // Node puro
  res.statusCode = status;
  try {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
  } catch (_) {}
  res.end(JSON.stringify(obj));
}

function sendError(res, status, code, message, details) {
  const payload = {
    ok: false,
    status,
    code: code || "ERROR",
    error: message || "Erro",
  };
  if (details) payload.details = String(details);
  return sendJson(res, status, payload);
}

module.exports = {
  sendJson,
  sendError
};
