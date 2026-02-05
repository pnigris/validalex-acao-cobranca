/* ************************************************************************* */
/* api/draft/cobrancaStart.js                                                */
/* Start async job: responde 202 + jobId e roda processamento com waitUntil() */
/* ************************************************************************* */

const crypto = require("crypto");
const { waitUntil } = require("@vercel/functions");

const { logger } = require("../shared/logger.js");
const { rateLimit } = require("../shared/rateLimit.js");
const { authGuard } = require("../shared/auth.js");
const { sendJson, sendError } = require("../shared/response.js");

const { validateDraftInput } = require("../../src/draft-cobranca/validate.js");
const { buildPrompt } = require("../../src/draft-cobranca/buildPrompt.js");
const { callModel } = require("../../src/draft-cobranca/callModel.js");
const { parseModel } = require("../../src/draft-cobranca/parseModel.js");
const { assemble } = require("../../src/draft-cobranca/assemble.js");

const { writeJob, readJob } = require("../shared/jobStore.js");

function setCors(res) {
  try { res.setHeader("Access-Control-Allow-Origin", "*"); } catch (_) {}
  try { res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS"); } catch (_) {}
  try { res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization"); } catch (_) {}
  try { res.setHeader("Access-Control-Max-Age", "86400"); } catch (_) {}
}

function emptySectionsObject() {
  return {
    enderecamento: "",
    qualificacao: "",
    fatos: "",
    direito: "",
    pedidos: "",
    valor_causa: "",
    requerimentos_finais: "",
  };
}

function hasAnySectionText(sectionsObj) {
  if (!sectionsObj || typeof sectionsObj !== "object") return false;
  return Object.values(sectionsObj).some(
    (t) => typeof t === "string" && t.trim().length > 0
  );
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    return res.end();
  }

  if (req.method !== "POST") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Use POST");
  }

  try {
    // 🔐 Rate limit correto (start é sensível)
    const rl = rateLimit(req, { limit: 10, windowMs: 60_000, key: "draft_start" });
    if (!rl.ok) {
      return sendError(
        res,
        429,
        "RATE_LIMIT",
        "Muitas solicitações em pouco tempo. Aguarde alguns segundos e tente novamente.",
        null,
        { retryAfterSec: rl.retryAfterSec },
        { "Retry-After": rl.retryAfterSec }
      );
    }

    // 🔐 Auth
    authGuard(req);

    const payload = req.body || {};
    const v = validateDraftInput(payload);

    // JobId sempre imprevisível
    const jobId = crypto.randomUUID();

    // ❌ inválido → grava job concluído com alertas (start SEMPRE retorna 202)
    if (!v.ok) {
      await writeJob(jobId, {
        ok: false,
        status: "done",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        result: {
          ok: false,
          html: "",
          sections: emptySectionsObject(),
          alerts: v.alerts || [],
          missing: v.missing || [],
          meta: { stage: "validate" },
        },
      });

      return sendJson(res, 202, {
        ok: true,
        jobId,
        statusUrl: `/api/draft/cobrancaStatus?jobId=${jobId}`,
      });
    }

    // 🕒 job queued
    await writeJob(jobId, {
      ok: true,
      status: "queued",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      payload,
    });

    // 🚀 processamento assíncrono
    waitUntil(runJob(jobId));

    return sendJson(res, 202, {
      ok: true,
      jobId,
      statusUrl: `/api/draft/cobrancaStatus?jobId=${jobId}`,
    });
  } catch (err) {
    const msg = err?.message ? String(err.message) : "Erro inesperado";
    logger.error("DRAFT_COBRANCA_START_ERR", { error: msg, status: 500 });
    return sendError(res, 500, "START_ERR", "Falha ao iniciar o rascunho.", msg);
  }
};

async function runJob(jobId) {
  const t0 = Date.now();

  try {
    await patchJob(jobId, {
      status: "running",
      updatedAt: Date.now(),
      meta: { stage: "running" },
    });

    const j = await readJob(jobId);
    const payload = j?.payload;
    if (!payload) throw new Error("Job payload ausente");

    const prompt = buildPrompt(payload);
    const raw = await callModel({ prompt, meta: { route: "draft/cobranca-async" } });

    const parsed = parseModel(raw);
    const out = assemble(parsed, { payload });

    const sections =
      out?.sections && typeof out.sections === "object" && !Array.isArray(out.sections)
        ? out.sections
        : emptySectionsObject();

    const resp = {
      ok: !!out?.ok,
      html: out?.html || "",
      sections,
      alerts: Array.isArray(out?.alerts) ? out.alerts : [],
      missing: Array.isArray(out?.missing) ? out.missing : [],
      meta: {
        ...(out?.meta || {}),
        ms: Date.now() - t0,
      },
    };

    logger.info("DRAFT_COBRANCA_ASYNC_OK", {
      jobId,
      hasHtml: !!resp.html,
      hasSections: hasAnySectionText(resp.sections),
      ms: resp.meta.ms,
    });

    await writeJob(jobId, {
      ok: true,
      status: "done",
      createdAt: j?.createdAt || Date.now(),
      updatedAt: Date.now(),
      result: resp,
    });
  } catch (err) {
    const msg = err?.message ? String(err.message) : "Erro inesperado";
    const status = err?.statusCode ? Number(err.statusCode) : 500;

    logger.error("DRAFT_COBRANCA_ASYNC_ERR", { jobId, error: msg, status });

    await patchJob(jobId, {
      status: "error",
      updatedAt: Date.now(),
      error: { message: msg, status },
      result: {
        ok: false,
        html: "",
        sections: emptySectionsObject(),
        alerts: [{ level: "error", code: "DRAFT_COBRANCA_ERR", message: msg }],
        missing: [],
        meta: { stage: "handler", ms: Date.now() - t0 },
      },
    });
  }
}

async function patchJob(jobId, patch) {
  const cur = await readJob(jobId);
  await writeJob(jobId, { ...(cur || {}), ...(patch || {}) });
}
