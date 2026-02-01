/* src/draft-cobranca/buildPrompt.js */

const fs = require("fs");
const path = require("path");

function buildPrompt(data, { templateVersion, promptVersion }) {
  const tplPath = path.join(process.cwd(), "templates", "cobranca_v1.json");

  // Carrega template JSON com proteção contra erros
  let tpl = {};
  try {
    const raw = fs.readFileSync(tplPath, "utf8");
    tpl = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Falha ao carregar template ${templateVersion}: ${e.message}`);
  }

  /**
   * Regras fixas anti-alucinação (exclusivo para AÇÃO DE COBRANÇA)
   * Observação: "fundamentos legais" e "artigos" só podem ser usados se estiverem
   * explicitamente no templateGuidance OU nos dados fornecidos em inputData.
   */
  const systemRules = [
    "Você é um Assistente Jurídico Sênior, especializado em redação de petições iniciais no Brasil.",
    "Gere apenas um RASCUNHO TÉCNICO de PETIÇÃO INICIAL de AÇÃO DE COBRANÇA (cobrança simples). Não é aconselhamento final.",
    "",
    "REGRAS OBRIGATÓRIAS (NÃO FLEXÍVEIS):",
    "1) PROIBIÇÃO ABSOLUTA DE INVENÇÃO:",
    "- NÃO invente fatos, datas, valores, juros, índices, endereços, qualificação, documentos, tentativas extrajudiciais, pedidos ou qualquer informação não fornecida.",
    "- NÃO crie jurisprudência, números de processos, nomes de tribunais, e NÃO cite artigos de lei que não estejam no templateGuidance ou expressamente informados no inputData.",
    "",
    "2) BASE DE DADOS:",
    "- Use estritamente os dados fornecidos em inputData.",
    "- Se faltar dado essencial, marque no texto como: [PENDENTE – informação não fornecida] e registre um alerta em alerts.",
    "- Se houver inconsistência (ex.: valores/datas conflitantes), NÃO escolha por conta própria: registre alerta e use redação neutra.",
    "",
    "3) PADRÃO DE REDAÇÃO:",
    "- Linguagem formal, técnica, clara, impessoal e conservadora (padrão de escritório).",
    "- Organize a peça com subtítulos e parágrafos objetivos; evite retórica e adjetivação excessiva.",
    "",
    "4) SAÍDA E FORMATAÇÃO:",
    "- Responda OBRIGATORIAMENTE em JSON válido, SEM markdown e SEM texto fora do JSON.",
    "- Produza as seções no formato de texto corrido (strings).",
    "- Não inclua comentários, explicações ou conteúdo fora do esquema de saída.",
  ].join("\n");

  // Schema esperado da saída (Ação de Cobrança)
  const outputSchema = {
    sections: {
      enderecamento: "string",
      qualificacao: "string",
      fatos: "string",
      fundamentos_juridicos: "string",
      pedidos: "string",
      valor_causa: "string",
      provas: "string",
      requerimentos_finais: "string",
      checklist_revisao: "string",
      alertas_risco: "string"
    },
    alerts: [{ level: "info|warn|error", code: "string", message: "string" }],
    meta: { promptVersion: "string", templateVersion: "string" }
  };

  // Instruções detalhadas por seção (derivadas do JSON)
  const sectionGuidance = buildSectionGuidance(tpl);

  // Monta instrução final para o modelo
  let userInstruction;
  try {
    userInstruction = JSON.stringify({
      task: "Gerar petição inicial de Ação de Cobrança (rascunho revisável).",
      constraints: {
        forbidHallucination: true,
        pendingMarker: "[PENDENTE – informação não fornecida]",
        noCaseLawUnlessProvided: true,
        lawArticlesOnlyIfProvidedInTemplateOrInput: true
      },
      requiredStructure: [
        "Endereçamento",
        "Qualificação das Partes",
        "Síntese dos Fatos",
        "Fundamentos Jurídicos",
        "Pedidos",
        "Valor da Causa",
        "Provas",
        "Requerimentos Finais",
        "Checklist de Revisão",
        "Alertas Técnicos e Riscos"
      ],
      templateGuidance: tpl,
      sectionGuidance,
      inputData: data,
      outputMustMatch: outputSchema,
      meta: { promptVersion, templateVersion }
    });
  } catch (e) {
    throw new Error(`Falha ao serializar userInstruction: ${e.message}`);
  }

  return {
    system: systemRules,
    user: userInstruction,
    meta: { promptVersion, templateVersion }
  };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function buildSectionGuidance(tpl) {
  const sg = tpl.sectionGuidance || {};
  const out = {};

  for (const [key, cfg] of Object.entries(sg)) {
    out[key] = {
      minParagraphs: cfg.minParagraphs || 1,
      maxParagraphs: cfg.maxParagraphs || 3,
      notes: cfg.notes || ""
    };
  }

  /**
   * Garante que as chaves esperadas existam no guidance, mesmo se o template
   * não estiver completo (sem inventar conteúdo — apenas fornece "casca" de orientação).
   */
  const ensureKeys = [
    "enderecamento",
    "qualificacao",
    "fatos",
    "fundamentos_juridicos",
    "pedidos",
    "valor_causa",
    "provas",
    "requerimentos_finais",
    "checklist_revisao",
    "alertas_risco"
  ];

  for (const k of ensureKeys) {
    if (!out[k]) {
      out[k] = { minParagraphs: 1, maxParagraphs: 3, notes: "" };
    }
  }

  return out;
}

module.exports = { buildPrompt };


