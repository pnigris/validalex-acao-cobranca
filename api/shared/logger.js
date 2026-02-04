/* ************************************************************************* */
/* Nome do codigo: api/shared/logger.js                                      */
/* Objetivo: logger estruturado, seguro e leve (sem PII)                    */
/* ************************************************************************* */

const MAX_STRING = 500;
const MAX_DEPTH = 3;

// chaves sensíveis (case-insensitive)
const PII_KEYS = /(cpf|cnpj|rg|endereco|address|email|telefone|phone|nome|name)/i;

function sanitize(value, depth = 0) {
  try {
    if (depth > MAX_DEPTH) return "[TRUNCATED]";

    if (value == null) return value;

    if (typeof value === "string") {
      return value.length > MAX_STRING
        ? value.slice(0, MAX_STRING) + "..."
        : value;
    }

    if (typeof value !== "object") {
      return value;
    }

    if (Array.isArray(value)) {
      return value.slice(0, 20).map(v => sanitize(v, depth + 1));
    }

    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (PII_KEYS.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = sanitize(v, depth + 1);
      }
    }
    return out;

  } catch (_) {
    return "[UNSERIALIZABLE]";
  }
}

function emit(level, event, meta) {
  try {
    const payload = {
      level,
      event,
      meta: sanitize(meta),
      ts: new Date().toISOString()
    };

    // console.* é o padrão esperado pela Vercel
    if (level === "error") console.error(JSON.stringify(payload));
    else if (level === "warn") console.warn(JSON.stringify(payload));
    else console.log(JSON.stringify(payload));
  } catch (_) {
    // logger nunca pode quebrar request
  }
}

const logger = {
  info(event, meta) {
    emit("info", event, meta);
  },
  warn(event, meta) {
    emit("warn", event, meta);
  },
  error(event, meta) {
    emit("error", event, meta);
  }
};

module.exports = { logger };
