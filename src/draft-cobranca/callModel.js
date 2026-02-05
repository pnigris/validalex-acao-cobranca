/* ************************************************************************* */
/* Nome do codigo: src/draft-cobranca/callModel.js                           */
/* Objetivo: chamar OpenAI Responses API de forma segura e previsível         */
/* ************************************************************************* */

const OPENAI_URL = "https://api.openai.com/v1/responses";

const DEFAULT_MODEL = "gpt-4.1";
const DEFAULT_TIMEOUT_MS = 30_000; // 30s
const MAX_OUTPUT_CHARS = 25_000;   // proteção contra resposta gigante

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

  // 1️⃣ chamada protegida com timeout
  const r = await fetchWithTimeout(
    OPENAI_URL,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    },
    DEFAULT_TIMEOUT_MS
  );

  const elapsedMs = Date.now() - startedAt;

  if (!r.ok) {
    const errText = await safeText(r);
    throw new Error(`OpenAI error ${r.status}: ${truncate(errText, 500)}`);
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

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error("Timeout ao chamar OpenAI");
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
