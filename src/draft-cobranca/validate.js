/* src/draft-cobranca/validate.js — versão reescrita */

function validateDraftCobranca(data, { schema }) {
  const missingCritical = [];
  const alerts = [];

  for (const item of schema.requiredCritical) {
    const val = getByPath(data, item.path);
    if (isEmpty(val)) {
      missingCritical.push({ path: item.path, label: item.label });
    }
  }

  const reuEnd = String(getByPath(data, "partes.reu.endereco") || "");
  if (reuEnd && reuEnd.length < 12) {
    alerts.push({
      level: "warn",
      code: "REU_ENDERECO_FRACO",
      message: "Endereço do réu parece incompleto para fins de citação."
    });
  }

  const tentou = !!getByPath(data, "fatos.tentativa_extrajudicial");
  if (tentou) {
    const desc = String(getByPath(data, "fatos.descricao_orientada") || "");
    const hasExtraj = /whats|email|carta|cartório|notifica|extrajud/i.test(desc);
    if (!hasExtraj) {
      alerts.push({
        level: "info",
        code: "EXTRAJ_NAO_DESCRITA",
        message:
          "Tentativa extrajudicial marcada, mas o texto não descreve como ocorreu."
      });
    }
  }

  const docs = getByPath(data, "provas.documentos");
  if (!Array.isArray(docs) || docs.length === 0) {
    alerts.push({
      level: "warn",
      code: "SEM_DOCUMENTOS",
      message: "Nenhum documento fornecido; risco processual elevado."
    });
  }

  const valor = Number(getByPath(data, "divida.valor"));
  if (!Number.isFinite(valor) || valor <= 0) {
    alerts.push({
      level: "error",
      code: "VALOR_INVALIDO",
      message: "O valor da dívida é inválido."
    });
  }

  const dv = String(getByPath(data, "divida.data_vencimento") || "");
  if (dv && !/^\d{4}-\d{2}-\d{2}$/.test(dv)) {
    alerts.push({
      level: "warn",
      code: "DATA_FORMATO",
      message: "Data de vencimento deve seguir o formato YYYY-MM-DD."
    });
  }

  const valCausa = Number(getByPath(data, "config.valor_causa"));
  if (Number.isFinite(valor) && Number.isFinite(valCausa) && valCausa < valor) {
    alerts.push({
      level: "warn",
      code: "VALOR_CAUSA_MENOR_QUE_DIVIDA",
      message:
        "O valor da causa é inferior ao valor da dívida informada; verificar antes do protocolo."
    });
  }

  return { missingCritical, alerts };
}

function getByPath(obj, path) {
  return path.split(".").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function isEmpty(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

module.exports = { validateDraftCobranca };
