/* ************************************************************************* */
/* api/draft/cobrancaStatus.js                                               */
/* Retorna status do job + resultado quando pronto                            */
/* ************************************************************************* */

const { logger } = require("../shared/logger.js");
const { rateLimit } = require("../shared/rateLimit.js");
const { authGuard } = require("../shared/auth.js");
const { sendJson, sendError } = require("../shared/response.js");
const { readJob } = require("../shared/jobStore.js");

function setCors(res) {
  try { res.setHeader("Access-Control-Allow-Origin", "*"); } catch (_) {}
  try { res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS"); } catch (_) {}
  try { res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization"); } catch (_) {}
  try { res.setHeader("Access-Control-Max-Age", "86400"); } catch (_) {}
}

function safeEnd(res, statusCode) {
  try {
    if (res && res.headersSent) return;
  } catch (_) {}

  try {
    res.statusCode = statusCode;
  } catch (_) {}

  try {
    res.end();
  } catch (_) {}
}

module.exports = async function handler(req, res) {
  setCors(res);

  // OPTIONS compatível com Node puro (evita depender de res.status)
  if (req.method === "OPTIONS") {
    return safeEnd(res, 200);
  }

  if (req.method !== "GET") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Use GET");
  }

  try {
    // Rate limit: pode responder por conta própria OU retornar um objeto de bloqueio.
    // Como seu rateLimit.js não está aqui, vamos tratar os dois casos.
    const rl = await Promise.resolve(rateLimit(req, res));

    // Se o rateLimit já respondeu, NÃO continue (evita double-send)
    if (res.headersSent) return;

    // Se o rateLimit retornar um objeto padrão, respeite também
    if (rl && rl.ok === false) {
      const retryAfterSec = Number(rl.retryAfterSec || rl.retryAfter || 5) || 5;
      return sendError(
        res,
        429,
        "RATE_LIMIT",
        "Muitas consultas em pouco tempo. Aguarde alguns segundos e tente novamente.",
        null,
        { retryAfterSec }
      );
    }

    // Auth: idealmente lança erro quando falha
    await Promise.resolve(authGuard(req));

    const jobId = String(req.query?.jobId || "").trim();
    if (!jobId) {
      return sendError(res, 400, "BAD_REQUEST", "jobId ausente");
    }

    const j = await readJob(jobId);
    if (!j) {
      return sendError(res, 404, "NOT_FOUND", "Job não encontrado");
    }

    const status = j.status || "queued";

    // resultado pronto
    if (status === "done") {
      return sendJson(res, 200, { ok: true, jobId, status, ...j.result });
    }

    // erro (mantive seu contrato: HTTP 200 com ok:false, mas isso é discutível)
    if (status === "error") {
      return sendJson(res, 200, {
        ok: false,
        jobId,
        status,
        error: j?.error?.message || "Falha no job",
        statusCode: j?.error?.status || 500,
        ...(j.result || {}),
      });
    }

    // queued/running
    return sendJson(res, 200, {
      ok: true,
      jobId,
      status,
      meta: {
        createdAt: j.createdAt || null,
        updatedAt: j.updatedAt || null,
      },
    });
  } catch (err) {
    // Se já respondeu por qualquer razão (rateLimit, etc), não tente responder de novo
    try {
      if (res.headersSent) return;
    } catch (_) {}

    const msg = (err && err.message) ? String(err.message) : "Erro inesperado";

    // Normaliza rate limit: se sua rateLimit lança "Rate limit exceeded", responda 429.
    const rawStatus = Number(err?.status || err?.statusCode || 0) || 0;
    const isRate =
      rawStatus === 429 ||
      /rate\s*limit/i.test(msg) ||
      /too\s*many\s*requests/i.test(msg);

    const status = isRate ? 429 : 500;

    logger.error("DRAFT_COBRANCA_STATUS_ERR", { error: msg, status });

    if (isRate) {
      const retryAfterSec = Number(err?.retryAfterSec || err?.retryAfter || 5) || 5;
      return sendError(
        res,
        429,
        "RATE_LIMIT",
        "Muitas consultas em pouco tempo. Aguarde alguns segundos e tente novamente.",
        msg,
        { retryAfterSec }
      );
    }

    return sendError(res, 500, "STATUS_ERR", "Falha ao consultar o status do job.", msg);
  }
};
