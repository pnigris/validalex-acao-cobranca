/* ************************************************************************* */
/* Nome do codigo: api/shared/rateLimit.js                                   */
/* Objetivo: rate limit simples (in-memory) para APIs serverless             */
/* ************************************************************************* */

const buckets = new Map();

/**
 * Aplica rate limit e ENCERRA o request se excedido.
 *
 * @param {object} req
 * @param {object} res
 * @param {object=} opts
 * @param {number=} opts.limit      Máx. requisições por janela
 * @param {number=} opts.windowMs   Janela em ms
 * @param {string=} opts.key        Chave customizada (opcional)
 */
function rateLimit(req, res, opts = {}) {
  const limit = Number(opts.limit || 30);        // padrão: 30 req
  const windowMs = Number(opts.windowMs || 60_000); // padrão: 1 min

  const now = Date.now();

  // 🔑 chave automática (IP + rota)
  const ip =
    req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  const route = req.url || "unknown";
  const key = opts.key || `${ip}:${route}`;

  const bucket = buckets.get(key);

  if (!bucket || (now - bucket.windowStart) >= windowMs) {
    buckets.set(key, { windowStart: now, count: 1 });

    setHeaders(res, limit - 1, windowMs);
    return; // ✅ permitido, continua handler
  }

  bucket.count += 1;
  const remaining = limit - bucket.count;
  const resetMs = windowMs - (now - bucket.windowStart);

  if (bucket.count > limit) {
    // ❌ BLOQUEIA AQUI
    setHeaders(res, 0, resetMs);

    res.statusCode = 429;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      ok: false,
      status: 429,
      error: "Muitas requisições. Tente novamente em alguns instantes.",
      retryAfterMs: resetMs
    }));

    // ⚠️ IMPORTANTE: interrompe o fluxo
    throw Object.assign(new Error("Rate limit exceeded"), { statusCode: 429 });
  }

  setHeaders(res, Math.max(0, remaining), resetMs);
}

/* ========================================================================== */

function setHeaders(res, remaining, resetMs) {
  try {
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.max(0, resetMs)));
  } catch (_) {
    // ignore header errors
  }
}

module.exports = { rateLimit };
