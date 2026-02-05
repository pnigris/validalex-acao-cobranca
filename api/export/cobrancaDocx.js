/* ************************************************************************* */
/* Nome do codigo: api/export/cobrancaDocx.js                                 */
/* Objetivo: gerar DOCX + upload para Vercel Blob e retornar {ok,url}         */
/* Blindagem: idempotência real (hash do conteúdo) + rateLimit seguro         */
/* ************************************************************************* */

const {
  Document,
  Packer,
  Paragraph,
  AlignmentType,
  HeadingLevel
} = require("docx");

const crypto = require("crypto");
const { put } = require("@vercel/blob");

const { authGuard } = require("../shared/auth.js");
const { rateLimit } = require("../shared/rateLimit.js");
const { logger } = require("../shared/logger.js");
const { sendJson, sendError } = require("../shared/response.js");

const { readJob, writeJob } = require("../shared/jobStore.js");

// DOCX constants
const FONT_ARIAL = "Arial";
const SIZE_12 = 24;   // 12pt = 24 half-points
const LINE_15 = 360;  // 1.5 lines (twips)

// Cache/idempotência (no jobStore): mantém por 24h (você pode ajustar)
const EXPORT_TTL_MS = 24 * 60 * 60 * 1000;

function setCors(res) {
  try { res.setHeader("Access-Control-Allow-Origin", "*"); } catch (_) {}
  try { res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS"); } catch (_) {}
  try { res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization"); } catch (_) {}
  try { res.setHeader("Access-Control-Max-Age", "86400"); } catch (_) {}
}

// obrigatório no corpo
function sRequired(v) {
  return (typeof v === "string" && v.trim())
    ? v.trim()
    : "[PENDENTE – INFORMAÇÃO NÃO FORNECIDA]";
}

// opcional no rodapé (não imprime pendente)
function sOptional(v) {
  const t = (typeof v === "string") ? v.trim() : "";
  if (!t) return "";
  if (/^\[PENDENTE/i.test(t)) return "";
  return t;
}

function isObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function parseBody(req) {
  const b = req?.body;
  if (!b) return {};
  if (typeof b === "object") return b;
  if (typeof b === "string") {
    try { return JSON.parse(b); } catch { return {}; }
  }
  return {};
}

function validateSections(sections) {
  if (!isObject(sections)) {
    return { ok: false, error: "doc.sections ausente ou inválido (esperado OBJETO)" };
  }

  const required = [
    "enderecamento",
    "qualificacao",
    "fatos",
    "direito",
    "pedidos",
    "valor_causa",
    "requerimentos_finais"
  ];

  for (const k of required) {
    if (!(k in sections)) return { ok: false, error: `doc.sections inválido: chave ausente '${k}'` };
    if (typeof sections[k] !== "string") return { ok: false, error: `doc.sections inválido: '${k}' deve ser string` };
  }

  const hasAny = Object.values(sections).some(t => String(t || "").trim().length > 0);
  if (!hasAny) return { ok: false, error: "doc.sections está vazio — gere o rascunho novamente antes de exportar" };

  return { ok: true };
}

function textToParagraphs(text) {
  const lines = String(text || "")
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [new Paragraph({ text: "", spacing: { line: LINE_15 } })];
  }

  return lines.map(line => new Paragraph({
    text: line,
    spacing: { after: 200, line: LINE_15 },
    alignment: AlignmentType.JUSTIFIED
  }));
}

function section(title, content) {
  return [
    new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 400, after: 200, line: LINE_15 }
    }),
    ...textToParagraphs(content)
  ];
}

function buildOptionalFooter(body) {
  const localData = sOptional(body?.doc?.localData);
  const sigNome = sOptional(body?.doc?.signature?.nome);
  const sigOab = sOptional(body?.doc?.signature?.oab);

  if (!localData && !sigNome && !sigOab) return [];

  const out = [];
  out.push(new Paragraph({ text: "", spacing: { after: 400, line: LINE_15 } }));

  if (localData) {
    out.push(new Paragraph({
      text: localData,
      alignment: AlignmentType.RIGHT,
      spacing: { after: 300, line: LINE_15 }
    }));
  }

  if (sigNome) {
    out.push(new Paragraph({
      text: sigNome,
      alignment: AlignmentType.RIGHT,
      spacing: { line: LINE_15 }
    }));
  }

  if (sigOab) {
    out.push(new Paragraph({
      text: sigOab,
      alignment: AlignmentType.RIGHT,
      spacing: { line: LINE_15 }
    }));
  }

  return out;
}

function looksLikeTimeout(err) {
  const msg = String(err?.message || err || "");
  return /\b504\b/.test(msg) || /gateway timeout/i.test(msg) || /timeout/i.test(msg) || /Tempo limite/i.test(msg);
}

function looksLikeBlobTokenMissing(err) {
  const msg = String(err?.message || err || "");
  return /No token found/i.test(msg) || /BLOB_READ_WRITE_TOKEN/i.test(msg);
}

function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} timeout após ${ms}ms`)), ms);
  });
  return Promise.race([
    promise.finally(() => clearTimeout(t)),
    timeout
  ]);
}

// stringify estável para hash determinístico
function stableStringify(value) {
  if (value == null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }

  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    const parts = keys.map(k => JSON.stringify(k) + ":" + stableStringify(value[k]));
    return "{" + parts.join(",") + "}";
  }

  return JSON.stringify(String(value));
}

function makeExportHash(body) {
  const payload = {
    templateVersion: String(body?.templateVersion || "cobranca_v1_2"),
    sections: body?.doc?.sections || {},
    localData: body?.doc?.localData || "",
    signature: body?.doc?.signature || {}
  };
  const s = stableStringify(payload);
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 32);
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    return res.end();
  }

  if (req.method !== "POST") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  const start = Date.now();

  try {
    // ✅ rate limit seguro (não escreve em res)
    const rl = rateLimit(req, { limit: 20, windowMs: 60_000, key: "export_docx" });
    if (!rl.ok) {
      return sendError(
        res,
        429,
        "RATE_LIMIT",
        "Muitas requisições. Tente novamente em alguns instantes.",
        null,
        { retryAfterSec: rl.retryAfterSec },
        { "Retry-After": rl.retryAfterSec }
      );
    }

    authGuard(req);

    const hasBlobToken = !!process.env.BLOB_READ_WRITE_TOKEN;
    if (!hasBlobToken) {
      logger.error("EXPORT_DOCX_BLOB_TOKEN_MISSING", {
        hint: "Configure BLOB_READ_WRITE_TOKEN em Environment Variables e faça Redeploy."
      });
      return sendError(
        res,
        500,
        "BLOB_TOKEN_MISSING",
        "Armazenamento (Blob) não configurado no ambiente. Faça Redeploy após definir BLOB_READ_WRITE_TOKEN."
      );
    }

    const body = parseBody(req);
    const sections = body?.doc?.sections;

    const v = validateSections(sections);
    if (!v.ok) {
      return sendError(res, 400, "BAD_REQUEST", v.error);
    }

    // ✅ Idempotência REAL: calcula hash do conteúdo e reutiliza se já exportado
    const exportHash = makeExportHash(body);
    const exportKey = `export/cobrancaDocx_${exportHash}`;

    const cached = await readJob(exportKey);
    if (cached && cached.ok && cached.url && cached.createdAt && (Date.now() - cached.createdAt) <= EXPORT_TTL_MS) {
      logger.info("EXPORT_DOCX_CACHE_HIT", { exportHash });
      return sendJson(res, 200, {
        ok: true,
        url: cached.url,
        filename: cached.filename || `acao_cobranca_${exportHash}.docx`,
        meta: { cached: true, ms: Date.now() - start }
      });
    }

    logger.info("EXPORT_DOCX_START", {
      templateVersion: body?.templateVersion || "cobranca_v1_2",
      exportHash
    });

    // DOCX: estilo global Arial 12 + 1.5
    const doc = new Document({
      styles: {
        default: {
          document: {
            run: { font: FONT_ARIAL, size: SIZE_12 },
            paragraph: { spacing: { line: LINE_15 } }
          }
        }
      },
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: "PETIÇÃO INICIAL – AÇÃO DE COBRANÇA",
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400, line: LINE_15 }
          }),

          ...textToParagraphs(sRequired(sections.enderecamento)),
          ...section("I – QUALIFICAÇÃO DAS PARTES", sRequired(sections.qualificacao)),
          ...section("II – DOS FATOS", sRequired(sections.fatos)),
          ...section("III – DOS FUNDAMENTOS JURÍDICOS", sRequired(sections.direito)),
          ...section("IV – DOS PEDIDOS", sRequired(sections.pedidos)),
          ...section("V – DO VALOR DA CAUSA", sRequired(sections.valor_causa)),
          ...section("VI – REQUERIMENTOS FINAIS", sRequired(sections.requerimentos_finais)),

          ...buildOptionalFooter(body)
        ]
      }]
    });

    logger.info("EXPORT_DOCX_BUFFER_START", { exportHash });
    const buffer = await withTimeout(Packer.toBuffer(doc), 15_000, "Packer.toBuffer");
    logger.info("EXPORT_DOCX_BUFFER_OK", { exportHash, size: buffer.length });

    // ✅ Nome determinístico: reforça idempotência no Blob também
    const filename = `cobranca/acao_cobranca_${exportHash}.docx`;

    logger.info("EXPORT_DOCX_BLOB_PUT_START", { filename, exportHash });
    const blob = await withTimeout(put(filename, buffer, {
      access: "public",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      addRandomSuffix: false,
      cacheControlMaxAge: 3600
    }), 15_000, "Blob.put");
    logger.info("EXPORT_DOCX_BLOB_PUT_OK", { exportHash, url: blob?.url });

    const ms = Date.now() - start;

    // ✅ grava cache idempotente
    await writeJob(exportKey, {
      ok: true,
      url: blob.url,
      filename: `acao_cobranca_${exportHash}.docx`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      meta: { exportHash, size: buffer.length, ms }
    });

    logger.info("EXPORT_DOCX_OK", { exportHash, ms, size: buffer.length });

    return sendJson(res, 200, {
      ok: true,
      url: blob.url,
      filename: `acao_cobranca_${exportHash}.docx`,
      size: buffer.length,
      meta: { ms, exportHash }
    });

  } catch (err) {
    const ms = Date.now() - start;
    const msg = String(err?.message || err || "Erro inesperado");

    if (looksLikeTimeout(err)) {
      logger.error("EXPORT_DOCX_504", { ms, error: msg });
      return sendJson(res, 504, {
        ok: false,
        status: 504,
        error: "Tempo limite excedido (504). Tente novamente. Se persistir, reduza o texto de 'Fatos'.",
        details: msg
      });
    }

    if (looksLikeBlobTokenMissing(err)) {
      logger.error("EXPORT_DOCX_BLOB_TOKEN_ERR", {
        ms,
        error: msg,
        hint: "Verifique se BLOB_READ_WRITE_TOKEN está em Production e faça Redeploy."
      });
      return sendJson(res, 500, {
        ok: false,
        status: 500,
        error: "Falha no Blob (token ausente/inválido). Confirme BLOB_READ_WRITE_TOKEN em Production e faça Redeploy.",
        details: msg
      });
    }

    const status = Number(err?.statusCode || 500);
    logger.error("EXPORT_DOCX_ERR", { ms, status, error: msg });

    return sendJson(res, status, {
      ok: false,
      status,
      error: status === 429 ? "Muitas requisições. Tente novamente em alguns instantes." : "Erro ao gerar DOCX",
      details: msg
    });
  }
};
