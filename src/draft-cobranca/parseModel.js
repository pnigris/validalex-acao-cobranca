/* src/draft-cobranca/parseModel.js — versão reescrita */

const fs = require("fs");
const path = require("path");

function parseModelOutput(modelRaw) {
  const text = modelRaw?.text ? String(modelRaw.text).trim() : "";
  if (!text) throw new Error("Modelo retornou resposta vazia.");

  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    const extracted = extractFirstJson(text);
    if (!extracted) throw new Error("Resposta do modelo não é JSON válido.");
    obj = JSON.parse(extracted);
  }

  if (!obj.sections) {
    throw new Error("JSON inválido — falta 'sections'.");
  }

  const templateVersion = obj?.meta?.templateVersion || "cobranca_v1_2";
  const guidance = loadSectionGuidance(templateVersion);

  const sections = normalizeSections(obj.sections);
  const emptySectionAlerts = alertOnEmptySections(sections);
  const paragraphAlerts = validateParagraphLimits(sections, guidance);

  const modelAlerts = (Array.isArray(obj.alerts) ? obj.alerts.map(normAlert) : []);

  return {
    sections,
    alerts: [...modelAlerts, ...paragraphAlerts, ...emptySectionAlerts],
    meta: obj.meta || {}
  };
}

/* Helpers */

function loadSectionGuidance(tplVersion) {
  const tplPath = path.join(process.cwd(), "templates", `${tplVersion}.json`);
  try {
    const raw = fs.readFileSync(tplPath, "utf8");
    return JSON.parse(raw).sectionGuidance || {};
  } catch {
    return {};
  }
}

function normalizeSections(src) {
  return {
    enderecamento: safe(src.enderecamento),
    qualificacao: safe(src.qualificacao),
    fatos: safe(src.fatos),
    direito: safe(src.direito),
    pedidos: safe(src.pedidos),
    valor_causa: safe(src.valor_causa),
    requerimentos_finais: safe(src.requerimentos_finais)
  };
}

function safe(v) {
  return typeof v === "string" ? v.trim() : "";
}

function alertOnEmptySections(sections) {
  const alerts = [];
  for (const [key, value] of Object.entries(sections)) {
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
  for (const [key, text] of Object.entries(sections)) {
    const cfg = guidance[key];
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
  const level = (a?.level || "info").toLowerCase();
  return {
    level: ["info", "warn", "error"].includes(level) ? level : "info",
    code: a?.code || "MODEL_ALERT",
    message: a?.message || "Alerta retornado pelo modelo."
  };
}

function extractFirstJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : "";
}

module.exports = { parseModelOutput };
