/* ************************************************************************* */
/* Nome do codigo: api/export/cobrancaDocx.js                                 */
/* Objetivo: gerar DOCX programaticamente + upload otimizado para Blob       */
/* ************************************************************************* */

const { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } = require("docx");
const { put } = require("@vercel/blob");

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

module.exports = async (req, res) => {
  setCors(res);
  
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const startTime = Date.now();

  try {
    const body = req.body || {};
    const sections = body?.doc?.sections;

    if (!sections || typeof sections !== "object") {
      return res.status(400).json({ 
        ok: false, 
        error: "doc.sections ausente ou inválido" 
      });
    }

    console.log("[EXPORT_DOCX] Iniciando geração do documento...");

    // 🔥 GERAÇÃO PROGRAMÁTICA (resolve problema de tags quebradas)
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

    console.log("[EXPORT_DOCX] Gerando buffer...");
    const buffer = await Packer.toBuffer(doc);
    const genTime = Date.now() - startTime;
    console.log(`[EXPORT_DOCX] Buffer gerado em ${genTime}ms. Tamanho: ${buffer.length} bytes`);

    // 🔥 UPLOAD OTIMIZADO para Vercel Blob
    console.log("[EXPORT_DOCX] Fazendo upload para Vercel Blob...");
    const uploadStart = Date.now();
    
    const filename = `cobranca/acao_cobranca_${Date.now()}.docx`;
    
    const blob = await put(filename, buffer, {
      access: "public",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      addRandomSuffix: false, // 🔥 Remove sufixo aleatório (mais rápido)
      cacheControlMaxAge: 3600 // 🔥 Cache de 1 hora
    });

    const uploadTime = Date.now() - uploadStart;
    const totalTime = Date.now() - startTime;

    console.log(`[EXPORT_DOCX_OK] Upload concluído em ${uploadTime}ms. Total: ${totalTime}ms`);
    console.log(`[EXPORT_DOCX_OK] URL: ${blob.url}`);

    return res.status(200).json({
      ok: true,
      url: blob.url, // ✅ URL HTTP/HTTPS compatível com wixLocation.to()
      filename: `acao_cobranca_${Date.now()}.docx`,
      size: buffer.length,
      timing: {
        generation: genTime,
        upload: uploadTime,
        total: totalTime
      }
    });

  } catch (err) {
    const totalTime = Date.now() - startTime;
    console.error(`[EXPORT_DOCX_ERR] Falha após ${totalTime}ms:`, err);
    
    return res.status(500).json({ 
      ok: false, 
      error: "Erro ao gerar DOCX", 
      details: err?.message || String(err) 
    });
  }
};