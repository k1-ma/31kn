// ─────────────────────────────────────────────────────────────────────────────
// CHUNKED SYNC UTILITIES
// Provides chunking, compression, and operation-based sync for large payloads
// ─────────────────────────────────────────────────────────────────────────────

// Chunk size limit (1MB to balance chunk count vs. body size).
// Vercel allows 4.5MB (Hobby) / 6MB (Pro) per request body.
// 1MB chunk data + JSON wrapper ≈ 1.2MB, well under 4.5MB.
// Previously 200KB — caused 25+ chunks for typical 50-trade journals,
// leading to ~2-minute sync times due to sequential HTTP requests.
export const MAX_CHUNK_SIZE_BYTES = 1 * 1024 * 1024;

// Safe HTTP body size limit for Vercel serverless functions.
// Vercel Hobby plan allows 4.5MB, Pro allows 6MB.
// We use 4MB to leave headroom for JSON wrapper overhead.
const SAFE_BODY_LIMIT = 4 * 1024 * 1024;

// Maximum number of concurrent chunk uploads.
// Server stores chunks by index and assembles when all are received,
// so order doesn't matter. Parallel uploads dramatically reduce total time.
const MAX_CONCURRENT_CHUNKS = 3;

// UUID-like ID generator for operations and sessions
export function generateId() {
  // Use crypto.randomUUID if available, otherwise fallback
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback implementation
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYLOAD SIZE UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate the size of a JSON payload in bytes
 */
export function getPayloadSize(data) {
  try {
    return new Blob([JSON.stringify(data)]).size;
  } catch {
    // Fallback for environments without Blob
    return JSON.stringify(data).length;
  }
}

/**
 * Check if payload exceeds the chunk size limit
 */
export function isPayloadTooLarge(data, limit = MAX_CHUNK_SIZE_BYTES) {
  return getPayloadSize(data) > limit;
}

/**
 * Get human-readable size string
 */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DIFF / OPERATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an operation entry for the sync queue
 * @param {string} type - Operation type: 'create', 'update', 'delete', 'set'
 * @param {string} collection - Collection name: 'trades', 'accounts', 'documents', etc.
 * @param {string} id - Entity ID (for create/update/delete) or null for 'set'
 * @param {any} data - The data payload
 * @returns {Object} Operation object with timestamp and unique ID
 */
export function createOperation(type, collection, id, data) {
  return {
    opId: generateId(),
    type,
    collection,
    entityId: id,
    data,
    timestamp: Date.now(),
  };
}

/**
 * Detect changes between old and new state and generate operations
 * @param {Object} oldState - Previous state
 * @param {Object} newState - Current state
 * @returns {Array} Array of operations
 */
export function detectChanges(oldState, newState) {
  const operations = [];
  
  if (!oldState || !newState) {
    // If no old state, treat entire new state as a 'set' operation
    if (newState) {
      operations.push(createOperation("set", "state", null, newState));
    }
    return operations;
  }
  
  // Compare array collections (trades, accounts, documents)
  const arrayCollections = ["trades", "accounts", "documents"];
  
  for (const collection of arrayCollections) {
    const oldItems = oldState[collection] || [];
    const newItems = newState[collection] || [];
    
    const oldMap = new Map(oldItems.filter(item => item?.id).map(item => [item.id, item]));
    const newMap = new Map(newItems.filter(item => item?.id).map(item => [item.id, item]));
    
    // Find created and updated items
    for (const [id, newItem] of newMap) {
      const oldItem = oldMap.get(id);
      if (!oldItem) {
        // New item
        operations.push(createOperation("create", collection, id, newItem));
      } else if (JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
        // Updated item
        operations.push(createOperation("update", collection, id, newItem));
      }
    }
    
    // Find deleted items
    for (const [id] of oldMap) {
      if (!newMap.has(id)) {
        operations.push(createOperation("delete", collection, id, null));
      }
    }
  }
  
  // Compare non-array top-level keys (ui, settings, etc.)
  const nonArrayKeys = Object.keys(newState).filter(
    key => !arrayCollections.includes(key) && !Array.isArray(newState[key])
  );
  
  for (const key of nonArrayKeys) {
    const oldVal = JSON.stringify(oldState[key]);
    const newVal = JSON.stringify(newState[key]);
    
    if (oldVal !== newVal) {
      operations.push(createOperation("set", key, null, newState[key]));
    }
  }
  
  return operations;
}

// ─────────────────────────────────────────────────────────────────────────────
// CHUNKING LOGIC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Split operations into chunks that fit within the size limit
 * @param {Array} operations - Array of operations
 * @param {number} maxSize - Maximum chunk size in bytes
 * @returns {Array} Array of chunks, each chunk is an array of operations
 */
export function chunkOperations(operations, maxSize = MAX_CHUNK_SIZE_BYTES) {
  if (!operations || operations.length === 0) {
    return [];
  }
  
  const chunks = [];
  let currentChunk = [];
  let currentSize = 0;
  
  // Reserve space for chunk metadata (sessionId, index, etc.) - ~200 bytes
  const metadataOverhead = 200;
  const effectiveLimit = maxSize - metadataOverhead;
  
  for (const op of operations) {
    const opSize = getPayloadSize(op);
    
    // If single operation exceeds limit, it needs to be handled specially
    if (opSize > effectiveLimit) {
      // Finish current chunk if not empty
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentSize = 0;
      }
      
      // Check if this is a large data item that can be chunked further
      if (op.type === "create" || op.type === "update" || op.type === "set") {
        const splitOps = splitLargeOperation(op, effectiveLimit);
        for (const splitOp of splitOps) {
          chunks.push([splitOp]);
        }
      } else {
        // Delete operations should always be small, just add as-is
        chunks.push([op]);
      }
      continue;
    }
    
    // Check if adding this operation would exceed the limit
    if (currentSize + opSize > effectiveLimit && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentSize = 0;
    }
    
    currentChunk.push(op);
    currentSize += opSize;
  }
  
  // Add remaining operations
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

/**
 * Split a large operation into smaller pieces
 * Used when a single operation (e.g., trade with many images) is too large
 */
function splitLargeOperation(op, maxSize) {
  // For 'set' operations on the entire state, split by top-level keys
  if (op.type === "set" && op.collection === "state" && typeof op.data === "object") {
    const result = [];
    
    for (const [key, value] of Object.entries(op.data)) {
      const subOp = createOperation("set", key, null, value);
      const subOpSize = getPayloadSize(subOp);
      
      if (subOpSize > maxSize && Array.isArray(value)) {
        // Split array into smaller batches
        const batchSize = Math.max(1, Math.floor(value.length / Math.ceil(subOpSize / maxSize)));
        for (let i = 0; i < value.length; i += batchSize) {
          const batch = value.slice(i, i + batchSize);
          result.push(createOperation("setBatch", key, `batch_${i}`, { 
            items: batch, 
            startIndex: i,
            isPartial: true,
            totalCount: value.length 
          }));
        }
      } else {
        result.push(subOp);
      }
    }
    
    return result;
  }
  
  // For create/update operations with large data, strip base64 images
  if ((op.type === "create" || op.type === "update") && op.data) {
    const cleanedData = stripBase64Images(op.data);
    return [{ ...op, data: cleanedData }];
  }
  
  // Return as-is if can't be split
  return [op];
}

/**
 * Strip base64 image data from an object to reduce payload size
 * Replaces base64 with placeholder markers
 */
export function stripBase64Images(obj) {
  if (!obj || typeof obj !== "object") return obj;
  
  // Common patterns for base64 image data
  const base64Pattern = /^data:image\/[a-zA-Z]+;base64,/;
  
  const strip = (value, key) => {
    if (typeof value === "string" && base64Pattern.test(value)) {
      // Return a marker indicating this was stripped
      return "[IMAGE_STRIPPED]";
    }
    if (Array.isArray(value)) {
      return value.map((item, idx) => strip(item, idx));
    }
    if (value && typeof value === "object") {
      const result = {};
      for (const [k, v] of Object.entries(value)) {
        result[k] = strip(v, k);
      }
      return result;
    }
    return value;
  };
  
  return strip(obj, null);
}

/**
 * Count base64 images in an object
 */
export function countBase64Images(obj) {
  if (!obj || typeof obj !== "object") return 0;
  
  const base64Pattern = /^data:image\/[a-zA-Z]+;base64,/;
  let count = 0;
  
  const traverse = (value) => {
    if (typeof value === "string" && base64Pattern.test(value)) {
      count++;
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(traverse);
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value).forEach(traverse);
    }
  };
  
  traverse(obj);
  return count;
}

/**
 * Get total size of base64 images in an object
 */
export function getBase64ImageSize(obj) {
  if (!obj || typeof obj !== "object") return 0;
  
  const base64Pattern = /^data:image\/[a-zA-Z]+;base64,/;
  let totalSize = 0;
  
  const traverse = (value) => {
    if (typeof value === "string" && base64Pattern.test(value)) {
      totalSize += value.length;
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(traverse);
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value).forEach(traverse);
    }
  };
  
  traverse(obj);
  return totalSize;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPRESSION UTILITIES (for browsers that support it)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if compression is supported
 */
export function isCompressionSupported() {
  return typeof CompressionStream !== "undefined";
}

/**
 * Compress a string using gzip (browser native)
 * @param {string} str - String to compress
 * @returns {Promise<Uint8Array>} Compressed data
 */
export async function compressString(str) {
  if (!isCompressionSupported()) {
    throw new Error("CompressionStream not supported");
  }
  
  const encoder = new TextEncoder();
  const stream = new CompressionStream("gzip");
  const writer = stream.writable.getWriter();
  
  writer.write(encoder.encode(str));
  writer.close();
  
  const reader = stream.readable.getReader();
  const chunks = [];
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  // Combine all chunks
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  
  return result;
}

/**
 * Convert Uint8Array to base64
 */
export function uint8ArrayToBase64(bytes) {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 to Uint8Array
 */
export function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNC SESSION MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a sync session for chunked uploads
 */
export function createSyncSession() {
  return {
    sessionId: generateId(),
    startedAt: Date.now(),
    chunks: [],
    status: "pending",
    progress: 0,
  };
}

/**
 * Calculate sync progress percentage
 */
export function calculateProgress(completedChunks, totalChunks) {
  if (totalChunks === 0) return 100;
  return Math.round((completedChunks / totalChunks) * 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// CHUNKED SYNC API CLIENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a single chunk to the server with timeout
 * @param {Object} options
 * @param {string} options.sessionId - Sync session ID
 * @param {number} options.chunkIndex - Current chunk index (0-based)
 * @param {number} options.totalChunks - Total number of chunks
 * @param {Array} options.operations - Operations in this chunk
 * @param {boolean} options.isLast - Whether this is the last chunk
 * @param {number} [options.timeoutMs] - Timeout in milliseconds (default: 30000)
 * @returns {Promise<Object>} Server response
 */
export async function sendChunk({ sessionId, chunkIndex, totalChunks, operations, isLast, timeoutMs = 30000 }) {
  const body = {
    chunkIndex,
    totalChunks,
    operations,
    isLast,
  };
  if (sessionId) {
    body.sessionId = sessionId;
  }

  // Create AbortController for timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("/api/sync/chunk", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    
    clearTimeout(timer);
    
    // Parse JSON safely — Vercel/proxy may return HTML error pages (502/504)
    let data;
    try {
      data = await response.json();
    } catch (parseErr) {
      const err = new Error(`Server returned non-JSON response (HTTP ${response.status}): ${parseErr.message}`);
      err.status = response.status;
      err.code = "NON_JSON_RESPONSE";
      throw err;
    }
    
    // 202 = partial chunks received, not an error but sync is incomplete
    if (response.status === 202) {
      return data;
    }
    
    if (!response.ok) {
      const err = new Error(data?.error || data?.message || `HTTP ${response.status}`);
      err.status = response.status;
      err.code = data?.code;
      err.data = data;
      throw err;
    }
    
    return data;
  } catch (err) {
    clearTimeout(timer);
    
    // Convert AbortError to more specific timeout error
    if (err.name === 'AbortError') {
      const timeoutErr = new Error(`Chunk upload timeout after ${timeoutMs}ms`);
      timeoutErr.code = 'CHUNK_TIMEOUT';
      timeoutErr.name = 'TimeoutError';
      throw timeoutErr;
    }
    
    throw err;
  }
}

/**
 * Perform chunked sync with progress reporting and per-chunk retry
 * @param {Array} operations - All operations to sync
 * @param {Object} options
 * @param {Function} options.onProgress - Progress callback (progress%, chunksCompleted, totalChunks)
 * @param {number} [options.maxRestarts] - Max session restart attempts (default: 2)
 * @param {number} [options.maxChunkRetries] - Max retries per chunk (default: 5)
 * @returns {Promise<Object>} Final result { ok, version, updated_at }
 */
export async function performChunkedSync(operations, { onProgress, maxRestarts = 2, maxChunkRetries = 5 } = {}) {
  const chunks = chunkOperations(operations);
  const totalChunks = chunks.length;
  
  if (totalChunks === 0) {
    return { ok: true, noChanges: true };
  }
  
  /**
   * Send a chunk with exponential backoff retry
   * @param {number} chunkIndex - Index of chunk to send
   * @param {string} sessionId - Session ID
   * @param {boolean} isLast - Whether this is the last chunk
   * @returns {Promise<Object>} Response from sendChunk
   */
  const sendChunkWithRetry = async (chunkIndex, sessionId, isLast) => {
    const chunk = chunks[chunkIndex];
    let lastError = null;
    
    for (let retry = 0; retry <= maxChunkRetries; retry++) {
      try {
        const result = await sendChunk({
          sessionId,
          chunkIndex,
          totalChunks,
          operations: chunk,
          isLast,
        });
        
        // Success
        if (retry > 0 && process.env.NODE_ENV === "development") {
          console.log(`[syncChunked] Chunk ${chunkIndex} succeeded after ${retry} retries`);
        }
        
        return result;
      } catch (err) {
        lastError = err;
        
        // Session errors (409) should not be retried at chunk level
        // These require full session restart
        if (err.status === 409) {
          throw err;
        }
        
        // If this is the last retry, throw the error
        if (retry === maxChunkRetries) {
          if (process.env.NODE_ENV === "development") {
            console.error(`[syncChunked] Chunk ${chunkIndex} failed after ${maxChunkRetries + 1} attempts:`, err);
          }
          throw err;
        }
        
        // Calculate exponential backoff with jitter: 1s, 2s, 4s, 8s, 16s
        const baseDelay = 1000 * Math.pow(2, retry);
        const jitter = baseDelay * 0.25 * (Math.random() * 2 - 1); // ±25% jitter
        const delay = Math.max(1000, Math.round(baseDelay + jitter));
        
        if (process.env.NODE_ENV === "development") {
          console.warn(`[syncChunked] Chunk ${chunkIndex} failed (attempt ${retry + 1}/${maxChunkRetries + 1}), retrying in ${delay}ms:`, err.message);
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // Should not reach here, but throw last error if we do
    throw lastError;
  };
  
  for (let attempt = 0; attempt <= maxRestarts; attempt++) {
    let sessionId = null;
    let lastResult = null;
    let restarted = false;

    if (process.env.NODE_ENV === "development") {
      console.log("[syncChunked] Starting chunked sync:", {
        attempt,
        operationsCount: operations.length,
        chunksCount: totalChunks,
        totalSizeKb: formatBytes(getPayloadSize(operations)),
      });
    }

    for (let i = 0; i < chunks.length; i++) {
      const isLast = i === chunks.length - 1;

      try {
        lastResult = await sendChunkWithRetry(i, sessionId, isLast);

        // Capture server-assigned sessionId from first chunk response
        if (lastResult.sessionId) {
          sessionId = lastResult.sessionId;
        }

        const progress = calculateProgress(i + 1, totalChunks);
        if (onProgress) {
          onProgress(progress, i + 1, totalChunks);
        }

        if (process.env.NODE_ENV === "development") {
          console.log(`[syncChunked] Chunk ${i + 1}/${totalChunks} sent:`, {
            sessionId,
            operationsInChunk: chunks[i].length,
            progress: `${progress}%`,
            sizeKb: formatBytes(getPayloadSize(chunks[i])),
          });
        }
      } catch (err) {
        // Handle 409: session lost, missing, or expired - restart from chunk 0
        if (err.status === 409 && (err.code === "SESSION_NOT_FOUND_RETRY" || err.code === "SESSION_ID_REQUIRED" || err.code === "SESSION_EXPIRED_RETRY") && attempt < maxRestarts) {
          if (process.env.NODE_ENV === "development") {
            console.log(`[syncChunked] Session error (${err.code}), restarting upload (attempt ${attempt + 1})`);
          }
          restarted = true;
          break;
        }
        if (process.env.NODE_ENV === "development") {
          console.error(`[syncChunked] Chunk ${i + 1}/${totalChunks} failed:`, err);
        }
        throw err;
      }
    }

    if (restarted) {
      continue;
    }

    // After sending all chunks, check if sync is complete
    // If server reports missing chunks, retry them
    if (lastResult?.status === "receiving" && lastResult?.code === "PARTIAL_CHUNKS_RECEIVED") {
      const missingChunks = lastResult.missingChunks || [];
      if (process.env.NODE_ENV === "development") {
        console.log("[syncChunked] Retrying missing operation chunks:", missingChunks);
      }

      for (const missingIdx of missingChunks) {
        if (missingIdx >= 0 && missingIdx < chunks.length) {
          const isRetryLast = missingIdx === missingChunks[missingChunks.length - 1];
          lastResult = await sendChunk({
            sessionId,
            chunkIndex: missingIdx,
            totalChunks,
            operations: chunks[missingIdx],
            isLast: isRetryLast,
          });
        }
      }
    }

    // Validate that the sync actually completed
    if (lastResult && lastResult.status !== "complete" && lastResult.ok !== false) {
      const err = new Error("Chunked sync did not complete - server has not applied the operations");
      err.code = "SYNC_INCOMPLETE";
      err.data = lastResult;
      throw err;
    }

    return lastResult || { ok: true };
  }

  // All restart attempts exhausted
  const err = new Error("Chunked sync failed after maximum restart attempts");
  err.code = "SYNC_RESTART_EXHAUSTED";
  throw err;
}

// ─────────────────────────────────────────────────────────────────────────────
// FULL STATE CHUNKED SYNC (for when diff is not possible)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Chunk full state into pieces for sync
 * Used when diff-based sync is not possible (e.g., initial sync)
 * @param {Object} state - Full state object
 * @param {number} maxSize - Maximum chunk size
 * @returns {Array} Array of state chunks
 */
export function chunkFullState(state, maxSize = MAX_CHUNK_SIZE_BYTES) {
  const stateSize = getPayloadSize(state);
  
  // If state fits in one chunk, return as-is
  if (stateSize <= maxSize) {
    return [{ type: "fullState", data: state, isPartial: false }];
  }
  
  // Split by top-level keys
  const chunks = [];
  const currentChunk = { type: "partialState", data: {}, keys: [] };
  let currentSize = 100; // Base overhead
  
  for (const [key, value] of Object.entries(state)) {
    const keySize = getPayloadSize({ [key]: value });
    
    // If single key exceeds limit and is an array, split it
    if (keySize > maxSize && Array.isArray(value)) {
      // Flush current chunk if not empty
      if (currentChunk.keys.length > 0) {
        chunks.push({ ...currentChunk });
        currentChunk.data = {};
        currentChunk.keys = [];
        currentSize = 100;
      }
      
      // Split array into smaller chunks
      const itemsPerChunk = Math.max(1, Math.floor(value.length / Math.ceil(keySize / maxSize)));
      for (let i = 0; i < value.length; i += itemsPerChunk) {
        const batch = value.slice(i, i + itemsPerChunk);
        chunks.push({
          type: "arrayBatch",
          key,
          data: batch,
          startIndex: i,
          totalLength: value.length,
          isPartial: true,
        });
      }
      continue;
    }
    
    // If adding this key would exceed limit, flush current chunk
    if (currentSize + keySize > maxSize && currentChunk.keys.length > 0) {
      chunks.push({ ...currentChunk });
      currentChunk.data = {};
      currentChunk.keys = [];
      currentSize = 100;
    }
    
    currentChunk.data[key] = value;
    currentChunk.keys.push(key);
    currentSize += keySize;
  }
  
  // Add remaining data
  if (currentChunk.keys.length > 0) {
    chunks.push({ ...currentChunk });
  }
  
  // Post-process: ensure no chunk exceeds the safe HTTP body limit.
  // Individual array items (e.g., trades with large base64 images) can exceed
  // the chunk target size. If any chunk exceeds the Vercel body limit,
  // strip base64 images from items in that chunk to ensure it can be sent.
  return ensureChunksFitBodyLimit(chunks);
}

/**
 * Strip base64 images from a chunk to reduce its size.
 * Used proactively by ensureChunksFitBodyLimit and reactively on 413 responses.
 */
function stripChunkImages(chunk) {
  if (chunk.type === "arrayBatch" && Array.isArray(chunk.data)) {
    return { ...chunk, data: chunk.data.map((item) => stripBase64Images(item)) };
  }
  if ((chunk.type === "partialState" || chunk.type === "fullState") && chunk.data) {
    return { ...chunk, data: stripBase64Images(chunk.data) };
  }
  return chunk;
}

/**
 * Ensure all chunks fit within the safe HTTP body limit.
 * For arrayBatch chunks that are too large, tries to split them into smaller
 * sub-batches first (preserving images). Only strips base64 images as a last
 * resort when a single item still exceeds the limit.
 *
 * This is critical for backtests: each backtest object contains a nested
 * trades[] array with images, so a single backtest can easily exceed 4MB.
 * Previously, ALL images in the chunk were stripped, causing permanent image
 * loss when the server had no existing version to restore from.
 */
function ensureChunksFitBodyLimit(chunks) {
  const result = [];

  for (const chunk of chunks) {
    const chunkSize = getPayloadSize(chunk);
    if (chunkSize <= SAFE_BODY_LIMIT) {
      result.push(chunk);
      continue;
    }

    // ArrayBatch with multiple items → split into smaller sub-batches
    if (chunk.type === "arrayBatch" && Array.isArray(chunk.data) && chunk.data.length > 1) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          `[syncChunked] ArrayBatch chunk too large (${formatBytes(chunkSize)} > ${formatBytes(SAFE_BODY_LIMIT)}), splitting into sub-batches`
        );
      }
      // Split batch into individual items and recursively ensure they fit
      for (let i = 0; i < chunk.data.length; i++) {
        const subChunk = {
          type: "arrayBatch",
          key: chunk.key,
          data: [chunk.data[i]],
          startIndex: chunk.startIndex + i,
          totalLength: chunk.totalLength,
          isPartial: true,
        };
        const subSize = getPayloadSize(subChunk);
        if (subSize <= SAFE_BODY_LIMIT) {
          result.push(subChunk);
        } else {
          // Single item exceeds limit — strip images from just this item
          if (process.env.NODE_ENV === "development") {
            console.warn(
              `[syncChunked] Single item in batch exceeds body limit (${formatBytes(subSize)}), stripping images from this item only`
            );
          }
          result.push(stripChunkImages(subChunk));
        }
      }
      continue;
    }

    // Non-array chunk or single-item array — strip images as last resort
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[syncChunked] Chunk exceeds safe body limit (${formatBytes(chunkSize)} > ${formatBytes(SAFE_BODY_LIMIT)}), stripping images`
      );
    }

    result.push(stripChunkImages(chunk));
  }

  return result;
}

/**
 * Send full state in chunks
 * @param {Object} state - Full state to send
 * @param {Object} options
 * @param {Function} options.onProgress - Progress callback
 * @param {number} [options.maxRestarts] - Max session restart attempts (default: 2)
 * @param {number} [options.maxChunkRetries] - Max retries per chunk (default: 3)
 * @returns {Promise<Object>} Final result
 */
export async function sendFullStateChunked(state, { onProgress, maxRestarts = 2, maxChunkRetries = 3, expected_version } = {}) {
  const chunks = chunkFullState(state);
  const totalChunks = chunks.length;

  /**
   * Send a state chunk with exponential backoff retry.
   * Handles transient network/timeout errors that are common with VPN users.
   * On 413 (payload too large), strips base64 images from the chunk and retries.
   */
  const sendStateChunkWithRetry = async (chunkIndex, sessionId, chunk, isLast) => {
    let currentChunk = chunk;
    let imageStripped = false;

    // First, handle 413 by stripping images (one-shot, outside the retry loop)
    try {
      return await sendStateChunk({
        sessionId,
        chunkIndex,
        totalChunks,
        chunk: currentChunk,
        isLast,
        expected_version,
      });
    } catch (firstErr) {
      if (firstErr.status === 409) throw firstErr;

      if (firstErr.status === 413) {
        if (process.env.NODE_ENV === "development") {
          console.warn(`[syncChunked] State chunk ${chunkIndex} got 413, stripping images and retrying`);
        }
        currentChunk = stripChunkImages(currentChunk);
        imageStripped = true;
        // Fall through to retry loop below
      } else {
        // For non-413 errors, fall through to retry loop starting from retry 1
        // (first attempt already used above)
      }
    }

    // Retry loop (handles both post-413-stripping retries and transient errors)
    for (let retry = 0; retry <= maxChunkRetries; retry++) {
      try {
        const result = await sendStateChunk({
          sessionId,
          chunkIndex,
          totalChunks,
          chunk: currentChunk,
          isLast,
          expected_version,
        });

        if (process.env.NODE_ENV === "development") {
          console.log(`[syncChunked] State chunk ${chunkIndex} succeeded after ${retry + 1} retries${imageStripped ? " (images stripped)" : ""}`);
        }

        return result;
      } catch (err) {
        // Session errors (409) should not be retried at chunk level —
        // these require a full session restart handled by the outer loop
        if (err.status === 409) {
          throw err;
        }

        if (retry === maxChunkRetries) {
          if (process.env.NODE_ENV === "development") {
            console.error(`[syncChunked] State chunk ${chunkIndex} failed after ${maxChunkRetries + 1} attempts:`, err);
          }
          throw err;
        }

        // Exponential backoff with jitter: ~1s, ~2s, ~4s (for retry attempts 1-3)
        const baseDelay = 1000 * Math.pow(2, retry);
        const jitter = baseDelay * 0.25 * (Math.random() * 2 - 1);
        const delay = Math.max(1000, Math.round(baseDelay + jitter));

        if (process.env.NODE_ENV === "development") {
          console.warn(`[syncChunked] State chunk ${chunkIndex} failed (attempt ${retry + 1}/${maxChunkRetries + 1}), retrying in ${delay}ms:`, err.message);
        }

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  };

  for (let attempt = 0; attempt <= maxRestarts; attempt++) {
    let sessionId = null;
    let lastResult = null;
    let restarted = false;

    if (process.env.NODE_ENV === "development") {
      console.log("[syncChunked] Starting full state chunked sync:", {
        attempt,
        chunksCount: totalChunks,
        totalSizeKb: formatBytes(getPayloadSize(state)),
      });
    }

    try {
      // Step 1: Send chunk 0 first to get the server-assigned sessionId
      const firstResult = await sendStateChunkWithRetry(0, sessionId, chunks[0], chunks.length === 1);
      if (firstResult.sessionId) {
        sessionId = firstResult.sessionId;
      }
      lastResult = firstResult;

      let completed = 1;
      if (onProgress) {
        onProgress(calculateProgress(completed, totalChunks), completed, totalChunks);
      }

      // Step 2: Send remaining chunks in parallel batches
      if (chunks.length > 1) {
        const remaining = chunks.slice(1).map((chunk, idx) => ({ chunk, index: idx + 1 }));

        for (let batchStart = 0; batchStart < remaining.length; batchStart += MAX_CONCURRENT_CHUNKS) {
          const batch = remaining.slice(batchStart, batchStart + MAX_CONCURRENT_CHUNKS);

          const batchResults = await Promise.all(
            batch.map(({ chunk, index }) => {
              const isLast = index === chunks.length - 1;
              return sendStateChunkWithRetry(index, sessionId, chunk, isLast);
            })
          );

          // Update progress and capture last result
          for (const res of batchResults) {
            completed++;
          }
          lastResult = batchResults[batchResults.length - 1];

          if (onProgress) {
            onProgress(calculateProgress(completed, totalChunks), completed, totalChunks);
          }
        }
      }
    } catch (err) {
      // Handle 409 session-level errors: restart upload from chunk 0
      if (err.status === 409 && (err.code === "SESSION_NOT_FOUND_RETRY" || err.code === "SESSION_ID_REQUIRED" || err.code === "SESSION_EXPIRED_RETRY" || err.code === "INCOMPLETE_ARRAY_BATCH") && attempt < maxRestarts) {
        if (process.env.NODE_ENV === "development") {
          console.log(`[syncChunked] Session error (${err.code}), restarting state upload (attempt ${attempt + 1})`);
        }
        restarted = true;
      } else {
        // All other errors (including unhandled 409s) are thrown
        if (process.env.NODE_ENV === "development") {
          console.error(`[syncChunked] Chunked sync failed:`, err);
        }
        throw err;
      }
    }

    if (restarted) {
      continue;
    }

    // After sending all chunks, check if sync is complete
    // If lastResult has status "receiving" with missing chunks, retry them
    if (lastResult?.status === "receiving" && lastResult?.code === "PARTIAL_CHUNKS_RECEIVED") {
      const missingChunks = lastResult.missingChunks || [];
      if (process.env.NODE_ENV === "development") {
        console.log("[syncChunked] Retrying missing chunks:", missingChunks);
      }

      for (const missingIdx of missingChunks) {
        if (missingIdx >= 0 && missingIdx < chunks.length) {
          const chunk = chunks[missingIdx];
          const isRetryLast = missingIdx === missingChunks[missingChunks.length - 1];
          lastResult = await sendStateChunk({
            sessionId,
            chunkIndex: missingIdx,
            totalChunks,
            chunk,
            isLast: isRetryLast,
            // Don't send expected_version - server doesn't check it, matches PUT behavior
          });
        }
      }
    }

    // Validate that the sync actually completed
    if (lastResult && lastResult.status !== "complete" && lastResult.ok !== false) {
      const err = new Error("Chunked sync did not complete - server has not saved the state");
      err.code = "SYNC_INCOMPLETE";
      err.data = lastResult;
      throw err;
    }

    return lastResult || { ok: true };
  }

  // All restart attempts exhausted
  const err = new Error("Full state chunked sync failed after maximum restart attempts");
  err.code = "SYNC_RESTART_EXHAUSTED";
  throw err;
}

/**
 * Send a state chunk to the server with timeout
 */
async function sendStateChunk({ sessionId, chunkIndex, totalChunks, chunk, isLast, timeoutMs = 30000, expected_version }) {
  const body = {
    chunkIndex,
    totalChunks,
    chunk,
    isLast,
  };
  if (sessionId) {
    body.sessionId = sessionId;
  }
  // BUG #5: The first chunk (chunkIndex 0) sends expected_version;
  // subsequent chunks inherit the session's version context on the server.
  if (chunkIndex === 0 && typeof expected_version === "number") {
    body.expected_version = expected_version;
  }

  // Create AbortController for timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("/api/sync/state-chunk", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    
    clearTimeout(timer);
    
    // Parse JSON safely — Vercel/proxy may return HTML error pages (502/504)
    let data;
    try {
      data = await response.json();
    } catch (parseErr) {
      const err = new Error(`Server returned non-JSON response (HTTP ${response.status}): ${parseErr.message}`);
      err.status = response.status;
      err.code = "NON_JSON_RESPONSE";
      throw err;
    }
    
    // 202 = partial chunks received, not an error but sync is incomplete
    if (response.status === 202) {
      return data;
    }
    
    if (!response.ok) {
      const err = new Error(data?.error || data?.message || `HTTP ${response.status}`);
      err.status = response.status;
      err.code = data?.code;
      err.data = data;
      throw err;
    }
    
    return data;
  } catch (err) {
    clearTimeout(timer);
    
    // Convert AbortError to more specific timeout error
    if (err.name === 'AbortError') {
      const timeoutErr = new Error(`State chunk upload timeout after ${timeoutMs}ms`);
      timeoutErr.code = 'CHUNK_TIMEOUT';
      timeoutErr.name = 'TimeoutError';
      throw timeoutErr;
    }
    
    throw err;
  }
}
