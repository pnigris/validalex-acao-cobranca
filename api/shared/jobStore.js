/* ************************************************************************* */
/* api/shared/jobStore.js                                                    */
/* Persistência simples de jobs via Vercel Blob (JSON)                        */
/* ************************************************************************* */

const { put, get } = require("@vercel/blob");

function jobPath(jobId) {
  return `jobs/cobranca/${jobId}.json`;
}

async function writeJob(jobId, obj) {
  const pathname = jobPath(jobId);
  // allowOverwrite permite atualizar o mesmo pathname. :contentReference[oaicite:2]{index=2}
  const blob = await put(pathname, JSON.stringify(obj || {}), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return blob.url;
}

async function readJob(jobId) {
  const pathname = jobPath(jobId);
  try {
    const r = await get(pathname);
    if (!r) return null;
    const txt = await r.text();
    return JSON.parse(txt);
  } catch (e) {
    // se não existe, retorna null
    return null;
  }
}

module.exports = { jobPath, writeJob, readJob };
