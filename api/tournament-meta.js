import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Pool } = pg;

const BOT_PATTERNS = [
  "Telegrambot", "Twitterbot", "facebookexternalhit", "LinkedInBot",
  "Discordbot", "Slackbot", "WhatsApp", "Viber", "Googlebot", "bingbot", "yandex",
];
const BOT_REGEX = new RegExp(BOT_PATTERNS.join("|"), "i");

function getPool() {
  if (globalThis.__tournament_meta_pool) return globalThis.__tournament_meta_pool;
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (!url) return null;
  const isLocal = /localhost|127\.0\.0\.1/i.test(url);
  const sslDisabled = String(process.env.PGSSL_DISABLE || "").trim() === "1";
  const ssl = !isLocal && !sslDisabled ? { rejectUnauthorized: false } : false;
  globalThis.__tournament_meta_pool = new Pool({
    connectionString: url,
    max: 2,
    ssl,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
  return globalThis.__tournament_meta_pool;
}

async function fetchTournament(slug) {
  const pool = getPool();
  if (!pool) return null;
  try {
    const result = await pool.query(
      `SELECT t.id, t.name, t.description, t.status, t.banner_image_url
       FROM tournament_public_links pl
       JOIN tournaments t ON t.id = pl.tournament_id
       WHERE pl.public_slug = $1
         AND pl.is_enabled = true`,
      [slug]
    );
    return result.rows[0] || null;
  } catch (err) {
    console.error("[tournament-meta] db error:", err?.message);
    return null;
  }
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
  <title>${safeTitle} | Haunted</title>
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDesc}" />
  <meta property="og:image" content="${safeImage}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:alt" content="${safeTitle}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${safeUrl}" />
  <meta property="og:site_name" content="Haunted" />
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

let indexHtmlCache = null;
function getIndexHtml() {
  if (indexHtmlCache) return indexHtmlCache;
  try {
    const candidates = [
      resolve(process.cwd(), "dist", "index.html"),
      resolve(process.cwd(), "index.html"),
    ];
    for (const p of candidates) {
      try {
        indexHtmlCache = readFileSync(p, "utf-8");
        return indexHtmlCache;
      } catch { /* try next */ }
    }
  } catch { /* fallback */ }
  return null;
}

function extractSlug(req) {
  // Vercel rewrites pass named params via query string
  if (req.query?.slug) return req.query.slug;
  // Fallback: parse from the original URL path
  const pathname = req.url?.split("?")[0] || "";
  const parts = pathname.split("/").filter(Boolean);
  // Match /tournament/<slug> or /tournament/<slug>/vote
  const idx = parts.indexOf("tournament");
  if (idx !== -1 && parts[idx + 1]) {
    const slug = parts[idx + 1];
    return slug === "vote" ? null : slug;
  }
  // Last segment as final fallback
  const last = parts[parts.length - 1];
  if (last && !last.includes(".") && last !== "vote") return last;
  return null;
}

function isVotePage(req) {
  // Vercel rewrites change req.url to /api/tournament-meta.js?..., so check query param first
  if (req.query?.vote === "1") return true;
  const pathname = (req.url || "").split("?")[0];
  return pathname.endsWith("/vote");
}

function extractDayToken(req) {
  // Vercel rewrites pass named params via query string
  if (req.query?.dayToken) return req.query.dayToken;
  // Fallback: parse from URL path
  // Pattern: /tournament/{slug}/vote/{dayToken}
  const pathname = (req.url || "").split("?")[0];
  const parts = pathname.split("/").filter(Boolean);
  const voteIdx = parts.indexOf("vote");
  if (voteIdx !== -1 && parts[voteIdx + 1]) {
    return parts[voteIdx + 1];
  }
  return null;
}

async function fetchVoteDay(slug, dayToken) {
  const pool = getPool();
  if (!pool) return null;
  try {
    const result = await pool.query(
      `SELECT t.name AS tournament_name, t.description AS tournament_description,
              d.title AS day_title, d.date_key,
              d.id AS day_id
       FROM tournament_public_links pl
       JOIN tournaments t ON t.id = pl.tournament_id
       JOIN tournament_vote_days d ON d.tournament_id = t.id AND d.vote_token = $2
       WHERE pl.public_slug = $1
         AND pl.is_enabled = true`,
      [slug, dayToken]
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];

    // Fetch assets for this day (static data — set at creation)
    const assetsRes = await pool.query(
      `SELECT asset_code, asset_name
       FROM tournament_vote_assets
       WHERE vote_day_id = $1 AND is_active = true
       ORDER BY sort_order ASC, id ASC`,
      [row.day_id]
    );

    return {
      tournament_name: row.tournament_name,
      tournament_description: row.tournament_description,
      day_title: row.day_title,
      date_key: row.date_key,
      assets: assetsRes.rows,
    };
  } catch (err) {
    console.error("[tournament-meta] vote day db error:", err?.message);
    return null;
  }
}

export default async function handler(req, res) {
  try {
    const ua = req.headers["user-agent"] || "";
    const isBot = BOT_REGEX.test(ua);

    const slug = extractSlug(req);
    const isVote = isVotePage(req);
    const dayToken = extractDayToken(req);

    const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
    const proto = req.headers["x-forwarded-proto"] || "https";
    const origin = `${proto}://${host}`;
    const pageUrl = dayToken
      ? `${origin}/tournament/${slug || ""}/vote/${dayToken}`
      : (isVote
        ? `${origin}/tournament/${slug || ""}/vote`
        : `${origin}/tournament/${slug || ""}`);

    // For regular users, serve the SPA with tournament-specific OG meta
    if (!isBot) {
      // Inject OG meta into index.html so link previews work in all clients
      const html = getIndexHtml();
      if (html && slug) {
        // Vote day with dayToken — specific vote day OG meta
        if (dayToken) {
          const voteDay = await fetchVoteDay(slug, dayToken);
          if (voteDay) {
            const dayLabel = voteDay.day_title || voteDay.date_key;
            const assetNames = voteDay.assets.map(a => a.asset_code).join(", ");
            const titleText = `🗳️ ${dayLabel} — ${voteDay.tournament_name} | Haunted`;
            const descText = assetNames
              ? `Vote on ${assetNames} — ${voteDay.tournament_name} on Haunted`
              : `Make your predictions for ${dayLabel} on Haunted`;
            const title = escapeHtml(titleText);
            const desc = escapeHtml(descText);
            const image = escapeHtml(`${origin}/api/og-image?type=voteday&id=${encodeURIComponent(slug)}&day=${encodeURIComponent(dayToken)}`);
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
    <meta property="og:site_name" content="Haunted" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${desc}" />
    <meta name="twitter:image" content="${image}" />
    <link rel="image_src" href="${image}" />`;
            let injected = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
            injected = injected.replace(/<meta name="description"[^>]*\/?>/, `<meta name="description" content="${desc}" />`);
            injected = injected.replace("</head>", `${ogTags}\n</head>`);
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
            return res.status(200).end(injected);
          }
          // Fall through to generic tournament meta if vote day not found
        }
        const tournament = await fetchTournament(slug);
        if (tournament) {
          const titleText = isVote
            ? `🗳️ Vote — ${tournament.name} | Haunted`
            : `🏆 ${tournament.name} | Haunted`;
          const descText = isVote
            ? `Make your predictions for ${tournament.name} on Haunted`
            : (tournament.description
                ? `${tournament.description.slice(0, 150)}${tournament.description.length > 150 ? "…" : ""}`
                : `Live tournament leaderboard — ${tournament.name} on Haunted`);
          const title = escapeHtml(titleText);
          const desc = escapeHtml(descText);
          const ogImageParams = `type=tournament&id=${encodeURIComponent(slug)}${isVote ? "&vote=1" : ""}`;
          const image = escapeHtml(`${origin}/api/og-image?${ogImageParams}`);
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
    <meta property="og:site_name" content="Haunted" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${desc}" />
    <meta name="twitter:image" content="${image}" />
    <link rel="image_src" href="${image}" />`;
          // Replace default title and description to avoid conflicts with tournament OG meta
          let injected = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
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
      return res.redirect(307, slug ? `/tournament/${slug}${isVote ? "/vote" : ""}` : "/");
    }

    // Bot detected — generate OG meta

    const ogImageParams = `type=tournament&id=${encodeURIComponent(slug || "")}${isVote ? "&vote=1" : ""}`;

    const fallback = {
      title: isVote ? "🗳️ Vote | Haunted" : "🏆 Tournament | Haunted",
      description: isVote ? "Make your predictions on Haunted" : "Live tournament leaderboard on Haunted",
      imageUrl: `${origin}/api/og-image?${ogImageParams}`,
      pageUrl,
    };

    if (!slug) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
      return res.status(200).end(buildMetaHtml(fallback));
    }

    // Vote day with dayToken — specific vote day OG meta for bots
    if (slug && dayToken) {
      const voteDay = await fetchVoteDay(slug, dayToken);
      if (voteDay) {
        const dayLabel = voteDay.day_title || voteDay.date_key;
        const assetNames = voteDay.assets.map(a => a.asset_code).join(", ");

        const meta = {
          title: `🗳️ ${dayLabel} — ${voteDay.tournament_name} | Haunted`,
          description: assetNames
            ? `Vote on ${assetNames} — ${voteDay.tournament_name} on Haunted`
            : `Make your predictions for ${dayLabel} on Haunted`,
          imageUrl: `${origin}/api/og-image?type=voteday&id=${encodeURIComponent(slug)}&day=${encodeURIComponent(dayToken)}`,
          pageUrl,
        };

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
        return res.status(200).end(buildMetaHtml(meta));
      }
      // Fall through to normal tournament meta if vote day not found
    }

    const tournament = await fetchTournament(slug);
    if (!tournament) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
      return res.status(200).end(buildMetaHtml(fallback));
    }

    const meta = {
      title: isVote
        ? `🗳️ Vote — ${tournament.name} | Haunted`
        : `🏆 ${tournament.name} | Haunted`,
      description: isVote
        ? `Make your predictions for ${tournament.name} on Haunted`
        : (tournament.description
            ? `${tournament.description.slice(0, 150)}${tournament.description.length > 150 ? "…" : ""}`
            : `Live tournament leaderboard — ${tournament.name} on Haunted`),
      imageUrl: `${origin}/api/og-image?${ogImageParams}`,
      pageUrl,
    };

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
    return res.status(200).end(buildMetaHtml(meta));
  } catch (err) {
    console.error("[tournament-meta] error:", err);
    const html = getIndexHtml();
    if (html) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).end(html);
    }
    return res.status(500).end("Internal Server Error");
  }
}
