/* ************************************************************************* */
/* Nome do codigo: api/export/cobrancaDocx.js                                 */
/* Objetivo: gerar DOCX + upload para Vercel Blob e retornar {ok,url}         */
/* - Arial 12pt + line-height 1.5                                            */
/* - Rodapé opcional (não imprime [PENDENTE...])                              */
/* - Logs por etapa + timeout no upload Blob                                 */
/* ************************************************************************* */

const {
  Document,
  Packer,
  Paragraph,
  AlignmentType,
  HeadingLevel
} = require("docx");

const { put } = require("@vercel/blob");

const { authGuard } = require("../shared/auth.js");
const { rateLimit } = require("../shared/rateLimit.js");
const { logger } = require("../shared/logger.js");
const { sendJson } = require("../shared/response.js");

// DOCX constants
const FONT_ARIAL = "Arial";
const SIZE_12 = 24;   // 12pt = 24 half-points
const LINE_15 = 360;  // 1.5 lines (twips)

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
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
    return [new Paragraph({
      text: "",
      spacing: { line: LINE_15 }
    })];
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

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    return res.end();
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, status: 405, error: "Method not allowed" });
  }

  const start = Date.now();

  try {
    rateLimit(req, res, { limit: 20, windowMs: 60_000 });
    authGuard(req);

    const hasBlobToken = !!process.env.BLOB_READ_WRITE_TOKEN;
    if (!hasBlobToken) {
      logger.error("EXPORT_DOCX_BLOB_TOKEN_MISSING", {
        hint: "Configure BLOB_READ_WRITE_TOKEN em Environment Variables e faça Redeploy."
      });
      return sendJson(res, 500, {
        ok: false,
        status: 500,
        error: "Armazenamento (Blob) não configurado no ambiente. Faça Redeploy após definir BLOB_READ_WRITE_TOKEN."
      });
    }

    const body = parseBody(req);
    const sections = body?.doc?.sections;

    const v = validateSections(sections);
    if (!v.ok) {
      return sendJson(res, 400, { ok: false, status: 400, error: v.error });
    }

    logger.info("EXPORT_DOCX_START", {
      hasSections: true,
      templateVersion: body?.templateVersion || "cobranca_v1_2",
      hasBlobToken: true
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
          ...section("III – DO DIREITO", sRequired(sections.direito)),
          ...section("IV – DOS PEDIDOS", sRequired(sections.pedidos)),
          ...section("V – DO VALOR DA CAUSA", sRequired(sections.valor_causa)),
          ...section("VI – REQUERIMENTOS FINAIS", sRequired(sections.requerimentos_finais)),

          ...buildOptionalFooter(body)
        ]
      }]
    });

    logger.info("EXPORT_DOCX_BUFFER_START", {});
    const buffer = await withTimeout(Packer.toBuffer(doc), 15_000, "Packer.toBuffer");
    logger.info("EXPORT_DOCX_BUFFER_OK", { size: buffer.length });

    const now = Date.now();
    const filename = `cobranca/acao_cobranca_${now}.docx`;

    logger.info("EXPORT_DOCX_BLOB_PUT_START", { filename });
    const blob = await withTimeout(put(filename, buffer, {
      access: "public",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      addRandomSuffix: false,
      cacheControlMaxAge: 3600
    }), 15_000, "Blob.put");
    logger.info("EXPORT_DOCX_BLOB_PUT_OK", { url: blob?.url });

    const ms = Date.now() - start;
    logger.info("EXPORT_DOCX_OK", { ms, size: buffer.length });

    return sendJson(res, 200, {
      ok: true,
      url: blob.url,
      filename: `acao_cobranca_${now}.docx`,
      size: buffer.length,
      meta: { ms }
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
