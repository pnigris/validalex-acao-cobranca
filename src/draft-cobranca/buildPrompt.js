/* *************************************************************************
/* Nome do codigo: src/draft-cobranca/buildPrompt.js
/* Objetivo: construir prompt jurídico determinístico, robusto e elaborado
/* Versão: 2.0 (robustez jurídica ampliada)
/* ************************************************************************* */

const fs = require("fs");
const path = require("path");

const DEFAULT_TEMPLATE_VERSION = "cobranca_v1_2";
const DEFAULT_PROMPT_VERSION = "2.0";

// Proteção contra payload gigante
const MAX_FIELD_CHARS = 8_000;

function buildPrompt(payload = {}) {
  const templateVersion = String(payload.templateVersion || DEFAULT_TEMPLATE_VERSION);
  const promptVersion = String(payload.promptVersion || DEFAULT_PROMPT_VERSION);

  const tplPath = path.join(process.cwd(), "templates", `${templateVersion}.json`);
  let tpl;
  try {
    tpl = JSON.parse(fs.readFileSync(tplPath, "utf8"));
  } catch (e) {
    throw new Error(`Falha ao carregar template ${templateVersion}: ${e.message}`);
  }

  const sectionGuidance = buildSectionGuidance(tpl);

  /* ---------------------------------------------------------------------- */
  /* SYSTEM PROMPT (regras fixas, não dependem do usuário)                   */
  /* ---------------------------------------------------------------------- */

  const system = [
    "Você é um assistente jurídico sênior especializado em petições cíveis brasileiras.",
    "",
    "═══════════════════════════════════════════════════════════════════════",
    "REGRAS OBRIGATÓRIAS (NÃO NEGOCIÁVEIS):",
    "═══════════════════════════════════════════════════════════════════════",
    "- Gere SEMPRE um RASCUNHO (não é aconselhamento final).",
    "- Nunca invente fatos, datas, documentos ou jurisprudência específica.",
    "- Jurisprudência: APENAS genérica e descritiva, sem número de processo, relator, data (STJ, TJ, STF, etc.).",
    "- Cite os artigos obrigatórios: CC 389, 395, 397; CPC 319, 373.",
    "- Pode mencionar CC 104, 421 e 422, de forma genérica.",
    "- Cite 'entendimento jurisprudencial predominante' apenas de forma genérica.",
    "- Não use referências específicas (REsp, AgRg, HC, AgInt, número de processo, relator, data).detalhe somente a existência da jurisprudência de forma eloquente",
    "- Use APENAS informações fornecidas no input.",
    "- Para a Origem da dívida, use EXCLUSIVAMENTE data.divida.origem_categoria e data.divida.origem_subtipo (e, se existir, data.divida.origem_label). Não inferir tipo de relação/contrato/título. Se faltar, use: [PENDENTE – INFORMAÇÃO NÃO FORNECIDA].",
    "- Se faltar algo essencial, escreva literalmente: [PENDENTE – INFORMAÇÃO NÃO FORNECIDA].",
    "",
    "═══════════════════════════════════════════════════════════════════════",
    "ESTILO DE REDAÇÃO (ADVOGADO SÊNIOR):",
    "═══════════════════════════════════════════════════════════════════════",
    "- Linguagem formal, clara e objetiva, com coesão e precisão técnica.",
    "- Evite prolixidade; cada parágrafo deve ter 1 tese.",
    "- Seção 'Do Direito' obrigatória, entre 6 e 10 parágrafos.",
    "",
    "═══════════════════════════════════════════════════════════════════════",
    "FORMATO DE SAÍDA (OBRIGATÓRIO):",
    "═══════════════════════════════════════════════════════════════════════",
    "Retorne JSON estrito com as chaves:",
    "- ok (boolean)",
    "- sections (objeto com: enderecamento, qualificacao, fatos, direito, pedidos, valor_causa, requerimentos_finais)",
    "- html (string opcional)",
    "- alerts (array)",
    "- missing (array)",
    "",
    "Se qualquer regra acima for violada, sua saída é considerada inválida e exige regeneração."
  ].join("\n");

  /* ---------------------------------------------------------------------- */
  /* USER PROMPT (dados + orientação dinâmica)                               */
  /* ---------------------------------------------------------------------- */

  const safeData = sanitizeInputData(payload.data || {});

  const user = JSON.stringify({
    task: "Gerar rascunho técnico, robusto e juridicamente elaborado de Ação de Cobrança.",
    inputData: safeData,
    sectionGuidance,
    meta: { promptVersion, templateVersion }
  });

  return {
    system,
    user,
    meta: { promptVersion, templateVersion }
  };
}

/* ==========================================================================
   Helpers
============================================================================ */

function sanitizeInputData(data) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (typeof v === "string") {
      out[k] = v.length > MAX_FIELD_CHARS
        ? v.slice(0, MAX_FIELD_CHARS) + "…"
        : v;
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    } else if (Array.isArray(v)) {
      out[k] = v.slice(0, 200);
    } else if (v && typeof v === "object") {
      out[k] = sanitizeInputData(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function buildSectionGuidance(tpl) {
  const sections = (tpl && tpl.sections && typeof tpl.sections === "object") ? tpl.sections : {};
  const out = {};
  for (const [k, v] of Object.entries(sections)) {
    out[k] = v;
  }
  return out;
}

module.exports = { buildPrompt };
