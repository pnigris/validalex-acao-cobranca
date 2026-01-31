// api/draft/cobranca/docx.js (versão revisada)

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

/* -------------------------------------------------------------------------- */
/* CORS + Helpers                                                              */
/* -------------------------------------------------------------------------- */

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function ok(res, data) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ ok: true, ...data }));
}

function err(res, status, message, details) {
  res.statusCode = status || 400;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(
    JSON.stringify({
      ok: false,
      error: message || "Erro",
      details: details || undefined
    })
  );
}

function getBearerToken(req) {
  const h = req.headers.authorization || req.headers.Authorization || "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

function authOr401(req, res) {
  const expected = process.env.VALIDALEX_SHARED_TOKEN || "";
  if (!expected) {
    err(res, 500, "Servidor sem VALIDALEX_SHARED_TOKEN configurado");
    return false;
  }
  const got = getBearerToken(req);
  if (!got || got !== expected) {
    err(res, 401, "Não autorizado");
    return false;
  }
  return true;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) reject(new Error("Payload muito grande"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("JSON inválido"));
      }
    });
  });
}

function hasText(s) {
  return typeof s === "string" && s.trim().length > 0;
}

/* -------------------------------------------------------------------------- */
/* Formatação                                                                   */
/* -------------------------------------------------------------------------- */

function formatBRL(value) {
  const n = Number(value || 0);
  try {
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${n.toFixed(2)}`;
  }
}

function formatDateBR(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ""))) return "";
  const [y, m, d] = String(ymd).split("-");
  return `${d}/${m}/${y}`;
}

function formatLocalData() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padPadStart(2, "0");
  const year = String(now.getFullYear());
  return `Local, ${day}/${month}/${year}.`;
}

/* -------------------------------------------------------------------------- */
/* Placeholders                                                                 */
/* -------------------------------------------------------------------------- */

function buildPlaceholders(data) {
  const autor = (data.partes && data.partes.autor) || {};
  const reu = (data.partes && data.partes.reu) || {};
  const divida = data.divida || {};
  const fatos = data.fatos || {};
  const config = data.config || {};

  const juizo = hasText(config.juizo)
    ? config.juizo.trim()
    : "___ Vara Cível da Comarca de ___";

  return {
    JUIZO_COMPETENTE: juizo,

    AUTOR_NOME: (autor.nome || "").trim(),
    AUTOR_CPF_CNPJ: (autor.cpf_cnpj || "").trim(),
    AUTOR_ENDERECO: (autor.endereco || "").trim(),

    REU_NOME: (reu.nome || "").trim(),
    REU_CPF_CNPJ: (reu.cpf_cnpj || "").trim(),
    REU_ENDERECO: (reu.endereco || "").trim(),

    FATOS_DESCRICAO: (fatos.descricao_orientada || "").trim(),

    DATA_VENCIMENTO: formatDateBR(divida.data_vencimento),
    VALOR_DIVIDA: formatBRL(divida.valor),
    VALOR_CAUSA: formatBRL(divida.valor),

    LOCAL_DATA: formatLocalData()
  };
}

/* -------------------------------------------------------------------------- */
/* Validação crítica + alertas agrupados                                       */
/* -------------------------------------------------------------------------- */

function validateCritical(data) {
  const missing = [];

  const autor = (data.partes && data.partes.autor) || {};
  const reu = (data.partes && data.partes.reu) || {};
  const divida = data.divida || {};
  const fatos = data.fatos || {};

  const req = (v, label) => {
    if (!hasText(String(v || ""))) missing.push(label);
  };

  req(autor.nome, "AUTOR_NOME");
  req(autor.cpf_cnpj, "AUTOR_CPF_CNPJ");
  req(autor.endereco, "AUTOR_ENDERECO");

  req(reu.nome, "REU_NOME");
  req(reu.cpf_cnpj, "REU_CPF_CNPJ");
  req(reu.endereco, "REU_ENDERECO");

  req(divida.origem, "DIVIDA_ORIGEM");
  if (!(Number(divida.valor) > 0)) missing.push("DIVIDA_VALOR");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(divida.data_vencimento || "")))
    missing.push("DIVIDA_DATA_VENCIMENTO");

  req(fatos.descricao_orientada, "FATOS_DESCRICAO");

  return missing;
}

function groupAlerts(alerts) {
  const out = { error: [], warn: [], info: [] };
  for (const a of alerts || []) {
    const lvl = (a.level || "info").toLowerCase();
    if (lvl === "error") out.error.push(a);
    else if (lvl === "warn") out.warn.push(a);
    else out.info.push(a);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* DOCX render                                                                  */
/* -------------------------------------------------------------------------- */

function renderDocxFromTemplate(placeholders) {
  const templatePath = path.join(process.cwd(), "templates", "cobranca_v1.docx");
  if (!fs.existsSync(templatePath)) {
    throw new Error("Template cobranca_v1.docx não encontrado em /templates");
  }

  const content = fs.readFileSync(templatePath, "binary");
  const zip = new PizZip(content);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true
  });

  doc.render(placeholders);

  return doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE"
  });
}

/* -------------------------------------------------------------------------- */
/* Handler principal                                                            */
/* -------------------------------------------------------------------------- */

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    return err(res, 405, "Use POST");
  }

  if (!authOr401(req, res)) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    return err(res, 400, e.message || "Body inválido");
  }

  const data = body && body.data ? body.data : null;
  if (!data) {
    return err(res, 400, "Campo 'data' ausente");
  }

  // Validação crítica
  const missing = validateCritical(data);
  if (missing.length > 0) {
    const alerts = missing.map((m) => ({
      level: "error",
      code: "MISSING_CRITICAL",
      message: `Campo obrigatório ausente: ${m}`
    }));

    return err(res, 422, "Campos críticos ausentes para exportar DOCX", {
      alertsGrouped: groupAlerts(alerts)
    });
  }

  try {
    const placeholders = buildPlaceholders(data);
    const buffer = renderDocxFromTemplate(placeholders);

    const filename = `acao_cobranca_${Date.now()}.docx`;
    const base64 = buffer.toString("base64");

    return ok(res, {
      filename,
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      base64,
      alertsGrouped: groupAlerts([]) // sem alertas
    });
  } catch (e) {
    return err(res, 500, "Falha ao gerar DOCX", {
      message: e.message || String(e)
    });
  }
};

