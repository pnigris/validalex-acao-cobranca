/* api/shared/logger.js - logs sem PII */

function sanitize(obj) {
    if (!obj || typeof obj !== "object") return obj;
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      // nunca logar PII óbvia
      if (/(cpf|cnpj|rg|endereco|address|email|telefone|phone|nome|name)/i.test(k)) {
        out[k] = "[REDACTED]";
      } else if (typeof v === "string" && v.length > 500) {
        out[k] = v.slice(0, 500) + "...";
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  
  function logInfo(event, meta) {
    console.log(JSON.stringify({ level: "info", event, meta: sanitize(meta), ts: new Date().toISOString() }));
  }
  
  function logWarn(event, meta) {
    console.warn(JSON.stringify({ level: "warn", event, meta: sanitize(meta), ts: new Date().toISOString() }));
  }
  
  function logError(event, meta) {
    console.error(JSON.stringify({ level: "error", event, meta: sanitize(meta), ts: new Date().toISOString() }));
  }
  
  module.exports = { logInfo, logWarn, logError };
  