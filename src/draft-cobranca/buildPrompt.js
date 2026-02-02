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
   */
  const systemRules = [
    "Você é um Assistente Jurídico Sênior, especializado em redação de petições iniciais no Brasil.",
    "Gere apenas um RASCUNHO TÉCNICO de PETIÇÃO INICIAL de AÇÃO DE COBRANÇA. Não é aconselhamento final.",
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
    "- Linguagem formal, rebuscada, teor completo, vencedora, técnica, clara, impessoal e conservadora (padrão de escritório).",
    "- Citar o nome do requerente/autor e réu nas descrição dos fatos se a informação não estiver no mesmo.",
    "- Organize a peça com subtítulos e parágrafos objetivos; evite retórica e adjetivação excessiva.",
    "",
    "4) SAÍDA E FORMATAÇÃO (ESTRUTURA EXATA):",
    "- Responda OBRIGATORIAMENTE em JSON válido, SEM markdown e SEM texto fora do JSON.",
    "- O JSON DEVE ter EXATAMENTE a seguinte estrutura de topo:",
    "  {",
    "    \"sections\": {",
    "      \"enderecamento\": string,",
    "      \"qualificacao\": string,",
    "      \"fatos\": string,",
    "      \"direito\": string,",
    "      \"pedidos\": string,",
    "      \"valor_causa\": string,",
    "      \"requerimentos_finais\": string",
    "    },",
    "    \"alerts\": [ { \"level\": \"info|warn|error\", \"code\": string, \"message\": string } ],",
    "    \"meta\": { \"promptVersion\": string, \"templateVersion\": string }",
    "  }",
    "- NÃO coloque campos como 'enderecamento', 'qualificacao', etc. soltos na raiz. Eles DEVEM estar dentro de 'sections'.",
    "- Não inclua comentários, explicações ou conteúdo fora desse esquema.",
  ].join("\n");

  // Schema esperado da saída (Ação de Cobrança) – ALINHADO COM parseModel/assemble
  const outputSchema = {
    sections: {
      enderecamento: "string",
      qualificacao: "string",
      fatos: "string",
      direito: "string",
      pedidos: "string",
      valor_causa: "string",
      requerimentos_finais: "string"
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
        "Dos Fatos",
        "Do Direito",
        "Dos Pedidos",
        "Do Valor da Causa",
        "Requerimentos Finais"
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

  // Garante que as chaves esperadas existam no guidance
  const ensureKeys = [
    "enderecamento",
    "qualificacao",
    "fatos",
    "direito",
    "pedidos",
    "valor_causa",
    "requerimentos_finais"
  ];

  for (const k of ensureKeys) {
    if (!out[k]) {
      out[k] = { minParagraphs: 1, maxParagraphs: 3, notes: "" };
    }
  }

  return out;
}

module.exports = { buildPrompt };



