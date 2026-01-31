/* src/draft-cobranca/schema.js */

module.exports = {
    version: "cobranca-form-1.0.0",
    requiredCritical: [
      { path: "partes.autor.nome", label: "Autor - Nome" },
      { path: "partes.autor.cpf_cnpj", label: "Autor - CPF/CNPJ" },
      { path: "partes.autor.endereco", label: "Autor - Endereço" },
  
      { path: "partes.reu.nome", label: "Réu - Nome/Razão social" },
      { path: "partes.reu.cpf_cnpj", label: "Réu - CPF/CNPJ" },
      { path: "partes.reu.endereco", label: "Réu - Endereço" },
  
      { path: "divida.origem", label: "Origem da dívida" },
      { path: "divida.valor", label: "Valor devido" },
      { path: "divida.data_vencimento", label: "Data de vencimento" },
  
      { path: "fatos.descricao_orientada", label: "Descrição dos fatos (guiada)" },
    ],
    optional: [
      "fatos.tentativa_extrajudicial",
      "provas.documentos",
      "config.juizo",
      "config.pedir_juros",
      "config.pedir_correcao",
    ],
  };
  