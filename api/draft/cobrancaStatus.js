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
  try { if (res && res.headersSent) return; } catch (_) {}
  try { res.statusCode = statusCode; } catch (_) {}
  try { res.end(); } catch (_) {}
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return safeEnd(res, 200);
  if (req.method !== "GET") return sendError(res, 405, "METHOD_NOT_ALLOWED", "Use GET");

  try {
    // Status é polling: dê um limite mais alto do que start/export
    const rl = rateLimit(req, { limit: 60, windowMs: 60_000, key: "draft_status" });
    if (!rl.ok) {
      return sendError(
        res,
        429,
        "RATE_LIMIT",
        "Muitas consultas em pouco tempo. Aguarde alguns segundos e tente novamente.",
        null,
        { retryAfterSec: rl.retryAfterSec },
        { "Retry-After": rl.retryAfterSec }
      );
    }

    authGuard(req);

    const jobId = String(req.query?.jobId || "").trim();
    if (!jobId) return sendError(res, 400, "BAD_REQUEST", "jobId ausente");

    const j = await readJob(jobId);
    if (!j) return sendError(res, 404, "NOT_FOUND", "Job não encontrado");

    const status = j.status || "queued";

    if (status === "done") {
      return sendJson(res, 200, { ok: true, jobId, status, ...(j.result || {}) });
    }

    if (status === "error") {
      return sendJson(res, 200, {
        ok: false,
        jobId,
        status,
        error: j?.error?.message || "Falha no job",
        statusCode: j?.error?.status || 500,
        ...(j.result || {})
      });
    }

    return sendJson(res, 200, {
      ok: true,
      jobId,
      status,
      meta: {
        createdAt: j.createdAt || null,
        updatedAt: j.updatedAt || null,
      }
    });
  } catch (err) {
    const msg = (err && err.message) ? String(err.message) : "Erro inesperado";
    logger.error("DRAFT_COBRANCA_STATUS_ERR", { error: msg, status: 500 });
    return sendError(res, 500, "STATUS_ERR", "Falha ao consultar o status do job.", msg);
  }
};
