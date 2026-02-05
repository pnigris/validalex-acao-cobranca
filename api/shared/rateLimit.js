/* ************************************************************************* */
/* Nome do codigo: api/shared/rateLimit.js                                   */
/* Objetivo: rate limit simples (in-memory) para APIs serverless             */
/* - NÃO encerra o request (não escreve em res)                              */
/* - Retorna um objeto { ok, retryAfterSec, remaining, resetSec }            */
/* ************************************************************************* */

const buckets = new Map();

/**
 * Rate limit in-memory (best-effort). Em serverless, não garante consistência
 * entre instâncias, mas reduz picos e evita abuso por instância.
 *
 * @param {object} req
 * @param {object=} opts
 * @param {number=} opts.limit      Máx. requisições por janela
 * @param {number=} opts.windowMs   Janela em ms
 * @param {string=} opts.key        Chave customizada (opcional)
 * @returns {{ok:true, remaining:number, resetSec:number} | {ok:false, retryAfterSec:number, remaining:number, resetSec:number}}
 */
function rateLimit(req, opts = {}) {
  const limit = Number(opts.limit || 30);
  const windowMs = Number(opts.windowMs || 60_000);

  const now = Date.now();

  // 🔑 chave automática (IP + rota) — ajuste se precisar agrupar por usuário
  const ip =
    req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  const route = req.url || "unknown";
  const key = String(opts.key || `${ip}:${route}`);

  const b = buckets.get(key);

  // inicia/renova janela
  if (!b || (now - b.windowStart) >= windowMs) {
    buckets.set(key, { windowStart: now, count: 1 });

    return {
      ok: true,
      remaining: Math.max(0, limit - 1),
      resetSec: Math.ceil(windowMs / 1000),
    };
  }

  b.count += 1;

  const elapsed = now - b.windowStart;
  const resetMs = Math.max(0, windowMs - elapsed);

  const remaining = Math.max(0, limit - b.count);
  const resetSec = Math.ceil(resetMs / 1000);

  // excedeu
  if (b.count > limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, resetSec),
      remaining: 0,
      resetSec,
    };
  }

  return {
    ok: true,
    remaining,
    resetSec,
  };
}

module.exports = { rateLimit };
