/* src/draft-cobranca/parseModelOutput.js */

const fs = require("fs");
const path = require("path");

function parseModelOutput(modelRaw) {
  const text = (modelRaw && modelRaw.text) ? String(modelRaw.text).trim() : "";
  if (!text) throw new Error("Modelo retornou resposta vazia.");

  // Tenta parsear JSON diretamente
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    const extracted = extractFirstJson(text);
    if (!extracted) throw new Error("Resposta do modelo não é JSON válido.");
    obj = JSON.parse(extracted);
  }

  if (!obj.sections || typeof obj.sections !== "object") {
    throw new Error("JSON do modelo inválido: faltou 'sections'.");
  }

  // Carrega sectionGuidance do template
  const guidance = loadSectionGuidance();

  // Normaliza seções
  const sections = {
    enderecamento: safeStr(obj.sections.enderecamento),
    qualificacao: safeStr(obj.sections.qualificacao),
    fatos: safeStr(obj.sections.fatos),
    direito: safeStr(obj.sections.direito),
    pedidos: safeStr(obj.sections.pedidos),
    valor_causa: safeStr(obj.sections.valor_causa),
    requerimentos_finais: safeStr(obj.sections.requerimentos_finais)
  };

  // Valida limites de parágrafos
  const paragraphAlerts = validateParagraphLimits(sections, guidance);

  // Normaliza alerts do modelo
  const modelAlerts = Array.isArray(obj.alerts) ? obj.alerts.map(normAlert) : [];

  // Junta alerts do modelo + alerts de parágrafo
  const alerts = [...modelAlerts, ...paragraphAlerts];

  const meta = obj.meta && typeof obj.meta === "object" ? obj.meta : {};

  return { sections, alerts, meta };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function loadSectionGuidance() {
  const tplPath = path.join(process.cwd(), "templates", "cobranca_v1.json");
  try {
    const raw = fs.readFileSync(tplPath, "utf8");
    const tpl = JSON.parse(raw);
    return tpl.sectionGuidance || {};
  } catch (e) {
    // fallback seguro
    return {};
  }
}

function validateParagraphLimits(sections, guidance) {
  const alerts = [];

  for (const [key, text] of Object.entries(sections)) {
    const cfg = guidance[key];
    if (!cfg) continue;

    const paragraphs = splitParagraphs(text);
    const count = paragraphs.length;

    if (count < cfg.minParagraphs) {
      alerts.push({
        level: "warn",
        code: "PARAGRAPH_TOO_SHORT",
        message: `A seção '${key}' possui apenas ${count} parágrafo(s), abaixo do mínimo (${cfg.minParagraphs}).`
      });
    }

    if (count > cfg.maxParagraphs) {
      alerts.push({
        level: "warn",
        code: "PARAGRAPH_TOO_LONG",
        message: `A seção '${key}' possui ${count} parágrafos, acima do máximo (${cfg.maxParagraphs}).`
      });
    }
  }

  return alerts;
}

function splitParagraphs(text) {
  const t = String(text || "").trim();
  if (!t) return [];
  return t
    .split(/\n{2,}/g)
    .map(p => p.trim())
    .filter(Boolean);
}

function normAlert(a) {
  const level = (a && a.level) ? String(a.level).toLowerCase() : "info";
  return {
    level: ["info", "warn", "error"].includes(level) ? level : "info",
    code: a && a.code ? String(a.code) : "MODEL_ALERT",
    message: a && a.message ? String(a.message) : "Atenção: alerta do modelo."
  };
}

function safeStr(v) {
  return (typeof v === "string") ? v.trim() : "";
}

function extractFirstJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return "";
}

module.exports = { parseModelOutput };
