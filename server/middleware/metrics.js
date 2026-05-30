import { getPool } from "../services/db.service.js";

// Metrics middleware for tracking usage
// Records request count, bytes in/out, and latency per user/IP per day
export function metricsMiddleware(req, res, next) {
  const startTime = Date.now();
  const originalEnd = res.end;
  const originalJson = res.json;

  let responseSize = 0;

  // Track response size via json
  res.json = function (body) {
    if (body !== undefined) {
      try {
        responseSize = JSON.stringify(body).length;
      } catch {}
    }
    return originalJson.call(this, body);
  };

  res.end = function (chunk, encoding) {
    const duration = Date.now() - startTime;
    const bytesIn = parseInt(req.headers["content-length"] || 0) || 0;
    const bytesOut = responseSize || (chunk ? Buffer.byteLength(chunk, encoding) : 0);

    // Record metrics asynchronously (don't block response)
    setImmediate(() => {
      recordMetrics({
        userId: req.session?.userId || null,
        ip: req.ip || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || null,
        bytesIn,
        bytesOut,
        durationMs: duration,
      }).catch(() => {});
    });

    return originalEnd.call(this, chunk, encoding);
  };

  next();
}

async function recordMetrics({ userId, ip, bytesIn, bytesOut, durationMs }) {
  const pool = getPool();
  if (!pool) return;
  if (!userId) return;

  try {
    await pool.query(
      `INSERT INTO usage_daily (day, user_id, requests, bytes_in, bytes_out, total_ms)
       VALUES (CURRENT_DATE, $1, 1, $2, $3, $4)
       ON CONFLICT (day, user_id) DO UPDATE SET
         requests = usage_daily.requests + 1,
         bytes_in = usage_daily.bytes_in + $2,
         bytes_out = usage_daily.bytes_out + $3,
         total_ms = usage_daily.total_ms + $4`,
      [userId, bytesIn, bytesOut, durationMs]
    );
  } catch (e) {
    // Ignore errors - metrics are non-critical
  }
}
