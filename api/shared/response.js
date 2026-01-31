/* api/shared/response.js - respostas padronizadas */

function setJson(res, status, payload, extraHeaders) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    if (extraHeaders) {
      for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
    }
    res.end(JSON.stringify(payload));
  }
  
  function ok(res, payload) {
    return setJson(res, 200, payload);
  }
  
  function badRequest(res, message) {
    return setJson(res, 400, { ok: false, error: message });
  }
  
  function unauthorized(res, message) {
    return setJson(res, 401, { ok: false, error: message });
  }
  
  function tooManyRequests(res, message, rl) {
    return setJson(
      res,
      429,
      { ok: false, error: message, rateLimit: rl },
      { "Retry-After": Math.ceil((rl && rl.resetMs ? rl.resetMs : 60_000) / 1000) }
    );
  }
  
  function serverError(res, message) {
    return setJson(res, 500, { ok: false, error: message });
  }
  
  module.exports = { ok, badRequest, unauthorized, tooManyRequests, serverError };
  