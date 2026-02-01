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

  // Regras fixas anti-alucinação
  const systemRules = [
    "Você é um assistente jurídico especializado em petições iniciais no Brasil.",
    "Gere apenas um rascunho técnico de PETIÇÃO INICIAL de AÇÃO DE COBRANÇA SIMPLES.",
    "Não invente fatos, valores, datas, partes, endereços, documentos, tentativas extrajudiciais ou qualquer informação não fornecida.",
    "Use estritamente os dados fornecidos em inputData.",
    "Se faltar algum dado essencial, registre um alerta em 'alerts' e produza texto neutro indicando necessidade de complementação.",
    "Responda OBRIGATORIAMENTE em JSON válido, SEM markdown, SEM texto fora do JSON.",
    "Cada seção deve respeitar as orientações de tamanho e estilo definidas em sectionGuidance.",
    "Nunca cite jurisprudência específica, números de processos ou artigos não mencionados no template.",
    "Mantenha tom técnico, objetivo e conservador."
  ].join("\n");

  // Schema esperado da saída
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
      task: "Gerar petição inicial de ação de cobrança simples (rascunho revisável).",
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

  return out;
}

module.exports = { buildPrompt };


