/* src/draft-cobranca/callModel.js */

async function callModel({ prompt }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurado");

  const model = process.env.OPENAI_MODEL || "gpt-4.1";
  const url = "https://api.openai.com/v1/responses";

  console.log("CALLMODEL → Payload enviado:", {
    model,
    system: prompt.system?.slice(0, 200),
    user: prompt.user?.slice(0, 200)
  });

  const payload = {
    model,
    input: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user }
    ],
    temperature: 0.2
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  console.log("CALLMODEL → Status HTTP:", r.status);

  const text = await safeText(r);

  console.log("CALLMODEL → RAW TEXT:", text);

  if (!r.ok) {
    console.log("CALLMODEL → ERRO DA OPENAI:", text);
    throw new Error(`OpenAI error ${r.status}: ${text}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    console.log("CALLMODEL → FALHA NO PARSE JSON:", e.message);
    throw new Error(`Resposta inválida da OpenAI: ${e.message}`);
  }

  console.log("CALLMODEL → JSON PARSEADO:", json);

  const outputText = extractOutputText(json);

  if (!outputText) {
    console.log("CALLMODEL → OUTPUT TEXT VAZIO");
    throw new Error("Modelo não retornou texto utilizável em 'output'.");
  }

  console.log("CALLMODEL → OUTPUT TEXT:", outputText);

  return {
    model,
    raw: json,
    text: outputText
  };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function extractOutputText(resp) {
  try {
    if (Array.isArray(resp.output)) {
      for (const msg of resp.output) {
        if (Array.isArray(msg.content)) {
          for (const c of msg.content) {
            if (c.type === "output_text" && typeof c.text === "string") {
              return c.text.trim();
            }
          }
        }
      }
    }
    return "";
  } catch {
    return "";
  }
}

async function safeText(r) {
  try {
    return await r.text();
  } catch {
    return "";
  }
}

module.exports = { callModel };

