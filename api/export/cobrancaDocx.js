/* ************************************************************************* */
/* Nome do codigo: api/export/cobrancaDocx.js                                 */
/* Objetivo: gerar DOCX + upload para Vercel Blob e retornar {ok,url}         */
/* ************************************************************************* */

const { Document, Packer, Paragraph, AlignmentType, HeadingLevel } = require("docx");
const { put } = require("@vercel/blob");

const { authGuard } = require("../shared/auth.js");
const { rateLimit } = require("../shared/rateLimit.js");
const { logger } = require("../shared/logger.js");
const { sendJson } = require("../shared/response.js");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function s(v) {
  return (typeof v === "string" && v.trim())
    ? v
    : "[PENDENTE – INFORMAÇÃO NÃO FORNECIDA]";
}

function isObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
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

  if (lines.length === 0) return [new Paragraph({ text: "" })];

  return lines.map(line => new Paragraph({
    text: line,
    spacing: { after: 200 },
    alignment: AlignmentType.JUSTIFIED
  }));
}

function section(title, content) {
  return [
    new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 400, after: 200 }
    }),
    ...textToParagraphs(content)
  ];
}

function looksLikeTimeout(err) {
  const msg = String(err?.message || err || "");
  return /\b504\b/.test(msg) || /gateway timeout/i.test(msg) || /timeout/i.test(msg) || /Tempo limite/i.test(msg);
}

module.exports = async function handler(req, res) {
  setCors(res);

  // ✅ OPTIONS com Node puro (sem res.status)
  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    return res.end();
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, status: 405, error: "Method not allowed" });
  }

  const start = Date.now();

  try {
    // ✅ barata primeiro
    rateLimit(req, res, { limit: 20, windowMs: 60_000 });
    authGuard(req);

    const body = req.body || {};
    const sections = body?.doc?.sections;

    const v = validateSections(sections);
    if (!v.ok) {
      return sendJson(res, 400, { ok: false, status: 400, error: v.error });
    }

    logger.info("EXPORT_DOCX_START", {
      hasSections: true,
      templateVersion: body?.templateVersion || "cobranca_v1_2"
    });

    // ✅ Geração DOCX
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: "PETIÇÃO INICIAL – AÇÃO DE COBRANÇA",
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
          }),

          ...textToParagraphs(s(sections.enderecamento)),
          ...section("I – QUALIFICAÇÃO DAS PARTES", s(sections.qualificacao)),
          ...section("II – DOS FATOS", s(sections.fatos)),
          ...section("III – DO DIREITO", s(sections.direito)),
          ...section("IV – DOS PEDIDOS", s(sections.pedidos)),
          ...section("V – DO VALOR DA CAUSA", s(sections.valor_causa)),
          ...section("VI – REQUERIMENTOS FINAIS", s(sections.requerimentos_finais)),

          new Paragraph({ text: "", spacing: { after: 400 } }),

          new Paragraph({
            text: s(body?.doc?.localData),
            alignment: AlignmentType.RIGHT,
            spacing: { after: 300 }
          }),

          new Paragraph({
            text: s(body?.doc?.signature?.nome),
            alignment: AlignmentType.RIGHT,
            bold: true
          }),
          new Paragraph({
            text: s(body?.doc?.signature?.oab),
            alignment: AlignmentType.RIGHT
          })
        ]
      }]
    });

    const buffer = await Packer.toBuffer(doc);

    // ✅ Upload Blob
    const now = Date.now();
    const filename = `cobranca/acao_cobranca_${now}.docx`;

    const blob = await put(filename, buffer, {
      access: "public",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      addRandomSuffix: false,
      cacheControlMaxAge: 3600
    });

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
