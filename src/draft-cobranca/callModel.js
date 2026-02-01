/* src/draft-cobranca/callModel.js */

async function callModel({ prompt }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurado");

  const model = process.env.OPENAI_MODEL || "gpt-4.1";
  const url = "https://api.openai.com/v1/responses";

  // Log do payload enviado
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

  // Log do status HTTP
  console.log("CALLMODEL → Status HTTP:", r.status);

  const text = await safeText(r);

  // Log da resposta bruta da OpenAI
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

  // Log do JSON parseado
  console.log("CALLMODEL → JSON PARSEADO:", json);

  const outputText =
    typeof json.output_text === "string"
      ? json.output_text
      : extractText(json);

  // Log do texto final extraído
  console.log("CALLMODEL → OUTPUT TEXT:", outputText);

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
