/* ************************************************************************* */
/* Nome do codigo: src/draft-cobranca/validate.js                            */
/* Objetivo: validação jurídica determinística da Ação de Cobrança           */
/* ************************************************************************* */

/**
 * Valida dados antes do envio ao modelo.
 * Retorna estrutura padronizada para o backend.
 *
 * @param {Object} data
 * @param {Object} schema
 * @param {Object=} meta
 * @returns {{
 *   ok: boolean,
 *   missing: Array<{ path:string, label:string }>,
 *   alerts: Array<{ level:string, code:string, message:string }>,
 *   meta: Object
 * }}
 */

// Origem da dívida: categorias e subtipos permitidos (espelha o frontend)
const ORIGEM_POR_CATEGORIA = {
  CONTRATO: [
    "CONTRATO_COMPRA_VENDA",
    "CONTRATO_PRESTACAO_SERVICOS",
    "CONTRATO_EMPREITADA",
    "CONTRATO_LOCACAO",
    "CONTRATO_MUTUO",
    "FORNECIMENTO_PRODUTOS",
    "LICENCIAMENTO_SOFTWARE_SAAS",
    "CONTRATO_MANDATO",
    "CONTRATO_SOCIEDADE",
    "CONTRATO_ATIPICO"
  ],
  TITULO_PRESCRITO: [
    "CHEQUE_PRESCRITO",
    "NOTA_PROMISSORIA_PRESCRITA",
    "DUPLICATA_PRESCRITA"
  ],
  ENRIQUECIMENTO_SEM_CAUSA: [
    "PAGAMENTO_INDEVIDO",
    "RETENCAO_INDEVIDA",
    "GESTAO_NEGOCIOS"
  ],
  ACORDO: [
    "ACORDO_EXTRAJUDICIAL"
  ],
  INDENIZACAO: [
    "INDENIZACAO_CONTRATUAL",
    "INDENIZACAO_EXTRACONTRATUAL"
  ],
  CONVERSAO: [
    "CONVERSAO_PERDAS_DANOS"
  ],
  CONDOMINIO: [
    "COTAS_CONDOMINIAIS"
  ],
  CONSUMO: [
    "SERVICOS_ESSENCIAIS",
    "MENSALIDADES"
  ],
  HONORARIOS: [
    "HONORARIOS_CONTRATUAIS"
  ]
};

function isValidOrigemCategoria(cat) {
  return !!cat && Object.prototype.hasOwnProperty.call(ORIGEM_POR_CATEGORIA, cat);
}

function isValidOrigemSubtipo(cat, sub) {
  if (!isValidOrigemCategoria(cat)) return false;
  if (!sub) return false;
  return ORIGEM_POR_CATEGORIA[cat].includes(sub);
}

function validateDraftInput(data, schema = {}, meta = {}) {
  const missing = [];
  const alerts = [];

  const required = Array.isArray(schema.requiredCritical)
    ? schema.requiredCritical
    : [];

  // -----------------------------------------------------------------------
  // Campos críticos obrigatórios
  // -----------------------------------------------------------------------
  for (const item of required) {
    const val = getByPath(data, item.path);
    if (isEmpty(val)) {
      missing.push({ path: item.path, label: item.label });
    }
  }

  // -----------------------------------------------------------------------
  // Origem da dívida (categoria + subtipo) - coerência e blindagem
  // -----------------------------------------------------------------------
  const origemCat = String(getByPath(data, "divida.origem_categoria") || "").trim();
  const origemSub = String(getByPath(data, "divida.origem_subtipo") || "").trim();

  // Regra: se categoria existe, subtipo é obrigatório (redundância com schema, mas explícito)
  if (origemCat && !origemSub) {
    missing.push({ path: "divida.origem_subtipo", label: "Origem da dívida - Subtipo" });
  }

  // Se subtipo existe sem categoria, isso é payload inconsistente (ou manipulação)
  if (!origemCat && origemSub) {
    missing.push({ path: "divida.origem_categoria", label: "Origem da dívida - Categoria" });
    alerts.push({
      level: "error",
      code: "ORIGEM_INCONSISTENTE",
      message: "Origem da dívida inconsistente: subtipo informado sem categoria."
    });
  }

  // Categoria inválida
  if (origemCat && !isValidOrigemCategoria(origemCat)) {
    alerts.push({
      level: "error",
      code: "ORIGEM_CATEGORIA_INVALIDA",
      message: "Origem da dívida - Categoria inválida. Selecione uma categoria permitida no formulário."
    });
  }

  // Subtipo inválido para a categoria
  if (origemCat && origemSub && isValidOrigemCategoria(origemCat) && !isValidOrigemSubtipo(origemCat, origemSub)) {
    alerts.push({
      level: "error",
      code: "ORIGEM_SUBTIPO_INVALIDO",
      message: "Origem da dívida - Subtipo inválido para a categoria selecionada."
    });
  }

  // -----------------------------------------------------------------------
  // Endereço do réu
  // -----------------------------------------------------------------------
  const reuEnd = String(getByPath(data, "partes.reu.endereco") || "");
  if (reuEnd && reuEnd.length < 12) {
    alerts.push({
      level: "warn",
      code: "REU_ENDERECO_FRACO",
      message: "Endereço do réu parece incompleto para fins de citação."
    });
  }

  // -----------------------------------------------------------------------
  // Tentativa extrajudicial
  // -----------------------------------------------------------------------
  const tentou = !!getByPath(data, "fatos.tentativa_extrajudicial");
  if (tentou) {
    const desc = String(getByPath(data, "fatos.descricao_orientada") || "");
    const hasExtraj = /whats|email|carta|cart[oó]rio|notifica|extrajud/i.test(desc);
    if (!hasExtraj) {
      alerts.push({
        level: "info",
        code: "EXTRAJ_NAO_DESCRITA",
        message:
          "Tentativa extrajudicial marcada, mas o texto não descreve como ocorreu."
      });
    }
  }

  // -----------------------------------------------------------------------
  // Provas
  // -----------------------------------------------------------------------
  const docs = getByPath(data, "provas.documentos");
  if (!Array.isArray(docs) || docs.length === 0) {
    alerts.push({
      level: "warn",
      code: "SEM_DOCUMENTOS",
      message: "Nenhum documento fornecido; risco processual elevado."
    });
  }

  // -----------------------------------------------------------------------
  // Valor da dívida
  // -----------------------------------------------------------------------
  const valor = Number(getByPath(data, "divida.valor"));
  if (!Number.isFinite(valor) || valor <= 0) {
    alerts.push({
      level: "error",
      code: "VALOR_INVALIDO",
      message: "O valor da dívida é inválido."
    });
  }

  // -----------------------------------------------------------------------
  // Data de vencimento
  // -----------------------------------------------------------------------
  const dv = String(getByPath(data, "divida.data_vencimento") || "");
  if (dv && !/^\d{4}-\d{2}-\d{2}$/.test(dv)) {
    alerts.push({
      level: "warn",
      code: "DATA_FORMATO",
      message: "Data de vencimento deve seguir o formato YYYY-MM-DD."
    });
  }

  // -----------------------------------------------------------------------
  // Valor da causa x valor da dívida
  // -----------------------------------------------------------------------
  const valCausa = Number(getByPath(data, "config.valor_causa"));
  if (Number.isFinite(valor) && Number.isFinite(valCausa) && valCausa < valor) {
    alerts.push({
      level: "warn",
      code: "VALOR_CAUSA_MENOR_QUE_DIVIDA",
      message:
        "O valor da causa é inferior ao valor da dívida informada; verificar antes do protocolo."
    });
  }

  // -----------------------------------------------------------------------
  // Resultado final padronizado
  // -----------------------------------------------------------------------
  return {
    ok: missing.length === 0,
    missing,
    alerts,
    meta
  };
}

/* ==========================================================================
   Helpers
============================================================================ */

function getByPath(obj, path) {
  return path
    .split(".")
    .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function isEmpty(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

module.exports = { validateDraftInput };
