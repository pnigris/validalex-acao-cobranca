/* src/draft-cobranca/validate.js */

function validateDraftCobranca(data, { schema }) {
    const missingCritical = [];
    const alerts = [];
  
    // Missing critical fields
    for (const item of schema.requiredCritical) {
      const val = getByPath(data, item.path);
      if (isEmpty(val)) {
        missingCritical.push({ path: item.path, label: item.label });
      }
    }
  
    // Deterministic alerts (não bloqueantes)
    // 1) Endereço do réu muito curto
    const reuEnd = String(getByPath(data, "partes.reu.endereco") || "");
    if (reuEnd && reuEnd.length < 12) {
      alerts.push({
        level: "warn",
        code: "REU_ENDERECO_FRACO",
        message: "Endereço do réu parece incompleto. Sem endereço correto, a citação pode falhar e o processo pode travar.",
      });
    }
  
    // 2) Tentativa extrajudicial marcada mas sem detalhe mínimo
    const tentou = !!getByPath(data, "fatos.tentativa_extrajudicial");
    if (tentou) {
      const desc = String(getByPath(data, "fatos.descricao_orientada") || "");
      const hasExtraj = /notifica|cobran|whats|email|extrajud|cart(a|ório)/i.test(desc);
      if (!hasExtraj) {
        alerts.push({
          level: "info",
          code: "EXTRAJ_NAO_DESCRITA",
          message: "Você marcou tentativa extrajudicial, mas a descrição dos fatos não menciona como foi feita (ex.: WhatsApp, e-mail, notificação).",
        });
      }
    }
  
    // 3) Prova documental mínima
    const docs = getByPath(data, "provas.documentos");
    const docsArr = Array.isArray(docs) ? docs : [];
    if (docsArr.length === 0) {
      alerts.push({
        level: "warn",
        code: "SEM_DOCUMENTOS",
        message: "Nenhum documento foi informado. Ação de cobrança sem prova documental mínima aumenta o risco (ex.: contrato, nota, recibo, conversas).",
      });
    }
  
    // 4) Valor inválido
    const valor = Number(getByPath(data, "divida.valor"));
    if (!Number.isFinite(valor) || valor <= 0) {
      alerts.push({
        level: "error",
        code: "VALOR_INVALIDO",
        message: "O valor devido parece inválido (<= 0 ou não numérico). Revise antes de gerar/protocolar.",
      });
    }
  
    // 5) Data de vencimento em formato suspeito
    const dv = String(getByPath(data, "divida.data_vencimento") || "");
    if (dv && !/^\d{4}-\d{2}-\d{2}$/.test(dv)) {
      alerts.push({
        level: "warn",
        code: "DATA_FORMATO",
        message: "A data de vencimento deveria estar no formato YYYY-MM-DD (ex.: 2026-01-29).",
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
  