/* ************************************************************************* */
/* Nome do codigo: src/draft-cobranca/schema.js                              */
/* Objetivo: schema canônico da Ação de Cobrança                             */
/* ************************************************************************* */

module.exports = {
  version: "cobranca-form-1.1.0",

  /**
   * Campos cuja ausência BLOQUEIA a geração do rascunho
   */
  requiredCritical: [
    {
      path: "partes.autor.nome",
      label: "Autor - Nome",
      type: "string",
      minLength: 3
    },
    {
      path: "partes.autor.cpf_cnpj",
      label: "Autor - CPF/CNPJ",
      type: "string",
      minLength: 11
    },
    {
      path: "partes.autor.endereco",
      label: "Autor - Endereço",
      type: "string",
      minLength: 10
    },

    {
      path: "partes.reu.nome",
      label: "Réu - Nome/Razão social",
      type: "string",
      minLength: 3
    },
    {
      path: "partes.reu.cpf_cnpj",
      label: "Réu - CPF/CNPJ",
      type: "string",
      minLength: 11
    },
    {
      path: "partes.reu.endereco",
      label: "Réu - Endereço",
      type: "string",
      minLength: 10
    },

    {
      path: "divida.origem",
      label: "Origem da dívida",
      type: "string",
      minLength: 3
    },
    {
      path: "divida.valor",
      label: "Valor devido",
      type: "number",
      min: 0.01
    },
    {
      path: "divida.data_vencimento",
      label: "Data de vencimento",
      type: "date",
      format: "YYYY-MM-DD"
    },

    {
      path: "fatos.descricao_orientada",
      label: "Descrição dos fatos (guiada)",
      type: "string",
      minLength: 50
    }
  ],

  /**
   * Campos opcionais com impacto jurídico
   */
  optional: {
    "fatos.tentativa_extrajudicial": {
      type: "boolean",
      impact: "reduz risco de improcedência",
      alertIfTrueAndMissing: "Descrição da tentativa extrajudicial não informada"
    },
    "provas.documentos": {
      type: "array",
      minItems: 1,
      impact: "prova documental mínima"
    },
    "config.juizo": {
      type: "string",
      impact: "adequação do foro"
    },
    "config.pedir_juros": {
      type: "boolean",
      impact: "pedido acessório"
    },
    "config.pedir_correcao": {
      type: "boolean",
      impact: "pedido acessório"
    }
  }
};
