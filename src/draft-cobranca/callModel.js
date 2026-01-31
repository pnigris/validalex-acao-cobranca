/* src/draft-cobranca/callModel.js */

async function callModel({ prompt }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurado");

  const model = process.env.OPENAI_MODEL || "gpt-4.1";

  const url = "https://api.openai.com/v1/responses";

  // Formato correto da Responses API
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

  const text = await safeText(r);

  if (!r.ok) {
    throw new Error(`OpenAI error ${r.status}: ${text}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`Resposta inválida da OpenAI: ${e.message}`);
  }

  // Responses API: output_text é o campo principal
  const outputText =
    typeof json.output_text === "string"
      ? json.output_text
      : extractText(json);

  return {
    model,
    raw: json,
    text: outputText
  };
}

function extractText(resp) {
  try {
    if (Array.isArray(resp.output)) {
      return resp.output
        .map(o => o.content || "")
        .join("\n")
        .trim();
    }
    return "";
  } catch {
    return "";
  }
}

async function safeText(r) {
  try { return await r.text(); }
  catch { return ""; }
}

module.exports = { callModel };


  