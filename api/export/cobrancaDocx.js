/* ************************************************************************* */
/* Nome do codigo: api/export/cobrancaDocx.js                                 */
/* Objetivo: gerar DOCX PROGRAMATICAMENTE (sem template quebrado)            */
/* ************************************************************************* */

const { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } = require("docx");

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
    spacing: { after: 200 }, // espaço após parágrafo
    alignment: options.alignment || AlignmentType.JUSTIFIED,
    ...options
  }));
}

// Cria seção com título
function createSection(title, content) {
  return [
    new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 400, after: 200 },
      bold: true
    }),
    ...textToParagraphs(content)
  ];
}

module.exports = async (req, res) => {
  setCors(res);
  
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const sections = body?.doc?.sections;

    if (!sections || typeof sections !== "object") {
      return res.status(400).json({ 
        ok: false, 
        error: "doc.sections ausente ou inválido" 
      });
    }

    // 🔥 GERAÇÃO PROGRAMÁTICA (sem template físico)
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

    // Gera buffer do DOCX
    const buffer = await Packer.toBuffer(doc);

    // 🔥 Retorna como base64 data URL (sem upload para Blob)
    const base64 = buffer.toString("base64");
    const dataUrl = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${base64}`;

    console.log(`[EXPORT_DOCX_OK] Gerado com sucesso. Tamanho: ${buffer.length} bytes`);

    return res.status(200).json({
      ok: true,
      url: dataUrl,
      filename: `acao_cobranca_${Date.now()}.docx`,
      size: buffer.length
    });

  } catch (err) {
    console.error("[EXPORT_DOCX_ERR]", err);
    return res.status(500).json({ 
      ok: false, 
      error: "Erro ao gerar DOCX", 
      details: err?.message || String(err) 
    });
  }
};
