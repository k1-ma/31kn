/**
 * Share bundles for publicly sharing selected trades.
 * Uses server-side API for persistence (shares are publicly accessible).
 * Supports chunked upload for large payloads that exceed Vercel's body size limit.
 */

import { isDeleted } from "@/lib/syncDb.js";

// ─────────────────────────────────────────────────────────────────────────────
// API-BASED PUBLIC SHARING FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

// Max size for a single request payload (3MB to stay under Vercel's ~4.5MB body limit)
const SINGLE_REQUEST_THRESHOLD = 3 * 1024 * 1024;
// Chunk size for chunked upload (3MB per chunk data)
const CHUNK_SIZE = 3 * 1024 * 1024;

/**
 * Create a public share via API (server-side).
 * Automatically uses chunked upload if the payload is too large for a single request.
 * @param {Object} options - { type: 'trade'|'doc'|'idea', payload: Object, title?: string, expiresAt?: string }
 * @returns {Promise<{ shareId: string, url: string }>}
 */
export async function createPublicShare({ type, payload, title, expiresAt }) {
  const payloadStr = JSON.stringify(payload);

  // If payload fits in a single request, use the simple path
  if (payloadStr.length <= SINGLE_REQUEST_THRESHOLD) {
    return createPublicShareSingle({ type, payload, title, expiresAt });
  }

  // Large payload — use chunked upload
  return createPublicShareChunked({ type, payloadStr, title, expiresAt });
}

/**
 * Single-request share creation (for small payloads)
 */
async function createPublicShareSingle({ type, payload, title, expiresAt }) {
  const response = await fetch("/api/public-share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ type, payload, title, expiresAt }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 413) {
      throw new Error("Share content is too large. Try sharing fewer items or excluding documents and ideas.");
    }
    throw new Error(errorData.error || `Failed to create share: ${response.status}`);
  }

  return response.json();
}

/**
 * Chunked share creation (for large payloads that exceed Vercel's body size limit)
 * Splits the serialized JSON into chunks and uploads them sequentially.
 */
async function createPublicShareChunked({ type, payloadStr, title, expiresAt }) {
  // Split payload string into chunks
  const chunks = [];
  for (let i = 0; i < payloadStr.length; i += CHUNK_SIZE) {
    chunks.push(payloadStr.slice(i, i + CHUNK_SIZE));
  }

  let shareId = null;

  try {
    // Step 1: Initialize share with first chunk
    const initResponse = await fetch("/api/public-share/chunked/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        type,
        title: title || null,
        expiresAt: expiresAt || null,
        totalChunks: chunks.length,
        chunkData: chunks[0],
      }),
    });

    if (!initResponse.ok) {
      const errorData = await initResponse.json().catch(() => ({}));
      if (initResponse.status === 413) {
        throw new Error("Share content is too large. Try sharing fewer items or excluding documents and ideas.");
      }
      throw new Error(errorData.error || `Failed to initialize share: ${initResponse.status}`);
    }

    const initResult = await initResponse.json();
    shareId = initResult.shareId;

    // Step 2: Upload remaining chunks
    for (let i = 1; i < chunks.length; i++) {
      const isLast = i === chunks.length - 1;
      const chunkResponse = await fetch(`/api/public-share/chunked/${shareId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          chunkIndex: i,
          chunkData: chunks[i],
          isLast,
        }),
      });

      if (!chunkResponse.ok) {
        const errorData = await chunkResponse.json().catch(() => ({}));
        if (chunkResponse.status === 413) {
          throw new Error("Share content is too large. Try sharing fewer items or excluding documents and ideas.");
        }
        throw new Error(errorData.error || `Failed to upload chunk ${i + 1}/${chunks.length}: ${chunkResponse.status}`);
      }

      // If this was the last chunk, the response contains the share URL
      if (isLast) {
        const result = await chunkResponse.json();
        return { shareId: result.shareId, url: result.url };
      }
    }

    // Should not reach here, but just in case (single chunk that somehow went chunked path)
    // Determine URL based on type
    const urlPaths = { trade: "share", doc: "share-doc", idea: "share-idea", backtest: "share-backtest" };
    const pathSegment = urlPaths[type] || "share";
    return { shareId, url: `/${pathSegment}/${shareId}` };
  } catch (error) {
    // BUG #8 FIX: Abort the pending share on the server to prevent orphaned rows.
    // Without this, failed chunked uploads pile up as "pending" rows + chunks in the DB.
    if (shareId) {
      try {
        await fetch(`/api/public-share/chunked/${shareId}/abort`, {
          method: "DELETE",
          credentials: "include",
        });
      } catch {
        // Best-effort cleanup — server-side TTL will catch it eventually
      }
    }
    throw error;
  }
}

/**
 * Helper to create a share with automatic error handling and toast notifications
 * @param {Object} options
 * @param {string} options.type - 'trade'|'doc'|'idea'
 * @param {Object} options.payload - The sanitized payload to share
 * @param {string} [options.title] - Optional title for the share
 * @param {Function} options.getUrl - Function to get the share URL from shareId
 * @param {Object} [options.toast] - Toast notification object with push method
 * @returns {Promise<string|null>} - The share URL or null on error
 */
export async function createShareWithToast({ type, payload, title, getUrl, toast }) {
  try {
    const result = await createPublicShare({ type, payload, title });
    const url = getUrl(result.shareId);
    return url;
  } catch (err) {
    console.error("Failed to create share:", err);
    toast?.push?.({ 
      title: "Error", 
      description: err.message || "Failed to create share link", 
      tone: "error" 
    });
    return null;
  }
}

/**
 * Fetch a public share by ID from API
 * @param {string} shareId - The share ID
 * @returns {Promise<Object|null>} - The share data or null if not found
 */
export async function fetchPublicShare(shareId) {
  if (!shareId) return null;

  const response = await fetch(`/api/public-share/${shareId}`, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Failed to fetch share: ${response.status}`);
  }

  return response.json();
}

/**
 * Delete/revoke a public share via API
 * @param {string} shareId - The share ID
 * @returns {Promise<{ ok: boolean, message?: string }>}
 */
export async function deletePublicShare(shareId) {
  const response = await fetch(`/api/public-share/${shareId}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to delete share: ${response.status}`);
  }

  return response.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE COMPRESSION FOR SHARE PAYLOADS
// ─────────────────────────────────────────────────────────────────────────────

// Max image dimension for share payloads (pixels)
const SHARE_IMAGE_MAX_SINGLE = 1200;
const SHARE_IMAGE_MAX_MULTI = 800;
// JPEG quality for share payloads
const SHARE_IMAGE_QUALITY_SINGLE = 0.75;
const SHARE_IMAGE_QUALITY_MULTI = 0.65;
// Max images per trade in multi-trade shares
const SHARE_MAX_IMAGES_PER_TRADE_MULTI = 3;
// Max images per idea in multi-trade shares
const SHARE_MAX_IMAGES_PER_IDEA_MULTI = 1;

/**
 * Resize a data URL image to smaller dimensions using canvas.
 * Returns the original string if not a valid image data URL or if in a non-browser environment.
 * @param {string} dataUrl - Base64 data URL string
 * @param {number} maxSize - Max dimension in pixels
 * @param {number} quality - JPEG quality 0-1
 * @returns {Promise<string>} - Compressed data URL
 */
export function resizeDataUrl(dataUrl, maxSize = SHARE_IMAGE_MAX_SINGLE, quality = SHARE_IMAGE_QUALITY_SINGLE) {
  return new Promise((resolve) => {
    // Skip non-image or empty data URLs
    if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image")) {
      return resolve(dataUrl || "");
    }
    // Skip if no browser canvas available (e.g., Node.js tests)
    if (typeof document === "undefined" || typeof Image === "undefined") {
      return resolve(dataUrl);
    }
    const img = new Image();
    img.onerror = () => resolve(dataUrl); // fallback to original on error
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        if (!w || !h) return resolve(dataUrl);

        const maxDim = Math.max(w, h);
        const scale = Math.min(1, maxSize / maxDim);
        const tw = Math.max(1, Math.round(w * scale));
        const th = Math.max(1, Math.round(h * scale));

        // Step-down resize for large downscales (>2×) to preserve sharpness
        let source = img;
        let sw = w;
        let sh = h;

        while (sw > tw * 2 || sh > th * 2) {
          const nw = Math.max(tw, Math.round(sw / 2));
          const nh = Math.max(th, Math.round(sh / 2));
          const sc = document.createElement("canvas");
          sc.width = nw;
          sc.height = nh;
          const sctx = sc.getContext("2d");
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
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(dataUrl);

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(source, 0, 0, tw, th);

        let result = "";
        try {
          result = canvas.toDataURL("image/jpeg", quality);
          if (!result || result === "data:,") throw new Error("Canvas JPEG encoding failed");
        } catch {
          result = canvas.toDataURL("image/png");
        }
        resolve(result || dataUrl);
      } catch {
        resolve(dataUrl);
      }
    };
    img.src = dataUrl;
  });
}

/**
 * Compress all images in a share payload to reduce total size.
 * Processes trade images and linked idea images.
 * @param {Object} payload - The share payload { trades: [...], ... }
 * @param {boolean} isMultiTrade - Whether this is a multi-trade share (more aggressive compression)
 * @returns {Promise<Object>} - Payload with compressed images
 */
export async function compressSharePayload(payload, isMultiTrade = false) {
  if (!payload || !Array.isArray(payload.trades)) return payload;

  const maxSize = isMultiTrade ? SHARE_IMAGE_MAX_MULTI : SHARE_IMAGE_MAX_SINGLE;
  const quality = isMultiTrade ? SHARE_IMAGE_QUALITY_MULTI : SHARE_IMAGE_QUALITY_SINGLE;
  const maxImagesPerTrade = isMultiTrade ? SHARE_MAX_IMAGES_PER_TRADE_MULTI : Infinity;
  const maxImagesPerIdea = isMultiTrade ? SHARE_MAX_IMAGES_PER_IDEA_MULTI : Infinity;

  const compressedTrades = await Promise.all(
    payload.trades.map(async (trade) => {
      // Compress trade images (limit count for multi-trade)
      const tradeImages = (trade.images || []).slice(0, maxImagesPerTrade);
      const compressedImages = await Promise.all(
        tradeImages.map(async (img) => ({
          ...img,
          dataUrl: await resizeDataUrl(img.dataUrl, maxSize, quality),
        }))
      );

      // Compress linked idea images
      const compressedIdeas = await Promise.all(
        (trade.linkedIdeas || []).map(async (idea) => {
          const ideaImages = (idea.images || []).slice(0, maxImagesPerIdea);
          const compressedIdeaImages = await Promise.all(
            ideaImages.map(async (img) => ({
              ...img,
              dataUrl: await resizeDataUrl(img.dataUrl, maxSize, quality),
            }))
          );
          return { ...idea, images: compressedIdeaImages };
        })
      );

      return { ...trade, images: compressedImages, linkedIdeas: compressedIdeas };
    })
  );

  return { ...payload, trades: compressedTrades };
}

// ─────────────────────────────────────────────────────────────────────────────
// SANITIZE FUNCTIONS (exported for payload preparation)
// ─────────────────────────────────────────────────────────────────────────────

// Content preview length for linked documents (chars)
const CONTENT_PREVIEW_LENGTH = 200;

/**
 * Sanitize a trade for public viewing - remove sensitive/private data
 * @param {Object} trade - Original trade object
 * @param {Object} libraries - { symbols, sessions } lookup
 * @param {Object[]} accounts - Array of account objects
 * @param {Object[]} documents - Array of document objects (optional, for linked docs)
 * @param {Object[]} ideas - Array of trading idea objects (optional, for linked ideas)
 * @param {Object} shareOptions - { includeDocs: boolean, includeIdeas: boolean, isMultiTrade: boolean } - options for what to include
 * @returns {Object} - Sanitized trade for public view
 */
export function sanitizeTradeForPublic(trade, libraries, accounts, documents = [], ideas = [], shareOptions = {}) {
  const { includeDocs = true, includeIdeas = true, isMultiTrade = false } = shareOptions;
  if (!trade) return null;

  const sym = (libraries?.symbols || []).find((s) => s.id === trade.symbolId);
  const ses = (libraries?.sessions || []).find((s) => s.id === trade.sessionId);
  
  // Get allocations and account info (sanitized - no balance info)
  const allocs = Array.isArray(trade.allocations) ? trade.allocations : [];
  const allocsPublic = allocs.map((a) => {
    const acc = (accounts || []).find((x) => x.id === a.accountId);
    return {
      pnl: a.pnl ?? 0,
      rr: a.rr ?? 0,
      accountName: acc?.name || "Account",
      accountColor: acc?.color || null,
      accountAvatar: acc?.avatar || null,
    };
  });

  // Get linked documents (sanitized - basic info only) - only if includeDocs is true
  // When sharing multiple trades, exclude full HTML content to reduce payload size
  const linkedDocs = includeDocs ? (trade.docIds || [])
    .map(docId => {
      const doc = (documents || []).find(d => d.id === docId && !d.archivedAt);
      if (!doc) return null;
      return {
        id: doc.id,
        type: doc.type || "note",
        title: doc.title || "Untitled",
        contentText: (doc.contentText || "").slice(0, CONTENT_PREVIEW_LENGTH),
        // Only include full HTML for single trade shares to reduce payload size
        contentHtml: isMultiTrade ? null : (doc.contentHtml || null),
        createdAt: doc.createdAt || Date.now(),
      };
    })
    .filter(Boolean) : [];

  // Get linked trading ideas (sanitized - basic info only) - only if includeIdeas is true
  // When sharing multiple trades, limit data to reduce payload size
  const linkedIdeas = includeIdeas ? (trade.ideaIds || [])
    .map(ideaId => {
      const idea = (ideas || []).find(i => String(i.id) === String(ideaId));
      if (!idea) return null;
      return {
        id: idea.id,
        title: idea.title || "Untitled",
        pair: idea.pair || "",
        direction: idea.direction || "Long",
        timeframe: idea.timeframe || "",
        status: idea.status || "Planned",
        result: idea.result || "Unknown",
        notesText: (idea.notes_text || idea.notesText || "").slice(0, CONTENT_PREVIEW_LENGTH),
        // Only include full HTML for single trade shares to reduce payload size
        notesHtml: isMultiTrade ? null : (idea.notes_html || idea.notesHtml || null),
        tags: idea.tags || [],
        links: Array.isArray(idea.links) ? idea.links.map(l => ({
          label: l.label || "",
          url: l.url || "",
          kind: l.kind || "other",
        })) : [],
        // Idea images (public)
        images: Array.isArray(idea.images) ? idea.images.map(i => ({
          title: i.title || "",
          dataUrl: i.dataUrl || "",
        })) : [],
        createdAt: idea.created_at || idea.createdAt || Date.now(),
      };
    })
    .filter(Boolean) : [];

  return {
    id: trade.id,
    date: trade.date || "",
    direction: trade.direction || "",
    outcome: trade.outcome || "",
    pnl: trade.pnl ?? 0,
    rr: trade.rr ?? 0,
    // Symbol info (sanitized)
    symbolName: sym?.name || "—",
    symbolColor: sym?.color || null,
    symbolAvatar: sym?.avatar || null,
    // Session info (sanitized)
    sessionName: ses?.name || "—",
    // Notes (public)
    notes: trade.notes || "",
    positionNotes: trade.positionNotes || "",
    comments: trade.comments || "",
    journal: trade.journal || "",
    // Flags
    followPlan: !!trade.followPlan,
    bestTrade: !!trade.bestTrade,
    // Links (public)
    links: Array.isArray(trade.links) ? trade.links.map((l) => ({ title: l.title || "", url: l.url || "" })) : [],
    // Images (public)
    images: Array.isArray(trade.images) ? trade.images.map((i) => ({ title: i.title || "", dataUrl: i.dataUrl || "" })) : [],
    // Allocations (sanitized)
    allocations: allocsPublic,
    // Linked documents (sanitized)
    linkedDocuments: linkedDocs,
    // Linked trading ideas (sanitized)
    linkedIdeas: linkedIdeas,
  };
}

/**
 * Sanitize a document for public viewing
 * @param {Object} doc - Original document object
 * @param {Object[]} trades - Trades array for stats calculation and linked trade data
 * @param {Object} libraries - { symbols, sessions } for trade name lookups (optional)
 * @returns {Object} - Sanitized document for public view
 */
export function sanitizeDocForPublic(doc, trades = [], libraries = {}) {
  if (!doc) return null;
  
  // Calculate stats from linked trades
  const linkedTrades = (trades || []).filter(t => 
    (doc.linkedTradeIds || []).includes(t.id) && !isDeleted(t)
  );
  
  let stats = null;
  if (linkedTrades.length > 0) {
    const wins = linkedTrades.filter(t => (t.pnl || 0) > 0).length;
    const netPnl = linkedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const followedPlan = linkedTrades.filter(t => t.followPlan).length;
    stats = {
      tradeCount: linkedTrades.length,
      winRate: Math.round((wins / linkedTrades.length) * 100),
      netPnl,
      adherence: Math.round((followedPlan / linkedTrades.length) * 100),
    };
  }

  // Build sanitized linked trades array with basic info for display
  const linkedTradesData = linkedTrades.map(t => {
    const sym = (libraries?.symbols || []).find(s => s.id === t.symbolId);
    return {
      id: t.id,
      date: t.date || "",
      direction: t.direction || "",
      outcome: t.outcome || "",
      pnl: t.pnl ?? 0,
      rr: t.rr ?? 0,
      symbolName: sym?.name || "—",
      symbolColor: sym?.color || null,
      followPlan: !!t.followPlan,
    };
  });
  
  return {
    id: doc.id,
    type: doc.type || "note",
    title: doc.title || "Untitled Document",
    content: doc.content || "",
    contentHtml: doc.contentHtml || null,
    contentText: doc.contentText || "",
    tags: doc.tags || [],
    links: Array.isArray(doc.links) ? doc.links.map(l => ({
      id: l.id,
      label: l.label || "",
      url: l.url || "",
      kind: l.kind || "other",
    })) : [],
    images: Array.isArray(doc.images) ? doc.images.map(i => ({
      id: i.id,
      title: i.title || "",
      dataUrl: i.dataUrl || "",
    })) : [],
    createdAt: doc.created_at || doc.createdAt || Date.now(),
    updatedAt: doc.updated_at || doc.updatedAt || null,
    status: doc.status || "draft",
    evaluation: doc.evaluation || { result: "unknown" },
    stats,
    // Include linked trades data for display in shared view
    linkedTrades: linkedTradesData,
  };
}

/**
 * Sanitize a trading idea for public viewing
 * @param {Object} idea - Original trading idea object
 * @param {Object[]} trades - Trades array for linked trade lookup
 * @param {Object} libraries - { symbols, sessions } for name lookups
 * @returns {Object} - Sanitized idea for public view
 */
export function sanitizeIdeaForPublic(idea, trades = [], libraries = {}) {
  if (!idea) return null;
  
  // Get linked trade IDs (support both single linkedTradeId and array linkedTradeIds)
  let linkedTradeIds = [];
  if (Array.isArray(idea.linked_trade_ids)) {
    linkedTradeIds = idea.linked_trade_ids;
  } else if (typeof idea.linked_trade_ids === 'string') {
    try { linkedTradeIds = JSON.parse(idea.linked_trade_ids); } catch { linkedTradeIds = []; }
  } else if (Array.isArray(idea.linkedTradeIds)) {
    linkedTradeIds = idea.linkedTradeIds;
  } else if (idea.linkedTradeId || idea.linked_trade_id) {
    // Legacy: single linkedTradeId -> convert to array
    linkedTradeIds = [idea.linkedTradeId || idea.linked_trade_id];
  }
  
  // Get linked trades details
  const linkedTrades = linkedTradeIds
    .map(tradeId => {
      const trade = trades.find(t => t.id === tradeId);
      if (!trade) return null;
      const sym = (libraries?.symbols || []).find(s => s.id === trade.symbolId);
      return {
        id: trade.id,
        date: trade.date || "",
        direction: trade.direction || "",
        outcome: trade.outcome || "",
        pnl: trade.pnl ?? 0,
        rr: trade.rr ?? 0,
        symbolName: sym?.name || "—",
        symbolColor: sym?.color || null,
        notes: trade.notes || "",
        links: Array.isArray(trade.links) ? trade.links.map(l => ({ title: l.title || "", url: l.url || "" })) : [],
        images: Array.isArray(trade.images) ? trade.images.map(i => ({ title: i.title || "", dataUrl: i.dataUrl || "" })) : [],
      };
    })
    .filter(Boolean);
  
  // Backward compatibility: linkedTrade for single trade
  const linkedTrade = linkedTrades.length > 0 ? linkedTrades[0] : null;
  
  return {
    id: idea.id,
    title: idea.title || "",
    pair: idea.pair || "",
    direction: idea.direction || "Long",
    timeframe: idea.timeframe || "",
    status: idea.status || "Planned",
    result: idea.result || "Unknown",
    notesHtml: idea.notes_html || idea.notesHtml || "",
    notesText: idea.notes_text || idea.notesText || "",
    tags: idea.tags || [],
    links: Array.isArray(idea.links) ? idea.links.map(l => ({
      id: l.id,
      label: l.label || "",
      url: l.url || "",
      kind: l.kind || "other",
    })) : [],
    images: Array.isArray(idea.images) ? idea.images.map(i => ({
      id: i.id,
      title: i.title || "",
      dataUrl: i.dataUrl || "",
    })) : [],
    createdAt: idea.created_at || idea.createdAt || Date.now(),
    resolvedAt: idea.resolved_at || idea.resolvedAt || null,
    linkedTrade, // Backward compatibility
    linkedTrades, // New: array of linked trades
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// URL GENERATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the full share URL for a given share ID (trades)
 * @param {string} shareId
 * @returns {string}
 */
export function getShareUrl(shareId) {
  const base = window.location.origin;
  return `${base}/share/${shareId}`;
}

/**
 * Get the full share URL for a document
 * @param {string} shareId
 * @returns {string}
 */
export function getDocShareUrl(shareId) {
  const base = window.location.origin;
  return `${base}/share-doc/${shareId}`;
}

/**
 * Get the full share URL for a trading idea
 * @param {string} shareId
 * @returns {string}
 */
export function getIdeaShareUrl(shareId) {
  const base = window.location.origin;
  return `${base}/share-idea/${shareId}`;
}

/**
 * Get the full share URL for a backtest
 * @param {string} shareId
 * @returns {string}
 */
export function getBacktestShareUrl(shareId) {
  const base = window.location.origin;
  return `${base}/share-backtest/${shareId}`;
}

/**
 * Sanitize a backtest for public sharing — remove sensitive/private data
 * @param {Object} backtest - Original backtest object
 * @param {Object} libraries - { symbols, sessions } lookup
 * @param {Object} shareOptions - { includeTrades: boolean, includeNotes: boolean }
 * @returns {Object} - Sanitized backtest for public view
 */
export function sanitizeBacktestForPublic(backtest, libraries = {}, shareOptions = {}) {
  if (!backtest) return null;
  const { includeTrades = true, includeNotes = true, includeImages = true } = shareOptions;

  // Sanitize trades (no docIds/ideaIds, limit images to prevent huge payloads)
  let trades = [];
  if (includeTrades) {
    const activeTrades = (backtest.trades || []).filter(t => !isDeleted(t));
    trades = activeTrades.map(trade => {
      const sym = (libraries?.symbols || []).find(s => s.id === trade.symbolId);
      const ses = (libraries?.sessions || []).find(s => s.id === trade.sessionId);
      const allocs = Array.isArray(trade.allocations) ? trade.allocations : [];
      return {
        id: trade.id,
        date: trade.date || "",
        direction: trade.direction || "",
        outcome: trade.outcome || "",
        pnl: trade.pnl ?? 0,
        rr: trade.rr ?? 0,
        symbolName: sym?.name || "—",
        symbolColor: sym?.color || null,
        sessionName: ses?.name || "—",
        notes: trade.notes || "",
        followPlan: !!trade.followPlan,
        bestTrade: !!trade.bestTrade,
        links: Array.isArray(trade.links) ? trade.links.map(l => ({ title: l.title || "", url: l.url || "" })) : [],
        images: includeImages && Array.isArray(trade.images) ? trade.images.map(i => ({ title: i.title || "", dataUrl: i.dataUrl || "" })) : [],
        allocations: allocs.map(a => ({
          pnl: a.pnl ?? 0,
          rr: a.rr ?? 0,
          // Backtest has a single account; use its name for all allocations
          accountName: backtest.account?.name || "Account",
        })),
      };
    });
  }

  return {
    name: backtest.name || "Untitled",
    period: backtest.period || { from: "", to: "" },
    symbols: backtest.symbols || [],
    timeframes: backtest.timeframes || [],
    initialEquity: backtest.initialEquity || 0,
    createdAt: backtest.createdAt || Date.now(),
    updatedAt: backtest.updatedAt || null,
    account: {
      name: backtest.account?.name || "Backtest Account",
      initialEquity: backtest.account?.initialEquity || backtest.initialEquity || 0,
    },
    notes: includeNotes ? { plan: backtest.notes?.plan || "", description: backtest.notes?.description || "" } : { plan: "", description: "" },
    trades,
    tradeCount: (backtest.trades || []).filter(t => !isDeleted(t)).length,
  };
}
