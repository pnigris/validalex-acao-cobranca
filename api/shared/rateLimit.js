/* api/shared/rateLimit.js - in-memory rate limit (MVP) */

const buckets = new Map();

function rateLimit({ key, limit, windowMs }) {
  const now = Date.now();
  const b = buckets.get(key);

  if (!b || (now - b.windowStart) >= windowMs) {
    const next = { windowStart: now, count: 1 };
    buckets.set(key, next);
    return { allowed: true, remaining: Math.max(0, limit - 1), resetMs: windowMs };
  }

  b.count += 1;
  const remaining = limit - b.count;
  const resetMs = windowMs - (now - b.windowStart);

  if (b.count > limit) {
    return { allowed: false, remaining: 0, resetMs };
  }

  return { allowed: true, remaining: Math.max(0, remaining), resetMs };
}

module.exports = { rateLimit };
