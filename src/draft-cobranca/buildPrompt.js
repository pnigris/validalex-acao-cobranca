/* ************************************************************************* */
/* Nome do codigo: src/draft-cobranca/buildPrompt.js                         */
/* Objetivo: construir prompt jurídico determinístico e econômico            */
/* ************************************************************************* */

const fs = require("fs");
const path = require("path");

const DEFAULT_TEMPLATE_VERSION = "cobranca_v1_2";
const DEFAULT_PROMPT_VERSION = "1.3";

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
    "Você é um ASSISTENTE JURÍDICO SÊNIOR, especialista em Processo Civil Brasileiro.",
    "Sua tarefa é redigir um RASCUNHO TÉCNICO e REVISÁVEL de uma AÇÃO DE COBRANÇA.",
    "",
    "REGRAS OBRIGATÓRIAS:",
    "- NÃO invente fatos, datas, valores, partes ou documentos.",
    "- NÃO estime ou calcule valores.",
    "- NÃO cite jurisprudência específica.",
    "- Use APENAS informações fornecidas.",
    "- Se faltar algo essencial, escreva literalmente: [PENDENTE – INFORMAÇÃO NÃO FORNECIDA].",
    "",
    "ESTILO:",
    "- Linguagem formal, técnica e conservadora.",
    "- Texto claro, direto, sem retórica vazia.",
    "",
    "ESTRUTURA OBRIGATÓRIA:",
    "- Endereçamento",
    "- Qualificação das Partes",
    "- Dos Fatos",
    "- Do Direito",
    "- Dos Pedidos",
    "- Do Valor da Causa",
    "- Requerimentos Finais",
    "",
    "REGRAS PARA 'DO DIREITO':",
    "- NO MÍNIMO 5 parágrafos.",
    "- Cada parágrafo com função jurídica distinta:",
    "  (1) natureza da obrigação;",
    "  (2) mora e inadimplemento;",
    "  (3) consequências jurídicas;",
    "  (4) fundamentos legais (CC e CPC);",
    "  (5) adequação da via judicial.",
    "",
    "SAÍDA OBRIGATÓRIA:",
    "- Responda EXCLUSIVAMENTE em JSON VÁLIDO.",
    "- NÃO use markdown.",
    "- Estrutura:",
    "{",
    "  sections: {",
    "    enderecamento: string,",
    "    qualificacao: string,",
    "    fatos: string,",
    "    direito: string,",
    "    pedidos: string,",
    "    valor_causa: string,",
    "    requerimentos_finais: string",
    "  },",
    "  alerts: [ { level, code, message } ],",
    "  meta: { promptVersion, templateVersion }",
    "}",
    "",
    "Qualquer violação invalida a resposta."
  ].join("\n");

  /* ---------------------------------------------------------------------- */
  /* USER PROMPT (dados + orientação dinâmica)                               */
  /* ---------------------------------------------------------------------- */

  const safeData = sanitizeInputData(payload.data || {});

  const user = JSON.stringify({
    task: "Gerar rascunho técnico de Ação de Cobrança.",
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
    } else if (typeof v === "object" && v !== null) {
      out[k] = sanitizeInputData(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function buildSectionGuidance(tpl) {
  const sg = tpl.sectionGuidance || {};
  const out = {};

  const keys = [
    "enderecamento",
    "qualificacao",
    "fatos",
    "direito",
    "pedidos",
    "valor_causa",
    "requerimentos_finais"
  ];

  for (const k of keys) {
    const cfg = sg[k] || {};
    out[k] = {
      minParagraphs: cfg.minParagraphs || 1,
      maxParagraphs: cfg.maxParagraphs || 5,
      notes: cfg.notes || "",
      structure: cfg.structure || []
    };
  }

  return out;
}

module.exports = { buildPrompt };
