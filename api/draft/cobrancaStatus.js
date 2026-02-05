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
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return sendError(res, 405, "METHOD_NOT_ALLOWED", "Use GET");

  try {
    rateLimit(req, res);
    authGuard(req);

    const jobId = String(req.query?.jobId || "").trim();
    if (!jobId) return sendJson(res, 400, { ok: false, error: "jobId ausente" });

    const j = await readJob(jobId);
    if (!j) return sendJson(res, 404, { ok: false, error: "Job não encontrado" });

    const status = j.status || "queued";

    // resultado pronto
    if (status === "done") {
      return sendJson(res, 200, { ok: true, jobId, status, ...j.result });
    }

    // erro
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
    const msg = (err && err.message) ? String(err.message) : "Erro inesperado";
    logger.error("DRAFT_COBRANCA_STATUS_ERR", { error: msg, status: 500 });
    return sendJson(res, 500, { ok: false, error: msg });
  }
};
