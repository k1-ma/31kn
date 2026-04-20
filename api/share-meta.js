import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Pool } = pg;

// Bot User-Agent patterns
const BOT_PATTERNS = [
  "Telegrambot",
  "Twitterbot",
  "facebookexternalhit",
  "LinkedInBot",
  "Discordbot",
  "Slackbot",
  "WhatsApp",
  "Viber",
  "Googlebot",
  "bingbot",
  "yandex",
];

const BOT_REGEX = new RegExp(BOT_PATTERNS.join("|"), "i");

// Reuse pool across invocations
function getPool() {
  if (globalThis.__share_meta_pool) return globalThis.__share_meta_pool;
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (!url) return null;
  const isLocal = /localhost|127\.0\.0\.1/i.test(url);
  const sslDisabled = String(process.env.PGSSL_DISABLE || "").trim() === "1";
  const ssl = !isLocal && !sslDisabled ? { rejectUnauthorized: false } : false;
  globalThis.__share_meta_pool = new Pool({
    connectionString: url,
    max: 2,
    ssl,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
  return globalThis.__share_meta_pool;
}

async function fetchShare(id) {
  const pool = getPool();
  if (!pool) return null;
  try {
    const result = await pool.query(
      `SELECT s.id, s.type, s.payload, s.title, s.author_name,
              u.display_name, u.nickname, u.username
       FROM public_shares s
       LEFT JOIN users u ON s.user_id = u.id
       WHERE s.id = $1
         AND (s.revoked IS NULL OR s.revoked = false)
         AND (s.expires_at IS NULL OR s.expires_at > NOW())`,
      [id]
    );
    return result.rows[0] || null;
  } catch (err) {
    console.error("[share-meta] db error:", err?.message);
    return null;
  }
}

function resolveAuthor(share) {
  return (
    share.display_name ||
    share.nickname ||
    share.username ||
    share.author_name ||
    "Trader"
  );
}

// ── Meta tag generation ──

function buildTradeMeta(payload, author) {
  const trades = payload?.trades || [];
  const count = trades.length;

  if (count === 1) {
    const t = trades[0];
    const symbol = t.symbol || t.pair || "Trade";
    const direction = t.direction || "";
    const pnl = t.pnl != null ? `PnL: ${Number(t.pnl) >= 0 ? "+" : ""}${Number(t.pnl).toFixed(2)}` : "";
    const account = t.account || "";
    const descParts = [pnl, account, "Shared via Haunted Dev"].filter(Boolean);
    return {
      title: `${symbol} ${direction} — by ${author}`,
      description: descParts.join(" · "),
    };
  }

  return {
    title: `${count || ""} Trades Shared — by ${author}`,
    description: "Trading journal entries shared via Haunted Dev",
  };
}

function buildDocMeta(payload, author) {
  const doc = payload?.document || {};
  const title = doc.title || payload?.title || "Document";
  const docType = doc.type || "Note";
  const text = doc.contentText || doc.content_text || "";
  const preview = text.length > 120 ? text.slice(0, 120) + "…" : text;
  const descParts = [docType, preview].filter(Boolean);
  return {
    title: `${title} — by ${author}`,
    description: descParts.join(": "),
  };
}

function buildIdeaMeta(payload, author) {
  const idea = payload?.idea || {};
  const pair = idea.pair || "Idea";
  const direction = idea.direction || "";
  const status = idea.status || "Planned";
  const result = idea.result || "Unknown";
  const ideaTitle = idea.title || "";
  return {
    title: `${pair} ${direction} Idea — by ${author}`,
    description: `Status: ${status} · ${result} · ${ideaTitle}`,
  };
}

function buildBacktestMeta(payload, author) {
  const name = payload?.name || payload?.backtest?.name || "Backtest";
  return {
    title: `${name} — Backtest by ${author}`,
    description: "Backtest results shared via Haunted Dev",
  };
}

function detectTypeFromPath(pathname) {
  if (pathname.startsWith("/share-doc/")) return "doc";
  if (pathname.startsWith("/share-idea/")) return "idea";
  if (pathname.startsWith("/share-backtest/")) return "backtest";
  if (pathname.startsWith("/share/")) return "trade";
  return null;
}

function extractIdFromPath(pathname) {
  const parts = pathname.split("/");
  return parts[parts.length - 1] || null;
}

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function buildMetaHtml({ title, description, imageUrl, pageUrl }) {
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const safeImage = escapeHtml(imageUrl);
  const safeUrl = escapeHtml(pageUrl);

  return `<!DOCTYPE html>
<html lang="ru" prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle} — Haunted Dev</title>
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDesc}" />
  <meta property="og:image" content="${safeImage}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:alt" content="${safeTitle}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${safeUrl}" />
  <meta property="og:site_name" content="Haunted Dev" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDesc}" />
  <meta name="twitter:image" content="${safeImage}" />
  <meta name="theme-color" content="#3B82F6" />
  <link rel="image_src" href="${safeImage}" />
  <meta http-equiv="refresh" content="0;url=${safeUrl}" />
</head>
<body>
  <p>Redirecting…</p>
</body>
</html>`;
}

// Cache index.html content on cold start
let indexHtmlCache = null;

function getIndexHtml() {
  if (indexHtmlCache) return indexHtmlCache;
  try {
    // In Vercel builds, the output index.html is at the project root or dist
    const candidates = [
      resolve(process.cwd(), "dist", "index.html"),
      resolve(process.cwd(), "index.html"),
    ];
    for (const p of candidates) {
      try {
        indexHtmlCache = readFileSync(p, "utf-8");
        return indexHtmlCache;
      } catch {
        // try next
      }
    }
  } catch {
    // fallback
  }
  return null;
}

// Map share type to public-facing URL path prefix
const TYPE_PATH_MAP = {
  trade: "/share/",
  doc: "/share-doc/",
  idea: "/share-idea/",
  backtest: "/share-backtest/",
};

function resolvePublicUrl(origin, type, shareId) {
  const prefix = TYPE_PATH_MAP[type] || "/share/";
  return `${origin}${prefix}${shareId}`;
}

export default async function handler(req, res) {
  try {
    // Vercel rewrites pass named params (:id) and explicit query params (?type=...) via req.query.
    // Fallback to URL path parsing for local dev where Vercel rewrites are not active.
    const pathname = req.url?.split("?")[0] || "";
    const type = req.query?.type || detectTypeFromPath(pathname);
    const shareId = req.query?.id || extractIdFromPath(pathname);

    const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
    const proto = req.headers["x-forwarded-proto"] || "https";
    const origin = `${proto}://${host}`;

    const ua = req.headers["user-agent"] || "";
    const isBot = BOT_REGEX.test(ua);

    const imageUrl = `${origin}/api/og-image?type=${encodeURIComponent(type || "trade")}&id=${encodeURIComponent(shareId || "")}`;
    const pageUrl = resolvePublicUrl(origin, type, shareId || "");

    // For regular users, serve the SPA with OG meta injected into index.html
    if (!isBot) {
      const html = getIndexHtml();
      if (html && type && shareId) {
        const share = await fetchShare(shareId);
        if (share) {
          const author = resolveAuthor(share);
          const payload = share.payload || {};
          let meta;
          switch (type) {
            case "trade": meta = buildTradeMeta(payload, author); break;
            case "doc": meta = buildDocMeta(payload, author); break;
            case "idea": meta = buildIdeaMeta(payload, author); break;
            case "backtest": meta = buildBacktestMeta(payload, author); break;
            default: meta = { title: "Haunted Dev — Trading Journal", description: "Trading journal shared via Haunted Dev" };
          }
          const title = escapeHtml(meta.title);
          const desc = escapeHtml(meta.description);
          const image = escapeHtml(imageUrl);
          const url = escapeHtml(pageUrl);
          const ogTags = `
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${desc}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:alt" content="${title}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${url}" />
    <meta property="og:site_name" content="Haunted Dev" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${desc}" />
    <meta name="twitter:image" content="${image}" />
    <link rel="image_src" href="${image}" />`;
          let injected = html.replace(/<title>[^<]*<\/title>/, `<title>${title} — Haunted Dev</title>`);
          injected = injected.replace(/<meta name="description"[^>]*\/?>/, `<meta name="description" content="${desc}" />`);
          injected = injected.replace("</head>", `${ogTags}\n</head>`);
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
          return res.status(200).end(injected);
        }
      }
      if (html) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(200).end(html);
      }
      return res.redirect(307, (type && shareId) ? pageUrl : "/");
    }

    // Bot detected — generate OG meta tags

    // Fallback meta
    const fallback = {
      title: "Haunted Dev — Trading Journal",
      description: "Trading journal shared via Haunted Dev",
      imageUrl,
      pageUrl,
    };

    if (!type || !shareId) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
      return res.status(200).end(buildMetaHtml(fallback));
    }

    const share = await fetchShare(shareId);
    if (!share) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
      return res.status(200).end(buildMetaHtml(fallback));
    }

    const author = resolveAuthor(share);
    const payload = share.payload || {};
    let meta;

    switch (type) {
      case "trade":
        meta = buildTradeMeta(payload, author);
        break;
      case "doc":
        meta = buildDocMeta(payload, author);
        break;
      case "idea":
        meta = buildIdeaMeta(payload, author);
        break;
      case "backtest":
        meta = buildBacktestMeta(payload, author);
        break;
      default:
        meta = { title: fallback.title, description: fallback.description };
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
    return res.status(200).end(
      buildMetaHtml({
        title: meta.title,
        description: meta.description,
        imageUrl,
        pageUrl,
      })
    );
  } catch (err) {
    console.error("[share-meta] error:", err);
    // On error, try to serve index.html for graceful degradation
    const html = getIndexHtml();
    if (html) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).end(html);
    }
    return res.status(500).end("Internal Server Error");
  }
}
