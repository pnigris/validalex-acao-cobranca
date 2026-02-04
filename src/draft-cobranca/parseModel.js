/* ************************************************************************* */
/* Nome do codigo: src/draft-cobranca/parseModel.js                          */
/* Objetivo: extrair JSON do modelo e normalizar sections + alerts           */
/* ************************************************************************* */

const fs = require("fs");
const path = require("path");

function parseModel(modelRaw) {
  const text = getText(modelRaw);
  if (!text) throw new Error("Modelo retornou resposta vazia.");

  // 1) parse direto ou extraindo JSON do texto
  let obj = tryParseJson(text);
  if (!obj) {
    const extracted = extractJsonFromText(text);
    if (!extracted) throw new Error("Resposta do modelo não é JSON válido.");
    obj = tryParseJson(extracted);
  }
  if (!obj || typeof obj !== "object") throw new Error("Resposta do modelo não é JSON válido.");

  // 2) sections obrigatórias
  if (!obj.sections || typeof obj.sections !== "object" || Array.isArray(obj.sections)) {
    throw new Error("JSON inválido — falta 'sections' (objeto).");
  }

  const templateVersion = String(obj?.meta?.templateVersion || "cobranca_v1_2");
  const guidance = loadSectionGuidance(templateVersion);

  const sections = normalizeSections(obj.sections);

  const emptySectionAlerts = alertOnEmptySections(sections);
  const paragraphAlerts = validateParagraphLimits(sections, guidance);

  const modelAlerts = Array.isArray(obj.alerts) ? obj.alerts.map(normAlert) : [];
  const missing = Array.isArray(obj.missing) ? obj.missing : [];

  const meta = (obj.meta && typeof obj.meta === "object") ? obj.meta : {};
  meta.templateVersion = meta.templateVersion || templateVersion;

  return {
    ok: true,
    // html pode não existir no retorno do modelo; assemble pode criar fallback
    html: (typeof obj.html === "string") ? obj.html : "",
    sections,
    alerts: [...modelAlerts, ...paragraphAlerts, ...emptySectionAlerts],
    missing,
    meta
  };
}

/* =============================================================================
   Back-compat: alguns lugares podem chamar parseModelOutput
============================================================================= */
function parseModelOutput(modelRaw) {
  return parseModel(modelRaw);
}

/* =============================================================================
   Helpers
============================================================================= */

function getText(modelRaw) {
  if (modelRaw == null) return "";
  if (typeof modelRaw === "string") return modelRaw.trim();
  if (typeof modelRaw === "object" && modelRaw.text != null) return String(modelRaw.text).trim();
  return String(modelRaw).trim();
}

function tryParseJson(s) {
  try {
    return JSON.parse(String(s));
  } catch {
    return null;
  }
}

function extractJsonFromText(text) {
  const s = String(text || "");

  // bloco ```json ... ```
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced && fenced[1]) {
    const t = fenced[1].trim();
    if (t.startsWith("{") && t.endsWith("}")) return t;
  }

  // fallback: primeira { até última }
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) return s.slice(start, end + 1);

  return "";
}

function loadSectionGuidance(tplVersion) {
  const tplPath = path.join(process.cwd(), "templates", `${tplVersion}.json`);
  try {
    const raw = fs.readFileSync(tplPath, "utf8");
    const obj = JSON.parse(raw);
    return (obj && typeof obj === "object" && obj.sectionGuidance && typeof obj.sectionGuidance === "object")
      ? obj.sectionGuidance
      : {};
  } catch {
    return {};
  }
}

function normalizeSections(src) {
  return {
    enderecamento: safe(src?.enderecamento),
    qualificacao: safe(src?.qualificacao),
    fatos: safe(src?.fatos),
    direito: safe(src?.direito),
    pedidos: safe(src?.pedidos),
    valor_causa: safe(src?.valor_causa),
    requerimentos_finais: safe(src?.requerimentos_finais)
  };
}

function safe(v) {
  return typeof v === "string" ? v.trim() : "";
}

function alertOnEmptySections(sections) {
  const alerts = [];
  for (const [key, value] of Object.entries(sections || {})) {
    if (!value || value.length === 0) {
      alerts.push({
        level: "warn",
        code: "EMPTY_SECTION",
        message: `A seção '${key}' está vazia ou não foi gerada pelo modelo.`
      });
    }
  }
  return alerts;
}

function validateParagraphLimits(sections, guidance) {
  const alerts = [];
  for (const [key, text] of Object.entries(sections || {})) {
    const cfg = guidance ? guidance[key] : null;
    if (!cfg) continue;

    const parts = splitParagraphs(text);
    const count = parts.length;

    if (cfg.minParagraphs && count < cfg.minParagraphs) {
      alerts.push({
        level: "warn",
        code: "PARAGRAPH_TOO_SHORT",
        message: `A seção '${key}' possui apenas ${count} parágrafos (mínimo: ${cfg.minParagraphs}).`
      });
    }

    if (cfg.maxParagraphs && count > cfg.maxParagraphs) {
      alerts.push({
        level: "warn",
        code: "PARAGRAPH_TOO_LONG",
        message: `A seção '${key}' possui ${count} parágrafos (máximo: ${cfg.maxParagraphs}).`
      });
    }
  }
  return alerts;
}

function splitParagraphs(text) {
  return String(text || "")
    .trim()
    .split(/\n{2,}/g)
    .map((p) => p.trim())
    .filter(Boolean);
}

function normAlert(a) {
  const level = String(a?.level || "info").toLowerCase();
  return {
    level: ["info", "warn", "error"].includes(level) ? level : "info",
    code: a?.code || "MODEL_ALERT",
    message: a?.message || "Alerta retornado pelo modelo."
  };
}

module.exports = {
  parseModel,
  parseModelOutput
};
