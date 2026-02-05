/* ************************************************************************* */
/* api/shared/jobStore.js                                                    */
/* Persistência simples de jobs via Vercel Blob (JSON)                        */
/* - Write: put(pathname) com overwrite                                      */
/* - Read: head(pathname) -> url -> fetch(url)                               */
/* ************************************************************************* */

const { put, head } = require("@vercel/blob");

function jobPath(jobId) {
  return `jobs/cobranca/${jobId}.json`;
}

async function writeJob(jobId, obj) {
  const pathname = jobPath(jobId);

  const blob = await put(pathname, JSON.stringify(obj || {}), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true
  });

  return blob.url;
}

async function readJob(jobId) {
  const pathname = jobPath(jobId);

  try {
    // 1) pega metadata do blob (inclui a URL real)
    const meta = await head(pathname);
    if (!meta || !meta.url) return null;

    // 2) baixa o conteúdo via URL
    const r = await fetch(meta.url, { method: "GET" });
    if (!r.ok) return null;

    const txt = await r.text();
    return JSON.parse(txt);
  } catch (_) {
    return null;
  }
}

module.exports = { jobPath, writeJob, readJob };
