/* ************************************************************************* */
/* api/draft/cobranca.js - versão corrigida para incluir sections na resposta */
/* Data: 04/02/2026                                                           */
/* Correção crítica: sections agora incluído na resposta final                */
/* ************************************************************************* */

const { requireAuth } = require("../shared/auth");
const { rateLimit } = require("../shared/rateLimit");
const { ok, badRequest, unauthorized, tooManyRequests, serverError } = require("../shared/response");
const { logInfo, logWarn, logError } = require("../shared/logger");
const { renderHtmlRelatorio } = require("../shared/htmlRender");

const schema = require("../../src/draft-cobranca/schema");
const { validateDraftCobranca } = require("../../src/draft-cobranca/validate");
const { buildPrompt } = require("../../src/draft-cobranca/buildPrompt");
const { callModel } = require("../../src/draft-cobranca/callModel");
const { parseModelOutput } = require("../../src/draft-cobranca/parseModel");
const { assembleHtml } = require("../../src/draft-cobranca/assemble");

module.exports = async (req, res) => {
  const startedAt = Date.now();

  try {
    if (req.method !== "POST") {
      return badRequest(res, "Use POST em /api/draft/cobranca");
    }

    try {
      requireAuth(req);
    } catch (e) {
      logWarn("AUTH_FAIL", { ip: getIp(req), reason: e.message });
      return unauthorized(res, "Não autorizado");
    }

    const ip = getIp(req);
    const limitPerMin = parseInt(process.env.RATE_LIMIT_PER_MINUTE || "30", 10);
    const rl = rateLimit({ key: ip, limit: limitPerMin, windowMs: 60_000 });
    if (!rl.allowed) {
      return tooManyRequests(res, "Muitas requisições. Tente novamente em instantes.", rl);
    }

    const body = await readJson(req);
    const jobId = safeString(body.jobId) || `job_${Date.now()}`;
    const userId = safeString(body.userId) || "anon";
    const data = body.data || {};

    if (!data || typeof data !== "object") {
      return badRequest(res, "Campo 'data' inválido (JSON).");
    }

    const v = validateDraftCobranca(data, { schema });

    /* ----------------------------------------------------------------------
       CASO 1: Dados críticos faltantes
    ---------------------------------------------------------------------- */
    if (v.missingCritical.length > 0) {
      const html = renderHtmlRelatorio({
        title: "Rascunho NÃO gerado – faltam dados críticos",
        subtitle: "Complete os campos abaixo para gerar a petição com segurança.",
        alertsForHtml: groupAlertsForHtml([
          ...v.alerts,
          ...v.missingCritical.map((m) => ({
            level: "error",
            code: "MISSING_CRITICAL",
            message: `Campo obrigatório ausente: ${m.label}`
          }))
        ]),
        sections: [
          {
            heading: "Campos críticos faltantes",
            bodyHtml: `<ul>${v.missingCritical
              .map((m) => `<li><b>${escapeHtml(m.label)}</b> (${escapeHtml(m.path)})</li>`)
              .join("")}</ul>`
          }
        ],
        meta: {
          jobId,
          promptVersion: "cobranca-1.2.0",
          templateVersion: "cobranca_v1_2",
          schemaVersion: schema.version
        }
      });

      logInfo("DRAFT_COBRANCA_MISSING", {
        jobId,
        userIdHash: hashLite(userId),
        ip,
        ms: Date.now() - startedAt
      });

      // 🔥 CORREÇÃO: sections vazio quando faltam dados críticos
      return ok(res, {
        ok: true,
        html,
        sections: {},  // Vazio: não há conteúdo gerado
        alerts: v.alerts,
        missing: v.missingCritical,
        meta: {
          jobId,
          promptVersion: "cobranca-1.2.0",
          templateVersion: "cobranca_v1_2",
          schemaVersion: schema.version
        }
      });
    }

    /* ----------------------------------------------------------------------
       CASO 2: Geração bem-sucedida
    ---------------------------------------------------------------------- */
    const prompt = buildPrompt(data, {
      templateVersion: "cobranca_v1_2",
      promptVersion: "cobranca-1.2.0"
    });

    const modelRaw = await callModel({ prompt });

    const parsed = parseModelOutput(modelRaw);

    const assembled = assembleHtml({
      data,
      sections: parsed.sections,
      alerts: [...v.alerts, ...parsed.alerts],
      meta: parsed.meta
    });

    const html = renderHtmlRelatorio({
      title: "Rascunho – Petição Inicial (Ação de Cobrança)",
      subtitle: "Rascunho técnico para revisão profissional antes do protocolo.",
      alertsForHtml: assembled.alertsForHtml,
      sections: assembled.sectionsForHtmlRelatorio,
      meta: assembled.meta
    });

    logInfo("DRAFT_COBRANCA_OK", {
      jobId,
      userIdHash: hashLite(userId),
      ip,
      ms: Date.now() - startedAt,
      model: assembled.meta.model
    });

    // 🔥 CORREÇÃO CRÍTICA: incluir sections na resposta final
    // sections vem de parsed.sections (parseModel), NÃO de assembled
    return ok(res, {
      ok: true,
      html,
      sections: parsed.sections,  // ✅ CORRETO: objeto com 7 seções plain
      alerts: [...v.alerts, ...parsed.alerts],
      missing: [],
      meta: assembled.meta
    });

  } catch (e) {
    logError("DRAFT_COBRANCA_ERR", { ip: getIp(req), error: e.message });
    return serverError(res, "Erro ao gerar rascunho.");
  }
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function groupAlertsForHtml(alerts) {
  const out = { error: [], warn: [], info: [] };

  for (const a of alerts || []) {
    const lvl = (a.level || "info").toLowerCase();
    if (lvl === "error") out.error.push(a);
    else if (lvl === "warn") out.warn.push(a);
    else out.info.push(a);
  }

  return out;
}

function getIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  return req.socket?.remoteAddress ? String(req.socket.remoteAddress) : "unknown";
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;

  const chunks = [];
  await new Promise((resolve, reject) => {
    req.on("data", (c) => chunks.push(c));
    req.on("end", resolve);
    req.on("error", reject);
  });

  const raw = Buffer.concat(chunks).toString("utf8") || "{}";
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("JSON inválido no body.");
  }
}

function safeString(v) {
  return (typeof v === "string" && v.trim()) ? v.trim() : "";
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function hashLite(s) {
  let h = 2166136261;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `h${(h >>> 0).toString(16)}`;
}