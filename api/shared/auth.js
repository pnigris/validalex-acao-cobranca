

  /* ************************************************************************* */
/* Nome do codigo: api/shared/auth.js                                        */
/* Objetivo: validar Authorization Bearer com token compartilhado            */
/* ************************************************************************* */

function authGuard(req) {
  const expected = process.env.VALIDALEX_SHARED_TOKEN;

  if (!expected) {
    const err = new Error("VALIDALEX_SHARED_TOKEN não configurado");
    err.statusCode = 500;
    throw err;
  }

  const headers = req.headers || {};
  const authHeader =
    headers["authorization"] ||
    headers["Authorization"] ||
    "";

  const xToken =
    headers["x-validalex-token"] ||
    headers["X-Validalex-Token"] ||
    "";

  let token = "";

  // Authorization: Bearer <token>
  if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.slice(7).trim();
  }
  // Fallback interno (debug / chamadas controladas)
  else if (typeof xToken === "string") {
    token = xToken.trim();
  }

  if (!token) {
    const err = new Error("Token ausente");
    err.statusCode = 401;
    throw err;
  }

  if (token !== expected) {
    const err = new Error("Token inválido");
    err.statusCode = 403;
    throw err;
  }

  // sucesso explícito
  return true;
}

module.exports = { authGuard };
