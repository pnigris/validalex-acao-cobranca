/* ************************************************************************* */
/* Nome do codigo: src/draft-cobranca/callModel.js                           */
/* Objetivo: chamar OpenAI Responses API de forma segura e previsível        */
/* ************************************************************************* */

const OPENAI_URL = "https://api.openai.com/v1/responses";

const DEFAULT_MODEL = "gpt-4.1";

// ✅ Aumentado para 4 min (240s) — robusto sem matar o maxDuration=300 do Vercel
const DEFAULT_TIMEOUT_MS = 240_000;

// proteção contra resposta gigante
const MAX_OUTPUT_CHARS = 25_000;

/**
 * @param {Object} params
 * @param {{system:string, user:string}} params.prompt
 * @param {Object=} params.meta
 */
async function callModel({ prompt, meta = {} }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurado");

  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  // permite override sem redeploy de código
  const timeoutMs = clampInt(process.env.OPENAI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 30_000, 290_000);

  const payload = {
    model,
    input: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user }
    ],
    temperature: 0.2
  };

  const startedAt = Date.now();

  // ✅ Retry inteligente:
  // - 1 retry SOMENTE para 429/5xx (rate limit/transiente)
  // - NÃO retry para timeout (senão estoura maxDuration e piora)
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
        timeoutMs
      ),
    {
      retries: 1,
      baseDelayMs: 900
    }
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
    const err = new Error(`Resposta inválida da OpenAI (JSON): ${e.message}`);
    err.statusCode = 502;
    throw err;
  }

  const outputText = extractOutputText(json);

  if (!outputText) {
    const err = new Error("Modelo não retornou texto utilizável.");
    err.statusCode = 502;
    throw err;
  }

  const finalText = truncate(outputText, MAX_OUTPUT_CHARS);

  return {
    ok: true,
    model,
    text: finalText,
    meta: {
      ...meta,
      elapsedMs,
      truncated: outputText.length > finalText.length,
      timeoutMs
    }
  };
}

/* ============================================================================
   Helpers
============================================================================ */

/**
 * Retry simples com regras seguras:
 * - se erro for timeout (statusCode 504): NÃO retry
 * - se resposta for 429/5xx: retry (transiente)
 */
async function withRetry(fn, { retries = 1, baseDelayMs = 800 } = {}) {
  let lastErr;

  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fn();

      // se veio Response com erro, decide se retry
      if (r && typeof r.status === "number" && !r.ok) {
        if (shouldRetryHttpStatus(r.status) && i < retries) {
          await sleep(baseDelayMs * (i + 1));
          continue;
        }
      }

      return r;
    } catch (e) {
      lastErr = e;

      // ✅ timeout: não retry (evita estourar maxDuration)
      if (e && e.statusCode === 504) throw e;

      if (i < retries) {
        await sleep(baseDelayMs * (i + 1));
        continue;
      }
      throw e;
    }
  }

  throw lastErr;
}

function shouldRetryHttpStatus(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e && e.name === "AbortError") {
      const err = new Error("Timeout ao chamar OpenAI");
      err.statusCode = 504; // ✅ gateway timeout
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampInt(v, fallback, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const nn = Math.floor(n);
  return Math.max(min, Math.min(max, nn));
}

module.exports = { callModel };
