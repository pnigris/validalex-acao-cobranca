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
    "REGRAS PARA 'DO DIREITO' (ROBUSTO – OBRIGATÓRIO):",
    "- Entre 6 e 10 parágrafos.",
    "- 1 tese por parágrafo (não misturar temas).",
    "- Não repetir ideias.",
    "- Deve citar explicitamente: CC arts. 389, 395 e 397; CPC arts. 319 e 373.",
    "- Menções adicionais ao CC (arts. 104, 421 e 422) são permitidas apenas em nível geral, sem criar fatos.",
    "- Jurisprudência: permitido apenas referência GENÉRICA a entendimento predominante (sem número, relator, data ou identificação de caso).",
    "- É proibido citar jurisprudência específica, súmulas, acórdãos com identificadores.",
    "- Estrutura obrigatória (1 item = 1 parágrafo):",
    "  (1) validade da relação obrigacional (CC 104; menção geral a CC 421/422);",
    "  (2) natureza da obrigação e exigibilidade do crédito (pagar quantia certa);",
    "  (3) inadimplemento e mora (CC 397);",
    "  (4) consequências do inadimplemento (perdas e danos, juros e correção) — sem fixar índice/termo inicial sem input (CC 389 e 395);",
    "  (5) ônus da prova e estratégia probatória (CPC 373), com ênfase em prova documental; mencionar defesas típicas apenas como tese geral (pagamento, inexistência, excesso);",
    "  (6) requisitos formais e adequação da via eleita (CPC 319) e coerência com os pedidos;",
    "  (7) honorários sucumbenciais apenas como pedido (CPC 85), sem quantificar;",
    "  (8) fecho lógico: ligação entre fatos apresentados, norma aplicável e pedidos.",
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
