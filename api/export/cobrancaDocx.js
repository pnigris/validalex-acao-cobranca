/* ************************************************************************* */
/* Nome do codigo: api/export/cobrancaDocx.js                                 */
/* Objetivo: gerar DOCX a partir das sections já validadas                    */
/* ************************************************************************* */

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function assertString(v) {
  return typeof v === "string" ? v : "";
}

/**
 * Espera um payload no formato:
 * {
 *   "templateVersion": "cobranca_v1_2",
 *   "doc": {
 *     "sections": { enderecamento, qualificacao, fatos, direito, pedidos, valor_causa, requerimentos_finais },
 *     "signature": { "nome": "...", "oab": "..." },
 *     "localData": "..."
 *   }
 * }
 */
module.exports = async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const body = req.body || {};
    const templateVersion = String(body.templateVersion || "cobranca_v1_2").trim();

    const sections = (body.doc && body.doc.sections) ? body.doc.sections : null;
    if (!sections || typeof sections !== "object") {
      return res.status(400).json({ ok: false, error: "doc.sections ausente ou inválido" });
    }

    // ⚠️ Template físico: mantenha estável e versionado
    // Ajuste o nome do arquivo conforme onde você colocar o template no repo
    const templatePath = path.join(process.cwd(), "templates", `${templateVersion}.docx`);

    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ ok: false, error: `Template DOCX não encontrado: ${templateVersion}.docx` });
    }

    const buf = fs.readFileSync(templatePath);
    const zip = new PizZip(buf);

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true
    });

    const data = {
      ENDERECAMENTO: assertString(sections.enderecamento),
      QUALIFICACAO: assertString(sections.qualificacao),
      FATOS: assertString(sections.fatos),
      DIREITO: assertString(sections.direito),
      PEDIDOS: assertString(sections.pedidos),
      VALOR_CAUSA: assertString(sections.valor_causa),
      REQUERIMENTOS_FINAIS: assertString(sections.requerimentos_finais),
      LOCAL_DATA: assertString(body.doc && body.doc.localData),
      ASSINATURA_NOME: assertString(body.doc && body.doc.signature && body.doc.signature.nome),
      ASSINATURA_OAB: assertString(body.doc && body.doc.signature && body.doc.signature.oab)
    };

    doc.render(data);

    const out = doc.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE"
    });

    const filename = `acao_cobranca_${Date.now()}.docx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(out);

  } catch (err) {
    // docxtemplater costuma dar erro detalhado em err.properties.errors
    return res.status(500).json({
      ok: false,
      error: "Erro ao gerar DOCX",
      details: err && (err.message || String(err))
    });
  }
};
