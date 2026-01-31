/* api/shared/auth.js - valida token vindo do Wix */

function requireAuth(req) {
    const expected = process.env.VALIDALEX_SHARED_TOKEN;
    if (!expected) throw new Error("VALIDALEX_SHARED_TOKEN não configurado");
  
    // Aceita "Authorization: Bearer <token>" ou "x-validalex-token"
    const auth = req.headers["authorization"];
    const xTok = req.headers["x-validalex-token"];
  
    const token =
      (typeof auth === "string" && auth.toLowerCase().startsWith("bearer "))
        ? auth.slice(7).trim()
        : (typeof xTok === "string" ? xTok.trim() : "");
  
    if (!token) throw new Error("Token ausente");
    if (token !== expected) throw new Error("Token inválido");
  
    return true;
  }
  
  module.exports = { requireAuth };
  