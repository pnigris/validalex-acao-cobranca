/* ************************************************************************* */
/* Nome do codigo: api/draft/cobranca.js                                     */
/* Objetivo: retornar ok, html, sections, alerts, missing, meta              */
/* ************************************************************************* */

const { logger } = require("../shared/logger.js");
const { rateLimit } = require("../shared/rateLimit.js");
const { authGuard } = require("../shared/auth.js");
const { sendJson, sendError } = require("../shared/response.js");

const { validateDraftInput } = require("../../src/draft-cobranca/validate.js");
const { buildPrompt } = require("../../src/draft-cobranca/buildPrompt.js");
const { callModel } = require("../../src/draft-cobranca/callModel.js");
const { parseModel } = require("../../src/draft-cobranca/parseModel.js");
const { assemble } = require("../../src/draft-cobranca/assemble.js");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

// Sections "vazias" no formato OBJETO (compatível com Wix/export DOCX)
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
  return Object.values(sectionsObj).some((t) => typeof t === "string" && t.trim().length > 0);
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return sendError(res, 405, "METHOD_NOT_ALLOWED", "Use POST");

  const t0 = Date.now();

  try {
    rateLimit(req, res);
    authGuard(req);

    const payload = req.body || {};
    const v = validateDraftInput(payload);

    if (!v.ok) {
      return sendJson(res, 400, {
        ok: false,
        html: "",
        sections: emptySectionsObject(), // ✅ OBJETO
        alerts: v.alerts || [],
        missing: v.missing || [],
        meta: { stage: "validate", ms: Date.now() - t0 },
      });
    }

    const prompt = buildPrompt(payload);
    const raw = await callModel({ prompt, meta: { route: "draft/cobranca" } });

    const parsed = parseModel(raw);
    const out = assemble(parsed, { payload });

    // ✅ GARANTIA: sections sempre como OBJETO
    const sections =
      (out && out.sections && typeof out.sections === "object" && !Array.isArray(out.sections))
        ? out.sections
        : emptySectionsObject();

    const resp = {
      ok: !!(out && out.ok),
      html: (out && out.html) ? out.html : "",
      sections,
      alerts: Array.isArray(out && out.alerts) ? out.alerts : [],
      missing: Array.isArray(out && out.missing) ? out.missing : [],
      meta: {
        ...(out && out.meta ? out.meta : {}),
        ms: Date.now() - t0,
      },
    };

    // ✅ Log correto para OBJETO
    logger.info("DRAFT_COBRANCA_OK", {
      hasHtml: !!resp.html,
      hasSections: hasAnySectionText(resp.sections),
      keys: Object.keys(resp),
    });

    return sendJson(res, 200, resp);
  } catch (err) {
    const msg = (err && err.message) ? String(err.message) : "Erro inesperado";
    const status = (err && err.statusCode) ? Number(err.statusCode) : 500;

    logger.error("DRAFT_COBRANCA_ERR", { error: msg, status });

    return sendJson(res, status, {
      ok: false,
      html: "",
      sections: emptySectionsObject(), // ✅ OBJETO
      alerts: [{ level: "error", code: "DRAFT_COBRANCA_ERR", message: msg }],
      missing: [],
      meta: { stage: "handler", ms: Date.now() - t0 },
    });
  }
};
