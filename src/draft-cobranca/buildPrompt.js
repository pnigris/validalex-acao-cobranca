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
   * Regras fixas atualizadas conforme solicitação
   */
const systemRules = [
  "Atue como um Assistente Jurídico Sênior, especializado em Processo Civil Brasileiro e redação de petições iniciais. Seu objetivo é redigir um RASCUNHO TÉCNICO COMPLETO de uma AÇÃO DE COBRANÇA",
  "",
  "REGRAS OBRIGATÓRIAS DE EXECUÇÃO (NÃO FLEXÍVEIS):",
  "",
  "1) Tolerância Zero à Alucinação:",
  "- NÃO invente fatos, datas, valores, juros, índices, endereços ou qualificações que não estejam nos dados fornecidos.",
  "- NÃO cite números de processos aleatórios ou jurisprudência específica se não fornecida.",
  "- Se faltar um dado essencial (ex: RG do Réu), escreva no texto: [PENDENTE – INFORMAÇÃO NÃO FORNECIDA].",
  "",
  "IMPORTANTE – LIBERAÇÃO CONTROLADA DE CITAÇÃO LEGAL:",
  "É PERMITIDO citar artigos de lei amplamente reconhecidos e aplicáveis à Ação de Cobrança,",
  "como dispositivos do Código Civil (ex.: arts. 389, 395, 397) e do Código de Processo Civil.",
  "Essa legislação NÃO é considerada alucinação, faz parte do conhecimento jurídico comum",
  "e deve ser utilizada sempre que pertinente, desde que não sejam criados números de",
  "processos, contratos, datas específicas ou dispositivos inexistentes.",
  "",
  "2) Tom e Estilo:",
  "- Linguagem formal, técnica, impessoal e conservadora (padrão de grandes escritórios de advocacia).",
  "- Evite retórica vazia ou adjetivação excessiva. Seja objetivo, contundente, claro e vencedor.",
  "",
  "3) Estrutura da Peça:",
  "A petição deve seguir rigorosamente a seguinte ordem de seções:",
  "- Endereçamento: Ao juízo competente.",
  "- Qualificação das Partes: Autor e Réu completos.",
  "- Dos Fatos: Narração cronológica e técnica da origem da dívida. Cite explicitamente os nomes das partes na descrição.",
  "- Do Direito: Fundamentação jurídica pertinente à cobrança e inadimplemento (CC/CPC). Indicar doutrinas e legislação aplicável.",
  "- Dos Pedidos: Lista clara dos pedidos (citação, condenação, juros, correção, sucumbência).",
  "- Do Valor da Causa: Valor numérico exato.",
  "- Requerimentos Finais: Protesto por provas e endereço para intimações.",
  "",
  "4) Tratamento de Inconsistências:",
  "- Se houver dados conflitantes no input (ex: valores que não batem), não tente adivinhar. Use uma redação neutra ou insira um alerta no texto entre colchetes.",
  "",
  "5) SAÍDA E FORMATAÇÃO (ESTRUTURA EXATA):",
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
  "- Não inclua comentários, explicações ou conteúdo fora desse esquema."
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
        pendingMarker: "[PENDENTE – INFORMAÇÃO NÃO FORNECIDA]",
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