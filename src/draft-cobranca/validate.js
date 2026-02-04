/* ************************************************************************* */
/* Nome do codigo: src/draft-cobranca/validate.js                            */
/* Objetivo: validação jurídica determinística da Ação de Cobrança           */
/* ************************************************************************* */

/**
 * Valida dados antes do envio ao modelo.
 * Retorna estrutura padronizada para o backend.
 *
 * @param {Object} data
 * @param {Object} schema
 * @param {Object=} meta
 * @returns {{
 *   ok: boolean,
 *   missing: Array<{ path:string, label:string }>,
 *   alerts: Array<{ level:string, code:string, message:string }>,
 *   meta: Object
 * }}
 */
function validateDraftInput(data, schema = {}, meta = {}) {
  const missing = [];
  const alerts = [];

  const required = Array.isArray(schema.requiredCritical)
    ? schema.requiredCritical
    : [];

  // -----------------------------------------------------------------------
  // Campos críticos obrigatórios
  // -----------------------------------------------------------------------
  for (const item of required) {
    const val = getByPath(data, item.path);
    if (isEmpty(val)) {
      missing.push({ path: item.path, label: item.label });
    }
  }

  // -----------------------------------------------------------------------
  // Endereço do réu
  // -----------------------------------------------------------------------
  const reuEnd = String(getByPath(data, "partes.reu.endereco") || "");
  if (reuEnd && reuEnd.length < 12) {
    alerts.push({
      level: "warn",
      code: "REU_ENDERECO_FRACO",
      message: "Endereço do réu parece incompleto para fins de citação."
    });
  }

  // -----------------------------------------------------------------------
  // Tentativa extrajudicial
  // -----------------------------------------------------------------------
  const tentou = !!getByPath(data, "fatos.tentativa_extrajudicial");
  if (tentou) {
    const desc = String(getByPath(data, "fatos.descricao_orientada") || "");
    const hasExtraj = /whats|email|carta|cart[oó]rio|notifica|extrajud/i.test(desc);
    if (!hasExtraj) {
      alerts.push({
        level: "info",
        code: "EXTRAJ_NAO_DESCRITA",
        message:
          "Tentativa extrajudicial marcada, mas o texto não descreve como ocorreu."
      });
    }
  }

  // -----------------------------------------------------------------------
  // Provas
  // -----------------------------------------------------------------------
  const docs = getByPath(data, "provas.documentos");
  if (!Array.isArray(docs) || docs.length === 0) {
    alerts.push({
      level: "warn",
      code: "SEM_DOCUMENTOS",
      message: "Nenhum documento fornecido; risco processual elevado."
    });
  }

  // -----------------------------------------------------------------------
  // Valor da dívida
  // -----------------------------------------------------------------------
  const valor = Number(getByPath(data, "divida.valor"));
  if (!Number.isFinite(valor) || valor <= 0) {
    alerts.push({
      level: "error",
      code: "VALOR_INVALIDO",
      message: "O valor da dívida é inválido."
    });
  }

  // -----------------------------------------------------------------------
  // Data de vencimento
  // -----------------------------------------------------------------------
  const dv = String(getByPath(data, "divida.data_vencimento") || "");
  if (dv && !/^\d{4}-\d{2}-\d{2}$/.test(dv)) {
    alerts.push({
      level: "warn",
      code: "DATA_FORMATO",
      message: "Data de vencimento deve seguir o formato YYYY-MM-DD."
    });
  }

  // -----------------------------------------------------------------------
  // Valor da causa x valor da dívida
  // -----------------------------------------------------------------------
  const valCausa = Number(getByPath(data, "config.valor_causa"));
  if (Number.isFinite(valor) && Number.isFinite(valCausa) && valCausa < valor) {
    alerts.push({
      level: "warn",
      code: "VALOR_CAUSA_MENOR_QUE_DIVIDA",
      message:
        "O valor da causa é inferior ao valor da dívida informada; verificar antes do protocolo."
    });
  }

  // -----------------------------------------------------------------------
  // Resultado final padronizado
  // -----------------------------------------------------------------------
  return {
    ok: missing.length === 0,
    missing,
    alerts,
    meta
  };
}

/* ==========================================================================
   Helpers
============================================================================ */

function getByPath(obj, path) {
  return path
    .split(".")
    .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function isEmpty(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

module.exports = { validateDraftInput };
