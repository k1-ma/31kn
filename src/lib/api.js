// Lightweight fetch wrapper with retry on transient failures
// (5xx, 429, network). Mutations carry an Idempotency-Key so safe to retry.

const RETRY_DELAYS = [500, 1000, 2000];
const MAX_RETRIES = RETRY_DELAYS.length;
const RETRYABLE_STATUSES = [503, 429, 0];
const DB_UNAVAILABLE_CODE = "DB_UNAVAILABLE";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelay(attempt) {
  const baseDelay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
  const jitter = baseDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.max(100, Math.round(baseDelay + jitter));
}

function isRetryable(err, data) {
  if (data?.code === DB_UNAVAILABLE_CODE) return true;
  if (RETRYABLE_STATUSES.includes(err?.status)) return true;
  return false;
}

const MUTATION_METHODS_API = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function newIdempotencyKey() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {}
  return null;
}

export async function apiJson(url, options = {}) {
  const { method = "GET", body, headers, idempotencyKey } = options;
  const isMutation = MUTATION_METHODS_API.has(method);
  const effectiveIdempotencyKey =
    idempotencyKey ?? (isMutation ? newIdempotencyKey() : null);

  let lastError = null;
  let attempts = 0;

  while (attempts <= MAX_RETRIES) {
    try {
      const requestHeaders = {
        "Content-Type": "application/json",
        ...(headers || {}),
      };
      if (effectiveIdempotencyKey) {
        requestHeaders["Idempotency-Key"] = effectiveIdempotencyKey;
      }

      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: requestHeaders,
        body: body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
      });

      const isJson = (res.headers.get("content-type") || "").includes("application/json");
      const data = isJson ? await res.json().catch(() => null) : null;

      if (!res.ok) {
        const msg = data?.error || data?.message || data?.messageKey || `HTTP ${res.status}`;
        const err = new Error(msg);
        err.status = res.status;
        err.data = data;
        err.code = data?.code || data?.errorCode;
        err.isRetryable = isRetryable(err, data);

        if (err.isRetryable && attempts < MAX_RETRIES) {
          lastError = err;
          attempts++;
          let delay;
          if (res.status === 429) {
            const retryAfterSec = parseInt(res.headers.get("Retry-After"), 10);
            delay = (retryAfterSec > 0 ? retryAfterSec * 1000 : null) || data?.retryAfterMs || getRetryDelay(attempts - 1);
          } else {
            delay = getRetryDelay(attempts - 1);
          }
          await sleep(delay);
          continue;
        }
        throw err;
      }
      return data;
    } catch (err) {
      if (!err.status) {
        err.status = 0;
        err.isRetryable = true;
        err.message = err.message || "Network error";
      }
      if (err.isRetryable && attempts < MAX_RETRIES) {
        lastError = err;
        attempts++;
        await sleep(getRetryDelay(attempts - 1));
        continue;
      }
      if (err.status === 503 || err.status === 0) {
        console.error(`[API] ${method} ${url} failed after ${attempts + 1} attempt(s):`, err.message);
      }
      throw err;
    }
  }

  throw lastError || new Error("Request failed");
}
