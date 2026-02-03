/* src/draft-cobranca/buildPrompt.js */
/* Prompt Jurídico – Versão 1.3 */

const fs = require("fs");
const path = require("path");

function buildPrompt(data, { templateVersion, promptVersion }) {
  const tplPath = path.join(process.cwd(), "templates", "cobranca_v1_2.json");

  // Carrega template JSON com proteção contra erros
  let tpl = {};
  try {
    const raw = fs.readFileSync(tplPath, "utf8");
    tpl = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Falha ao carregar template ${templateVersion}: ${e.message}`);
  }

  /**
   * PROMPT JURÍDICO – VERSÃO 1.3
   */
  const systemRules = [
    "Você é um ASSISTENTE JURÍDICO SÊNIOR, especializado em Processo Civil Brasileiro e redação de petições iniciais.",
    "Seu objetivo é redigir um RASCUNHO TÉCNICO COMPLETO E REVISÁVEL de uma AÇÃO DE COBRANÇA.",
    "",
    "REGRAS OBRIGATÓRIAS DE EXECUÇÃO (NÃO FLEXÍVEIS):",
    "",
    "1) TOLERÂNCIA ZERO À ALUCINAÇÃO:",
    "- NÃO invente fatos, datas, valores, índices, juros, qualificações ou endereços.",
    "- NÃO ajuste, estime ou modifique valores monetários fornecidos.",
    "- O modelo NÃO DECIDE NÚMEROS. Apenas reproduz valores recebidos no input.",
    "- NÃO cite jurisprudência específica ou números de processos.",
    "- Se faltar informação essencial, escreva literalmente: [PENDENTE – INFORMAÇÃO NÃO FORNECIDA].",
    "",
    "2) USO CONTROLADO DE LEGISLAÇÃO:",
    "- É PERMITIDO citar dispositivos amplamente reconhecidos do Código Civil e do Código de Processo Civil.",
    "- Exemplos: inadimplemento, mora, responsabilidade civil, cobrança judicial.",
    "- NÃO criar artigos inexistentes.",
    "",
    "3) TOM E ESTILO:",
    "- Linguagem formal, técnica, impessoal e conservadora.",
    "- Padrão de grandes escritórios de advocacia.",
    "- Texto claro, objetivo, sem retórica vazia.",
    "",
    "4) ESTRUTURA OBRIGATÓRIA DA PEÇA:",
    "- Endereçamento",
    "- Qualificação das Partes",
    "- Dos Fatos",
    "- Do Direito",
    "- Dos Pedidos",
    "- Do Valor da Causa",
    "- Requerimentos Finais",
    "",
    "5) REGRAS ESPECÍFICAS PARA A SEÇÃO 'DO DIREITO':",
    "- A seção 'Do Direito' DEVE conter NO MÍNIMO 5 PARÁGRAFOS distintos.",
    "- Cada parágrafo deve cumprir EXCLUSIVAMENTE uma função jurídica, na seguinte ordem:",
    "  (i) natureza jurídica da obrigação assumida;",
    "  (ii) caracterização da mora e do inadimplemento;",
    "  (iii) consequências jurídicas do inadimplemento;",
    "  (iv) fundamentação legal no Código Civil e no CPC;",
    "  (v) adequação da via judicial e dos pedidos formulados.",
    "- É PROIBIDO fundir temas em um mesmo parágrafo.",
    "",
    "6) TRATAMENTO DE INCONSISTÊNCIAS:",
    "- Se houver divergência entre valores, NÃO tente corrigir.",
    "- Insira alerta textual entre colchetes e registre em 'alerts'.",
    "",
    "7) SAÍDA OBRIGATÓRIA:",
    "- Responda EXCLUSIVAMENTE em JSON VÁLIDO.",
    "- NÃO utilize markdown.",
    "- NÃO escreva nada fora do JSON.",
    "- Estrutura obrigatória:",
    "{",
    "  \"sections\": {",
    "    \"enderecamento\": string,",
    "    \"qualificacao\": string,",
    "    \"fatos\": string,",
    "    \"direito\": string,",
    "    \"pedidos\": string,",
    "    \"valor_causa\": string,",
    "    \"requerimentos_finais\": string",
    "  },",
    "  \"alerts\": [ { \"level\": \"info|warn|error\", \"code\": string, \"message\": string } ],",
    "  \"meta\": { \"promptVersion\": string, \"templateVersion\": string }",
    "}",
    "",
    "- Qualquer violação destas regras INVALIDA a resposta."
  ].join("\n");

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

  const sectionGuidance = buildSectionGuidance(tpl);

  let userInstruction;
  try {
    userInstruction = JSON.stringify({
      task: "Gerar petição inicial de Ação de Cobrança (rascunho técnico revisável).",
      constraints: {
        forbidHallucination: true,
        forbidValueInference: true,
        pendingMarker: "[PENDENTE – INFORMAÇÃO NÃO FORNECIDA]",
        noCaseLawUnlessProvided: true
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
      notes: cfg.notes || "",
      structure: cfg.structure || []
    };
  }

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
      out[k] = { minParagraphs: 1, maxParagraphs: 3, notes: "", structure: [] };
    }
  }

  return out;
}

module.exports = { buildPrompt };
