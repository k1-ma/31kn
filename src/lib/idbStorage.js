/**
 * @fileoverview IndexedDB storage wrapper for TradeJ (BUG #4).
 *
 * Replaces localStorage as the primary state store.
 * IndexedDB has 50MB+ default quota vs localStorage's 5-10MB.
 *
 * Provides:
 * - get(key) / set(key, value) / del(key) — async key-value store
 * - One-time migration from localStorage on first use
 * - Fallback to localStorage when IndexedDB is unavailable (e.g. private browsing)
 *
 * Usage:
 *   import { idbStorage } from "@/lib/idbStorage.js";
 *   const data = await idbStorage.get("koshyk:user:abc123");
 *   await idbStorage.set("koshyk:user:abc123", stateObject);
 */

const DB_NAME = "koshyk-storage";
const DB_VERSION = 1;
const STORE_NAME = "keyval";

let _dbPromise = null;

/**
 * Open (or create) the IndexedDB database.
 * Returns a cached promise so we only open once.
 */
function openDb() {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      _dbPromise = null; // Allow retry
      reject(request.error);
    };
    request.onblocked = () => {
      _dbPromise = null;
      reject(new Error("IndexedDB blocked"));
    };
  });

  return _dbPromise;
}

/**
 * Get a value from IndexedDB by key.
 * @param {string} key
 * @returns {Promise<any>} The stored value, or undefined if not found
 */
async function get(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Set a value in IndexedDB.
 * @param {string} key
 * @param {any} value - Must be structured-cloneable (objects, arrays, strings, etc.)
 * @returns {Promise<void>}
 */
async function set(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a value from IndexedDB.
 * @param {string} key
 * @returns {Promise<void>}
 */
async function del(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Check if IndexedDB is available and functional.
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
  try {
    await openDb();
    return true;
  } catch {
    return false;
  }
}

/**
 * Migrate user state from localStorage to IndexedDB.
 * Called once on app init. Only migrates if IDB is empty for this key.
 *
 * @param {string} userId
 * @returns {Promise<boolean>} true if migration happened
 */
async function migrateFromLocalStorage(userId) {
  if (!userId) return false;

  const key = `koshyk:user:${userId}`;
  try {
    // Check if IDB already has data for this user
    const existing = await get(key);
    if (existing) return false; // Already migrated

    // Check if localStorage has data
    const lsData = localStorage.getItem(key);
    if (!lsData) return false; // Nothing to migrate

    // Parse and store in IDB
    const parsed = JSON.parse(lsData);
    await set(key, parsed);

    console.log(`[idbStorage] Migrated user state from localStorage to IndexedDB: ${key}`);
    return true;
  } catch (err) {
    console.warn("[idbStorage] Migration from localStorage failed:", err?.message);
    return false;
  }
}

/**
 * Save state — tries IndexedDB first, falls back to localStorage.
 * On IDB quota exceeded, shows a storage-full warning.
 *
 * @param {string} key
 * @param {any} value
 * @param {{ onQuotaExceeded?: Function }} options
 * @returns {Promise<{ stored: "idb" | "localStorage" | "failed" }>}
 */
async function saveWithFallback(key, value, { onQuotaExceeded } = {}) {
  // Try IndexedDB first
  try {
    if (await isAvailable()) {
      await set(key, value);
      return { stored: "idb" };
    }
  } catch (err) {
    const isQuota = err?.name === "QuotaExceededError" ||
      err?.code === 22 || // Legacy WebKit
      (err?.message || "").toLowerCase().includes("quota");

    if (isQuota && typeof onQuotaExceeded === "function") {
      onQuotaExceeded("indexeddb");
    }

    console.warn("[idbStorage] IndexedDB write failed, falling back to localStorage:", err?.message);
  }

  // Fallback to localStorage
  try {
    const json = typeof value === "string" ? value : JSON.stringify(value);
    localStorage.setItem(key, json);
    return { stored: "localStorage" };
  } catch (lsErr) {
    const isQuota = lsErr?.name === "QuotaExceededError" ||
      lsErr?.code === 22 ||
      (lsErr?.message || "").toLowerCase().includes("quota");

    if (isQuota && typeof onQuotaExceeded === "function") {
      onQuotaExceeded("localStorage");
    }

    console.error("[idbStorage] Both IndexedDB and localStorage failed:", lsErr?.message);
    return { stored: "failed" };
  }
}

/**
 * Load state — tries IndexedDB first, falls back to localStorage.
 *
 * @param {string} key
 * @returns {Promise<any>} The stored value, or null if not found
 */
async function loadWithFallback(key) {
  // Try IndexedDB first
  try {
    if (await isAvailable()) {
      const value = await get(key);
      if (value !== undefined) return value;
    }
  } catch {
    // Fall through to localStorage
  }

  // Fallback to localStorage
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Compress an image to WebP format using canvas.
 * Reduces base64 image size by 3-5x compared to PNG/JPEG.
 *
 * @param {string} dataUrl - Base64 data URL (data:image/png;base64,...)
 * @param {{ maxWidth?: number, maxHeight?: number, quality?: number }} options
 * @returns {Promise<string>} Compressed WebP data URL
 */
async function compressImageToWebP(dataUrl, { maxWidth = 1280, maxHeight = 1280, quality = 0.75 } = {}) {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image")) {
    return dataUrl;
  }

  // Check if canvas/WebP is supported
  if (typeof document === "undefined" || typeof HTMLCanvasElement === "undefined") {
    return dataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.width;
        let h = img.height;

        // Scale down if needed
        if (w > maxWidth || h > maxHeight) {
          const scale = Math.min(maxWidth / w, maxHeight / h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);

        // Try WebP first, fallback to JPEG
        let result = canvas.toDataURL("image/webp", quality);
        if (!result.startsWith("data:image/webp")) {
          // WebP not supported, use JPEG
          result = canvas.toDataURL("image/jpeg", quality);
        }

        // Only use compressed version if it's actually smaller
        if (result.length < dataUrl.length) {
          resolve(result);
        } else {
          resolve(dataUrl);
        }
      } catch {
        resolve(dataUrl); // On any error, return original
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export const idbStorage = {
  get,
  set,
  del,
  isAvailable,
  migrateFromLocalStorage,
  saveWithFallback,
  loadWithFallback,
  compressImageToWebP,
};
