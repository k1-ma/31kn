// ─────────────────────────────────────────────────────────────────────────────
// RETRY CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────
const RETRY_DELAYS = [500, 1000, 2000]; // Backoff delays in ms
const MAX_RETRIES = RETRY_DELAYS.length;

// Retryable status codes (503 = DB unavailable, 429 = rate limited, 0 = network error)
const RETRYABLE_STATUSES = [503, 429, 0];

// DB unavailable error code from backend
const DB_UNAVAILABLE_CODE = "DB_UNAVAILABLE";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get retry delay with jitter (±25%)
 */
function getRetryDelay(attempt) {
  const baseDelay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
  const jitter = baseDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.max(100, Math.round(baseDelay + jitter));
}

/**
 * Check if error is retryable
 */
function isRetryable(err, data) {
  // Check for DB_UNAVAILABLE code in response
  if (data?.code === DB_UNAVAILABLE_CODE) return true;
  // Check for retryable status codes
  if (RETRYABLE_STATUSES.includes(err?.status)) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// API CLIENT WITH RETRY
// ─────────────────────────────────────────────────────────────────────────────

const MUTATION_METHODS_API = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Generate a UUID v4 for the Idempotency-Key header. Returns null when
// crypto.randomUUID is unavailable (very old browsers); the server
// middleware passes the request through when the header is missing, so
// callers degrade to "no idempotency" rather than failing.
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

  // For mutations, send an Idempotency-Key header. Caller may provide one
  // (so syncDb.js can reuse the same key across outbox retries of the same
  // logical save). If not provided, auto-generate ONCE per apiJson call so
  // the internal retry loop reuses the same key.
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
        body: body !== undefined ? JSON.stringify(body) : undefined,
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
        
        // If retryable and we have retries left, try again
        if (err.isRetryable && attempts < MAX_RETRIES) {
          lastError = err;
          attempts++;
          // BUG #9: Respect Retry-After header from rate limiter (429)
          let delay;
          if (res.status === 429) {
            const retryAfterSec = parseInt(res.headers.get("Retry-After"), 10);
            delay = (retryAfterSec > 0 ? retryAfterSec * 1000 : null) || (data?.retryAfterMs) || getRetryDelay(attempts - 1);
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
      // Network errors (fetch failed, no response)
      if (!err.status) {
        err.status = 0;
        err.isRetryable = true;
        err.message = err.message || "Network error";
      }

      // If retryable and we have retries left, try again
      if (err.isRetryable && attempts < MAX_RETRIES) {
        lastError = err;
        attempts++;
        await sleep(getRetryDelay(attempts - 1));
        continue;
      }

      // Log the error for debugging (only in development or for 503 errors)
      if (err.status === 503 || err.status === 0) {
        console.error(`[API] ${method} ${url} failed after ${attempts + 1} attempt(s):`, err.message);
      }

      throw err;
    }
  }

  // Should not reach here, but just in case
  throw lastError || new Error("Request failed");
}

// ─────────────────────────────────────────────────────────────────────────────
// TRADING IDEAS API CLIENT
// ─────────────────────────────────────────────────────────────────────────────

export const ideasApi = {
  // List trading ideas with optional filters
  list: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.result) params.set("result", filters.result);
    if (filters.pair) params.set("pair", filters.pair);
    if (filters.search) params.set("search", filters.search);
    const qs = params.toString();
    return apiJson(`/api/ideas${qs ? `?${qs}` : ""}`);
  },

  // Get statistics
  stats: () => apiJson("/api/ideas/stats"),

  // Create new trading idea
  create: (idea) => apiJson("/api/ideas", { method: "POST", body: idea }),

  // Update trading idea
  update: (id, updates) => apiJson(`/api/ideas/${id}`, { method: "PATCH", body: updates }),

  // Delete trading idea
  delete: (id) => apiJson(`/api/ideas/${id}`, { method: "DELETE" }),
};

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT UPDATES & FEEDBACK API CLIENT
// ─────────────────────────────────────────────────────────────────────────────

export const updatesApi = {
  // List published project updates (public)
  list: () => apiJson("/api/updates"),

  // Submit user feedback (bug report or suggestion)
  submitFeedback: (feedback) => apiJson("/api/updates/feedback", { method: "POST", body: feedback }),

  // User: Get my feedback tickets
  myFeedback: () => apiJson("/api/updates/feedback/my"),

  // User: Get messages for a feedback ticket
  getFeedbackMessages: (id) => apiJson(`/api/updates/feedback/${id}/messages`),

  // User: Send a message to a feedback ticket
  sendFeedbackMessage: (id, message) => apiJson(`/api/updates/feedback/${id}/messages`, { method: "POST", body: { message } }),

  // User: Close a feedback ticket
  closeFeedback: (id) => apiJson(`/api/updates/feedback/${id}/close`, { method: "POST" }),

  // User: Reopen a feedback ticket
  reopenFeedback: (id) => apiJson(`/api/updates/feedback/${id}/reopen`, { method: "POST" }),

  // Admin: List all project updates
  adminList: () => apiJson("/api/updates/admin/list"),

  // Admin: Create new project update
  adminCreate: (update) => apiJson("/api/updates/admin", { method: "POST", body: update }),

  // Admin: Update project update
  adminUpdate: (id, updates) => apiJson(`/api/updates/admin/${id}`, { method: "PATCH", body: updates }),

  // Admin: Delete project update
  adminDelete: (id) => apiJson(`/api/updates/admin/${id}`, { method: "DELETE" }),

  // Admin: List all feedback
  adminFeedbackList: (status) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const qs = params.toString();
    return apiJson(`/api/updates/admin/feedback${qs ? `?${qs}` : ""}`);
  },

  // Admin: Update feedback status
  adminFeedbackUpdate: (id, updates) => apiJson(`/api/updates/admin/feedback/${id}`, { method: "PATCH", body: updates }),

  // Admin: Delete feedback
  adminFeedbackDelete: (id) => apiJson(`/api/updates/admin/feedback/${id}`, { method: "DELETE" }),

  // Admin: Get messages for a feedback ticket
  adminGetFeedbackMessages: (id) => apiJson(`/api/updates/admin/feedback/${id}/messages`),

  // Admin: Send a message to a feedback ticket
  adminSendFeedbackMessage: (id, message) => apiJson(`/api/updates/admin/feedback/${id}/messages`, { method: "POST", body: { message } }),

  // Admin: Close a feedback ticket
  adminCloseFeedback: (id) => apiJson(`/api/updates/admin/feedback/${id}/close`, { method: "POST" }),

  // Admin: Reopen a feedback ticket
  adminReopenFeedback: (id) => apiJson(`/api/updates/admin/feedback/${id}/reopen`, { method: "POST" }),

  // Admin: Mark a single feedback as read
  adminMarkFeedbackRead: (id) => apiJson(`/api/updates/admin/feedback/${id}/mark-read`, { method: "POST" }),

  // Admin: Mark all feedback as read
  adminMarkAllFeedbackRead: () => apiJson(`/api/updates/admin/feedback/mark-all-read`, { method: "POST" }),
};

// ─────────────────────────────────────────────────────────────────────────────
// EDUCATION API CLIENT
// ─────────────────────────────────────────────────────────────────────────────

export const educationApi = {
  // List published videos with user progress
  list: () => apiJson("/api/education"),

  // Get unique categories
  categories: () => apiJson("/api/education/categories"),

  // Get signed embed URL for video
  getEmbedUrl: (id) => apiJson(`/api/education/${id}/embed-url`, { method: "POST" }),

  // Save user progress
  saveProgress: (id, data) => apiJson(`/api/education/${id}/progress`, { method: "POST", body: data }),

  // Admin: List all videos
  adminList: () => apiJson("/api/education/admin/list"),

  // Admin: Create upload - Step 1: Get direct upload credentials (no file sent through server)
  adminCreateUpload: (metadata) =>
    apiJson("/api/education/admin/create-upload", { method: "POST", body: metadata }),

  // Admin: Confirm upload - Step 2: Save video record after direct upload completes
  adminConfirmUpload: (data) =>
    apiJson("/api/education/admin/confirm-upload", { method: "POST", body: data }),

  // Admin: Upload new video (legacy - limited by Vercel 4.5MB payload)
  adminUpload: async (formData) => {
    const res = await fetch("/api/education/admin/upload", {
      method: "POST",
      credentials: "include",
      body: formData,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  },

  // Admin: Update video metadata
  adminUpdate: (id, data) => apiJson(`/api/education/admin/${id}`, { method: "PUT", body: data }),

  // Admin: Delete video
  adminDelete: (id) => apiJson(`/api/education/admin/${id}`, { method: "DELETE" }),

  // Admin: Toggle publish status
  adminTogglePublish: (id) => apiJson(`/api/education/admin/${id}/publish`, { method: "PUT" }),

  // Admin: Reorder videos
  adminReorder: (items) => apiJson("/api/education/admin/reorder", { method: "PUT", body: { items } }),

  // Admin: Check video processing status
  adminCheckStatus: (id) => apiJson(`/api/education/admin/${id}/check-status`, { method: "POST" }),

  // Admin: Get signed embed URL for preview (any ready video, regardless of publish status)
  adminGetEmbedUrl: (id) => apiJson(`/api/education/admin/${id}/embed-url`, { method: "POST" }),

  // Admin: Category management
  adminListCategories: () => apiJson("/api/education/admin/categories"),
  adminCreateCategory: (data) => apiJson("/api/education/admin/categories", { method: "POST", body: data }),
  adminUpdateCategory: (id, data) => apiJson(`/api/education/admin/categories/${id}`, { method: "PUT", body: data }),
  adminDeleteCategory: (id) => apiJson(`/api/education/admin/categories/${id}`, { method: "DELETE" }),
};

