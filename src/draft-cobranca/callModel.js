/* ************************************************************************* */
/* Nome do codigo: src/draft-cobranca/callModel.js                           */
/* Objetivo: chamar OpenAI Responses API de forma segura e previsível        */
/* ************************************************************************* */

const OPENAI_URL = "https://api.openai.com/v1/responses";

const DEFAULT_MODEL = "gpt-4.1";
const DEFAULT_TIMEOUT_MS = 180_000; // 3 min (antes: 30s)
const MAX_OUTPUT_CHARS = 25_000;    // proteção contra resposta gigante

/**
 * @param {Object} params
 * @param {{system:string, user:string}} params.prompt
 * @param {Object=} params.meta
 */
async function callModel({ prompt, meta = {} }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurado");

  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  const payload = {
    model,
    input: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user }
    ],
    temperature: 0.2
  };

  const startedAt = Date.now();

  // 1️⃣ chamada protegida com timeout + 1 retry simples
  const r = await withRetry(
    () =>
      fetchWithTimeout(
        OPENAI_URL,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        },
        DEFAULT_TIMEOUT_MS
      ),
    1
  );

  const elapsedMs = Date.now() - startedAt;

  if (!r.ok) {
    const errText = await safeText(r);
    const err = new Error(`OpenAI error ${r.status}: ${truncate(errText, 500)}`);
    err.statusCode = r.status; // propaga status HTTP quando existir
    throw err;
  }

  const rawText = await safeText(r);

  let json;
  try {
    json = JSON.parse(rawText);
  } catch (e) {
    throw new Error(`Resposta inválida da OpenAI (JSON): ${e.message}`);
  }

  const outputText = extractOutputText(json);

  if (!outputText) {
    throw new Error("Modelo não retornou texto utilizável.");
  }

  const finalText = truncate(outputText, MAX_OUTPUT_CHARS);

  return {
    ok: true,
    model,
    text: finalText,
    meta: {
      ...meta,
      elapsedMs,
      truncated: outputText.length > finalText.length
    }
  };
}

/* ============================================================================
   Helpers
============================================================================ */

// 🔁 Retry simples (1 retry = total 2 tentativas)
async function withRetry(fn, retries = 1) {
  let lastErr;

  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < retries) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }

  throw lastErr;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e && e.name === "AbortError") {
      const err = new Error("Timeout ao chamar OpenAI");
      err.statusCode = 504; // ✅ timeout correto (gateway timeout)
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(id);
  }
}

function extractOutputText(resp) {
  if (!resp || !Array.isArray(resp.output)) return "";

  for (const msg of resp.output) {
    if (!Array.isArray(msg.content)) continue;

    for (const c of msg.content) {
      if (c.type === "output_text" && typeof c.text === "string") {
        return c.text.trim();
      }
    }
  }
  return "";
}

function truncate(s, max) {
  const str = String(s || "");
  return str.length > max ? str.slice(0, max) + "…" : str;
}

async function safeText(r) {
  try {
    return await r.text();
  } catch {
    return "";
  }
}

module.exports = { callModel };
