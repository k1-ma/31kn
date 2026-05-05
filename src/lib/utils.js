export const uid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;

export const clampNum = (n) => {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
};

export const isoDate = (d = new Date()) => {
  const z = new Date(d);
  const y = z.getFullYear();
  const m = String(z.getMonth() + 1).padStart(2, "0");
  const day = String(z.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const fmtMoney = (n, currency="$") => {
  const x = Number(n);
  if (!Number.isFinite(x)) return `${currency}0.00`;
  const sign = x < 0 ? "-" : "";
  return `${sign}${currency}${Math.abs(x).toFixed(2)}`;
};

export const fmtPct = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0%";
  return `${x.toFixed(1)}%`;
};

/**
 * Format PNL value based on display mode.
 * "money" mode: shows currency amount ($123.45)
 * "percent" mode: shows percentage of starting equity (2.5%)
 */
export const fmtPnl = (n, currency = "$", mode = "money", startingEquity = 0) => {
  if (mode === "percent" && startingEquity > 0) {
    const pct = (Number(n) / startingEquity) * 100;
    return fmtPct(pct);
  }
  return fmtMoney(n, currency);
};

export const fmtRR = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0.00R";
  // Do not force a leading "+" for positive values.
  return `${x.toFixed(2)}R`;
};

export const sessionTone = (name="") => {
  const s = String(name).toLowerCase();
  if (s.includes("london")) return "green";
  if (s.includes("new york") || s === "ny" || s.includes("ny")) return "orange";
  if (s.includes("frankfurt")) return "purple";
  if (s.includes("asia")) return "blue";
  return "neutral";
};

/**
 * Safe date formatting helper - prevents crashes from invalid dates
 * @param {string|number|Date|null|undefined} value - Date value to format
 * @param {string} locale - Locale for formatting (default: "en")
 * @returns {string} - Formatted date string or "—" if invalid
 */
export const safeFormatDate = (value, locale = "en") => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(locale, { month: "long", day: "numeric", year: "numeric" });
};


// ─────────────────────────────────────────────────────────────────────────────
// Numeric input utilities for flexible text-based number entry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sanitize numeric input string - allows intermediate states during typing.
 * Permits: digits, one decimal separator (. or ,), leading +/- sign.
 * @param {string} str - Raw input string
 * @param {object} opts - Options: { allowSign: true, allowDecimal: true }
 * @returns {string} - Sanitized string suitable for controlled input value
 */
export const sanitizeNumericInput = (str, opts = {}) => {
  const { allowSign = true, allowDecimal = true } = opts;
  let s = String(str ?? "");
  
  // Replace comma with dot for decimal
  s = s.replace(/,/g, ".");
  
  // Build allowed pattern
  let result = "";
  let hasDecimal = false;
  let hasSign = false;
  
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    
    // Allow leading sign
    if (allowSign && (ch === "+" || ch === "-") && i === 0 && !hasSign) {
      hasSign = true;
      result += ch;
      continue;
    }
    
    // Allow digits
    if (ch >= "0" && ch <= "9") {
      result += ch;
      continue;
    }
    
    // Allow one decimal point
    if (allowDecimal && ch === "." && !hasDecimal) {
      hasDecimal = true;
      result += ch;
      continue;
    }
  }
  
  return result;
};

// Safe magnitude ceiling for trading-domain numeric inputs. JS Number can
// represent up to ~1.8e308, but any value above MAX_SAFE_INTEGER stops being
// representable as a precise integer and breaks chart axes / sums / sorts.
// Cap at ±9e15 (Number.MAX_SAFE_INTEGER) so a stray "1e308" pasted into a
// PnL field returns null instead of poisoning every downstream calculation.
const NUMERIC_INPUT_LIMIT = Number.MAX_SAFE_INTEGER;

/**
 * Parse a string to a number, returning null for empty/invalid/sign-only strings.
 * Treats comma as decimal separator. Rejects magnitudes above ~9e15.
 * @param {string|number} str - Input value
 * @returns {number|null} - Parsed number or null
 */
export const parseNullableNumber = (str) => {
  if (str === null || str === undefined) return null;

  // If already a number, return it directly (unless NaN/Infinity/out-of-range)
  if (typeof str === "number") {
    if (!Number.isFinite(str)) return null;
    if (Math.abs(str) > NUMERIC_INPUT_LIMIT) return null;
    return str;
  }

  let s = String(str).trim();
  if (s === "") return null;

  // Replace comma with dot
  s = s.replace(/,/g, ".");

  // Check for sign-only strings like "+", "-", "+.", "-."
  const signOnly = /^[+-]\.?$/.test(s);
  if (signOnly) return null;

  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  if (Math.abs(n) > NUMERIC_INPUT_LIMIT) return null;
  return n;
};

/**
 * Get the sign of a string value for handling signed zeros (+0, -0).
 * Returns "+", "-", or null.
 * @param {string} str - Input string
 * @returns {"+"|"-"|null}
 */
export const getInputSign = (str) => {
  const s = String(str ?? "").trim();
  if (s.startsWith("+")) return "+";
  if (s.startsWith("-")) return "-";
  return null;
};

/**
 * Format a number as money, supporting signed zero display.
 * @param {number} n - The number value
 * @param {string} currency - Currency symbol (default "$")
 * @param {string|null} inputSign - Original input sign for preserving +0/-0 display
 * @returns {string} - Formatted money string
 */
export const fmtMoneyWithSign = (n, currency = "$", inputSign = null) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return `${currency}0.00`;
  
  // Handle signed zeros
  if (x === 0 && inputSign === "-") {
    return `-${currency}0.00`;
  }
  if (x === 0 && inputSign === "+") {
    return `+${currency}0.00`;
  }
  
  // Check for negative zero using Object.is
  if (Object.is(x, -0)) {
    return `-${currency}0.00`;
  }
  
  const sign = x < 0 ? "-" : "";
  return `${sign}${currency}${Math.abs(x).toFixed(2)}`;
};

// Resize/compress an uploaded image before storing in localStorage.
// Prevents hitting the ~5MB localStorage quota when users upload large avatars.
// Returns a dataURL string.
export const resizeImageFileToDataUrl = (file, opts = {}) =>
  new Promise((resolve, reject) => {
    try {
      const maxSize = Number(opts.maxSize ?? 160);
      const quality = Number(opts.quality ?? 0.82);
      // Optional upper bound on encoded payload size. When set, if the encoded
      // output exceeds maxBytes we re-encode at progressively lower quality
      // (down to minQuality) before giving up. Protects state-sync from
      // runaway sizes when callers raise default quality/maxSize.
      const maxBytes = Number(opts.maxBytes ?? 0);
      const minQuality = Number(opts.minQuality ?? 0.78);

      if (!file) return resolve("");
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error("File read failed"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Image decode failed"));
        img.onload = () => {
          const w = img.naturalWidth || img.width || 0;
          const h = img.naturalHeight || img.height || 0;
          if (!w || !h) return resolve(String(reader.result || ""));

          const scale = Math.min(1, maxSize / Math.max(w, h));
          const tw = Math.max(1, Math.round(w * scale));
          const th = Math.max(1, Math.round(h * scale));

          // Use step-down resizing for large downscales (>2×) to preserve quality.
          // Progressively halving dimensions produces much sharper results than
          // a single large resize, because the browser's bilinear interpolation
          // works best at ≤2× reduction ratios.
          let source = img;
          let sw = w;
          let sh = h;

          while (sw > tw * 2 || sh > th * 2) {
            const nw = Math.max(tw, Math.round(sw / 2));
            const nh = Math.max(th, Math.round(sh / 2));
            const sc = document.createElement("canvas");
            sc.width = nw;
            sc.height = nh;
            const sctx = sc.getContext("2d", { alpha: true });
            if (!sctx) break;
            sctx.imageSmoothingEnabled = true;
            sctx.imageSmoothingQuality = "high";
            sctx.drawImage(source, 0, 0, nw, nh);
            source = sc;
            sw = nw;
            sh = nh;
          }

          const canvas = document.createElement("canvas");
          canvas.width = tw;
          canvas.height = th;
          const ctx = canvas.getContext("2d", { alpha: true });
          if (!ctx) return resolve(String(reader.result || ""));

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(source, 0, 0, tw, th);

          // Output format: caller can request "jpeg" or "webp"; default is "webp".
          // Fall back to png when the requested format is unsupported by the browser.
          const fmt = opts.format === "jpeg" ? "image/jpeg" : "image/webp";
          const encode = (q) => {
            try {
              const r = canvas.toDataURL(fmt, q);
              // Some browsers may return 'data:,' on unsupported mime.
              if (!r || r.startsWith("data:,")) throw new Error(`${fmt} unsupported`);
              return r;
            } catch {
              return canvas.toDataURL("image/png");
            }
          };
          const approxBytes = (s) => {
            if (!s) return 0;
            const i = s.indexOf(",");
            const body = i >= 0 ? s.length - i - 1 : s.length;
            return Math.floor((body * 3) / 4);
          };

          let out = encode(quality);
          if (maxBytes > 0 && approxBytes(out) > maxBytes && quality > minQuality) {
            for (let q = quality - 0.07; q >= minQuality - 1e-6; q -= 0.07) {
              const clamped = Math.max(minQuality, Number(q.toFixed(2)));
              const next = encode(clamped);
              out = next;
              if (approxBytes(next) <= maxBytes) break;
            }
          }
          resolve(out);
        };
        img.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    } catch (e) {
      reject(e);
    }
  });

/**
 * Format a date/time in UTC+2 timezone for admin panel display.
 * Applies a fixed 2-hour offset from UTC (does not account for DST).
 * @param {string|number|Date|null|undefined} value - Date value to format
 * @param {object} opts - Options: { dateOnly: false, timeOnly: false }
 * @returns {string} - Formatted date string in UTC+2 or "—" if invalid
 */
export const formatDateTimeUTC2 = (value, opts = {}) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  
  const { dateOnly = false, timeOnly = false } = opts;
  
  // Apply fixed UTC+2 offset (2 hours in milliseconds)
  const utc2Offset = 2 * 60 * 60 * 1000;
  const utc2Date = new Date(d.getTime() + utc2Offset);
  
  // Format manually to ensure UTC+2
  const year = utc2Date.getUTCFullYear();
  const month = String(utc2Date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utc2Date.getUTCDate()).padStart(2, "0");
  const hours = String(utc2Date.getUTCHours()).padStart(2, "0");
  const minutes = String(utc2Date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(utc2Date.getUTCSeconds()).padStart(2, "0");
  
  if (dateOnly) {
    return `${day}.${month}.${year}`;
  }
  if (timeOnly) {
    return `${hours}:${minutes}:${seconds}`;
  }
  return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
};


/**
 * Parse linked trade IDs from various formats
 * Handles snake_case (from server), camelCase (from client), 
 * and legacy single linkedTradeId field
 * @param {Object} obj - Object containing linked trade IDs in various formats
 * @returns {string[]} - Array of trade IDs as strings
 */
export function parseLinkedTradeIds(obj) {
  if (!obj) return [];
  
  // Check for array formats
  if (Array.isArray(obj.linked_trade_ids)) {
    return obj.linked_trade_ids.map(String).filter(Boolean);
  }
  if (typeof obj.linked_trade_ids === "string") {
    try {
      const parsed = JSON.parse(obj.linked_trade_ids);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch { /* ignore */ }
  }
  if (Array.isArray(obj.linkedTradeIds)) {
    return obj.linkedTradeIds.map(String).filter(Boolean);
  }
  
  // Legacy: single linkedTradeId
  if (obj.linkedTradeId) {
    return [String(obj.linkedTradeId)];
  }
  if (obj.linked_trade_id) {
    return [String(obj.linked_trade_id)];
  }
  
  return [];
}
