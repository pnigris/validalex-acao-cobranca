/* ************************************************************************* */
/* Nome do codigo: api/export/cobrancaDocx.js                                 */
/* Objetivo: gerar DOCX programaticamente + upload otimizado para Blob       */
/* Regras: Authorization Bearer obrigatório + retorno JSON com {ok,url}       */
/* ************************************************************************* */

const { Document, Packer, Paragraph, AlignmentType, HeadingLevel } = require("docx");
const { put } = require("@vercel/blob");

// Mesma arquitetura do draft: shared/*
const { authGuard } = require("../shared/auth.js");
const { rateLimit } = require("../shared/rateLimit.js");
const { logger } = require("../shared/logger.js");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function s(v) {
  return typeof v === "string" ? v : "[PENDENTE – INFORMAÇÃO NÃO FORNECIDA]";
}

// Converte texto com quebras de linha em array de parágrafos
function textToParagraphs(text, options = {}) {
  const lines = String(text || "").split("\n").filter(line => line.trim());
  return lines.map(line => new Paragraph({
    text: line.trim(),
    spacing: { after: 200 },
    alignment: options.alignment || AlignmentType.JUSTIFIED,
    ...options
  }));
}

// Cria seção com título
function createSection(title, content) {
  const paragraphs = [];

  if (title) {
    paragraphs.push(new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 400, after: 200 },
      bold: true
    }));
  }

  paragraphs.push(...textToParagraphs(content));
  return paragraphs;
}

function isObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function validateSectionsObject(sections) {
  if (!isObject(sections)) {
    return { ok: false, error: "doc.sections ausente ou inválido (esperado OBJETO)" };
  }

  const requiredKeys = [
    "enderecamento",
    "qualificacao",
    "fatos",
    "direito",
    "pedidos",
    "valor_causa",
    "requerimentos_finais"
  ];

  for (const k of requiredKeys) {
    if (!(k in sections)) return { ok: false, error: `doc.sections inválido: chave ausente '${k}'` };
    if (typeof sections[k] !== "string") return { ok: false, error: `doc.sections inválido: '${k}' deve ser string` };
  }

  const hasAny = Object.values(sections).some(t => String(t || "").trim().length > 0);
  if (!hasAny) return { ok: false, error: "doc.sections está vazio — gere o rascunho novamente antes de exportar" };

  return { ok: true };
}

function looksLikeTimeout(err) {
  const msg = String(err?.message || err || "");
  return /\b504\b/.test(msg) || /gateway timeout/i.test(msg) || /timeout/i.test(msg) || /Tempo limite/i.test(msg);
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const startTime = Date.now();

  try {
    // ✅ Segurança e proteção (mesmo padrão do draft)
    rateLimit(req, res);
    authGuard(req);

    const body = req.body || {};
    const sections = body?.doc?.sections;

    const v = validateSectionsObject(sections);
    if (!v.ok) {
      return res.status(400).json({ ok: false, error: v.error });
    }

    logger.info("EXPORT_DOCX_START", {
      hasSections: true,
      templateVersion: body?.templateVersion || "cobranca_v1_2"
    });

    // 🔥 GERAÇÃO PROGRAMÁTICA
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          // CABEÇALHO
          new Paragraph({
            text: "PETIÇÃO INICIAL – AÇÃO DE COBRANÇA",
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
          }),

          // ENDEREÇAMENTO
          ...createSection("", s(sections.enderecamento)),

          // QUALIFICAÇÃO DAS PARTES
          ...createSection("I – QUALIFICAÇÃO DAS PARTES", s(sections.qualificacao)),

          // DOS FATOS
          ...createSection("II – DOS FATOS", s(sections.fatos)),

          // DO DIREITO
          ...createSection("III – DO DIREITO", s(sections.direito)),

          // DOS PEDIDOS
          ...createSection("IV – DOS PEDIDOS", s(sections.pedidos)),

          // DO VALOR DA CAUSA
          ...createSection("V – DO VALOR DA CAUSA", s(sections.valor_causa)),

          // REQUERIMENTOS FINAIS
          ...createSection("VI – REQUERIMENTOS FINAIS", s(sections.requerimentos_finais)),

          // ESPAÇO
          new Paragraph({ text: "", spacing: { after: 400 } }),

          // LOCAL E DATA
          new Paragraph({
            text: s(body?.doc?.localData),
            alignment: AlignmentType.RIGHT,
            spacing: { after: 400 }
          }),

         // ASSINATURA
          new Paragraph({
            text: s(body?.doc?.signature?.nome),
            alignment: AlignmentType.RIGHT,
            bold: true
          }),
          new Paragraph({
            text: s(body?.doc?.signature?.oab),
            alignment: AlignmentType.RIGHT,
            spacing: { after: 200 }
          })
        ]
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    const genTime = Date.now() - startTime;

    // 🔥 UPLOAD para Vercel Blob
    const uploadStart = Date.now();
    const now = Date.now();
    const filename = `cobranca/acao_cobranca_${now}.docx`;

    const blob = await put(filename, buffer, {
      access: "public",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      addRandomSuffix: false,
      cacheControlMaxAge: 3600
    });

    const uploadTime = Date.now() - uploadStart;
    const totalTime = Date.now() - startTime;

    logger.info("EXPORT_DOCX_OK", {
      url: blob.url,
      size: buffer.length,
      timing: { generation: genTime, upload: uploadTime, total: totalTime }
    });

    return res.status(200).json({
      ok: true,
      url: blob.url,
      filename: `acao_cobranca_${now}.docx`,
      size: buffer.length,
      timing: {
        generation: genTime,
        upload: uploadTime,
        total: totalTime
      }
    });

  } catch (err) {
    const totalTime = Date.now() - startTime;

    // Se for timeout, devolve 504 (ajuda seu Wix a mostrar mensagem amigável)
    if (looksLikeTimeout(err)) {
      logger.error("EXPORT_DOCX_504", { ms: totalTime, error: String(err?.message || err) });
      return res.status(504).json({
        ok: false,
        status: 504,
        error: "Tempo limite excedido (504). Tente novamente. Se persistir, reduza o texto de 'Fatos'.",
        details: String(err?.message || err)
      });
    }

    logger.error("EXPORT_DOCX_ERR", { ms: totalTime, error: String(err?.message || err) });

    return res.status(500).json({
      ok: false,
      status: 500,
      error: "Erro ao gerar DOCX",
      details: err?.message || String(err)
    });
  }
};
