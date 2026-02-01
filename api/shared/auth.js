/* api/shared/auth.js */

function requireAuth(req) {
  const expected = process.env.VALIDALEX_SHARED_TOKEN;
  if (!expected) throw new Error("VALIDALEX_SHARED_TOKEN não configurado");

  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  const xTok = req.headers["x-validalex-token"];

  let token = "";

  if (typeof authHeader === "string" && authHeader.trim().toLowerCase().startsWith("bearer ")) {
    token = authHeader.trim().slice(7).trim();
  } else if (typeof xTok === "string") {
    token = xTok.trim();
  }

  if (!token) throw new Error("Token ausente");
  if (token !== expected) throw new Error("Token inválido");

  return true;
}

module.exports = { requireAuth };

  