/* ************************************************************************* */
/* Nome do codigo: api/export/cobrancaDocx.js                                 */
/* Objetivo: gerar DOCX a partir das sections já validadas                    */
/* ************************************************************************* */

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const { put } = require("@vercel/blob");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function s(v) { return typeof v === "string" ? v : ""; }

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const body = req.body || {};
    const templateVersion = String(body.templateVersion || "cobranca_v1_2").trim();

    const sections = body?.doc?.sections;
    if (!sections || typeof sections !== "object") {
      return res.status(400).json({ ok: false, error: "doc.sections ausente ou inválido" });
    }

    const templatePath = path.join(process.cwd(), "templates", `${templateVersion}.docx`);
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ ok: false, error: `Template DOCX não encontrado: ${templateVersion}.docx` });
    }

    // 1) Render DOCX
    const buf = fs.readFileSync(templatePath);
    const zip = new PizZip(buf);

    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

    doc.render({
      ENDERECAMENTO: s(sections.enderecamento),
      QUALIFICACAO: s(sections.qualificacao),
      FATOS: s(sections.fatos),
      DIREITO: s(sections.direito),
      PEDIDOS: s(sections.pedidos),
      VALOR_CAUSA: s(sections.valor_causa),
      REQUERIMENTOS_FINAIS: s(sections.requerimentos_finais),
      LOCAL_DATA: s(body?.doc?.localData),
      ASSINATURA_NOME: s(body?.doc?.signature?.nome),
      ASSINATURA_OAB: s(body?.doc?.signature?.oab),
    });

    const out = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });

    // 2) Upload para Vercel Blob e retorna URL
    const filename = `cobranca/${templateVersion}/acao_cobranca_${Date.now()}.docx`;

    const blob = await put(filename, out, {
      access: "public", // link direto para download
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      addRandomSuffix: true,
    });

    return res.status(200).json({
      ok: true,
      url: blob.url,
      // opcional:
      // downloadUrl: blob.downloadUrl,
      // pathname: blob.pathname
    });

  } catch (err) {
    return res.status(500).json({ ok: false, error: "Erro ao gerar DOCX", details: err?.message || String(err) });
  }
};
