import { ImageResponse } from "@vercel/og";
import pg from "pg";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { Pool } = pg;

// ── Custom font loading (cached at module level) ──
// Orbitron – futuristic geometric font for trading pair symbols, PnL values, headings
// Space Grotesk – clean modern font for body text, badges, metadata
let _fontsCache = null;
async function loadFonts() {
  if (_fontsCache) return _fontsCache;
  try {
    const fontsDir = join(process.cwd(), "public/fonts");
    const orbitron700 = readFileSync(join(fontsDir, "orbitron-latin-700-normal.woff"));
    const orbitron800 = readFileSync(join(fontsDir, "orbitron-latin-800-normal.woff"));
    const spaceGrotesk700 = readFileSync(join(fontsDir, "space-grotesk-latin-700-normal.woff"));
    _fontsCache = [
      { name: "Orbitron", data: orbitron700.buffer, weight: 700, style: "normal" },
      { name: "Orbitron", data: orbitron800.buffer, weight: 800, style: "normal" },
      { name: "Space Grotesk", data: spaceGrotesk700.buffer, weight: 700, style: "normal" },
    ];
    return _fontsCache;
  } catch (e) {
    console.error("[og-image] font load failed:", e?.message);
    return [];
  }
}

// Reuse pool across invocations
function getPool() {
  if (globalThis.__og_pool) return globalThis.__og_pool;
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (!url) return null;
  const isLocal = /localhost|127\.0\.0\.1/i.test(url);
  const sslDisabled = String(process.env.PGSSL_DISABLE || "").trim() === "1";
  const ssl = !isLocal && !sslDisabled ? { rejectUnauthorized: false } : false;
  globalThis.__og_pool = new Pool({
    connectionString: url,
    max: 2,
    ssl,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
  return globalThis.__og_pool;
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
    console.error("[og-image] db error:", err?.message);
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

// ── Logo (cached at module level) ──
// Uses the optimized 128×128 version from public/ (much smaller than 1024×1024 original)
let _logoSrc = null;
function getLogoSrc() {
  if (_logoSrc !== null) return _logoSrc;
  try {
    const buf = readFileSync(join(process.cwd(), "public/haunted-logo.png"));
    _logoSrc = `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    try {
      const buf = readFileSync(join(process.cwd(), "src/assets/haunted.png"));
      _logoSrc = `data:image/png;base64,${buf.toString("base64")}`;
    } catch {
      _logoSrc = "";
    }
  }
  return _logoSrc;
}

// ── Brand colours ──
const BG_FROM = "#060A14";
const BG_TO = "#0B1222";
const CARD_BG = "rgba(10,16,32,0.92)";
const BORDER = "rgba(59,130,246,0.18)";
const ACCENT = "#4F8EF7";
const CYAN = "#38DCF4";
const GREEN = "#34D072";
const RED = "#F05252";
const GRAY = "#94A3B8";
const WHITE = "#FFFFFF";
const DIM = "#7B8BA5";
const PURPLE = "#B49CFF";
const AMBER = "#FBBF24";

// ── Utilities ──

function fmtNumber(num) {
  const parts = num.toFixed(2).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

function formatPnl(value) {
  if (value == null) return null;
  const sign = value >= 0 ? "+" : "-";
  return `${sign}$${fmtNumber(Math.abs(value))}`;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  } catch {
    return String(dateStr);
  }
}

function formatRR(rr) {
  if (rr == null || rr === 0) return null;
  return `${Number(rr).toFixed(1)}R`;
}

function outcomeLabel(outcome) {
  if (!outcome) return null;
  const o = outcome.toLowerCase();
  if (o === "profit" || o === "win" || o === "won") return "Win";
  if (o === "loss" || o === "lost") return "Loss";
  if (o === "be" || o === "breakeven" || o === "break even") return "BE";
  return outcome;
}

function outcomeColor(label) {
  if (label === "Win") return GREEN;
  if (label === "Loss") return RED;
  return GRAY;
}

function outcomeBg(label) {
  if (label === "Win") return "rgba(34,197,94,0.1)";
  if (label === "Loss") return "rgba(239,68,68,0.1)";
  return "rgba(148,163,184,0.1)";
}

function directionColor(dir) {
  if (!dir) return GRAY;
  const d = dir.toUpperCase();
  return d === "LONG" ? GREEN : d === "SHORT" ? RED : GRAY;
}

function directionArrow(dir) {
  if (!dir) return "";
  const d = dir.toUpperCase();
  return d === "LONG" ? "▲" : d === "SHORT" ? "▼" : "";
}

function directionBg(dir) {
  if (!dir) return "rgba(148,163,184,0.15)";
  const d = dir.toUpperCase();
  return d === "LONG" ? "rgba(34,197,94,0.15)" : d === "SHORT" ? "rgba(239,68,68,0.15)" : "rgba(148,163,184,0.15)";
}

function statusColor(status) {
  switch (status) {
    case "Active": return CYAN;
    case "Planned": return ACCENT;
    case "Closed": return GRAY;
    case "Archived": return AMBER;
    default: return ACCENT;
  }
}

function resultColor(result) {
  switch (result) {
    case "Won": return GREEN;
    case "Lost": return RED;
    case "BE": return GRAY;
    default: return GRAY;
  }
}

function resultGlow(result) {
  switch (result) {
    case "Won": return "rgba(52,208,114,0.12)";
    case "Lost": return "rgba(240,82,82,0.12)";
    default: return "rgba(148,163,184,0.08)";
  }
}

function resultLabel(result) {
  switch (result) {
    case "Won": return "Won ✓";
    case "Lost": return "Lost ✗";
    case "BE": return "BE";
    default: return result || "Unknown";
  }
}

const DOC_TYPES = {
  weekly_plan:   { label: "Weekly Plan",   color: CYAN },
  strategy:      { label: "Strategy",      color: PURPLE },
  idea:          { label: "Idea / Setup",  color: AMBER },
  note:          { label: "Note",          color: GRAY },
  weekly_review: { label: "Weekly Review", color: GREEN },
};

function docTypeInfo(rawType) {
  const key = (rawType || "note").toLowerCase().replace(/\s+/g, "_");
  return DOC_TYPES[key] || DOC_TYPES.note;
}

// ── Data extractors ──

// @vercel/og (Satori) only supports JPEG, PNG, GIF, APNG, SVG images.
// WebP and AVIF data URLs will cause "Unsupported image type" errors.
function isOgCompatibleImage(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return false;
  return (
    dataUrl.startsWith("data:image/jpeg") ||
    dataUrl.startsWith("data:image/png") ||
    dataUrl.startsWith("data:image/gif") ||
    dataUrl.startsWith("data:image/svg")
  );
}

function buildTradeData(payload, author) {
  const trades = payload?.trades || [];
  const count = trades.length;
  if (count === 0) return { mode: "single_trade", symbol: "Shared Trade", direction: null, pnl: null, rr: null, outcome: null, date: "", account: "", timeframe: "", author };

  if (count === 1) {
    const t = trades[0];
    // Only include trade image in OG preview if the user opted in via includeScreenshot
    const showImage = !!payload.includeScreenshot;
    const rawImage = showImage && Array.isArray(t.images) && t.images.length > 0 && t.images[0].dataUrl
      ? t.images[0].dataUrl : null;
    const firstImage = isOgCompatibleImage(rawImage) ? rawImage : null;
    return {
      mode: "single_trade",
      symbol: t.symbolName || t.symbol || t.pair || "—",
      direction: (t.direction || "").toUpperCase(),
      pnl: t.pnl != null ? Number(t.pnl) : null,
      rr: t.rr != null && t.rr !== 0 ? Number(t.rr) : null,
      outcome: outcomeLabel(t.outcome),
      date: formatDate(t.date),
      account: t.accountName || (t.allocations && t.allocations[0]?.accountName) || "",
      timeframe: t.timeframe || "",
      imageUrl: firstImage,
      author,
    };
  }

  let totalPnl = 0;
  let wins = 0;
  for (const t of trades) {
    const p = Number(t.pnl || 0);
    totalPnl += p;
    if (p > 0) wins++;
  }
  return {
    mode: "multi_trade",
    count, totalPnl,
    winRate: Math.round((wins / count) * 100),
    author,
  };
}

function buildDocData(payload, author) {
  const doc = payload?.document || {};
  const title = doc.title || payload?.title || "Untitled Document";
  const typeInfo = docTypeInfo(doc.type);
  const text = doc.contentText || doc.content_text || "";
  const preview = text.length > 140 ? text.slice(0, 140) + "…" : text;
  const tradeCount = doc.stats?.tradeCount || (doc.linkedTrades ? doc.linkedTrades.length : 0);
  const date = formatDate(doc.createdAt || doc.created_at);
  return { title, typeInfo, preview, tradeCount, date, author };
}

function buildIdeaData(payload, author) {
  const idea = payload?.idea || {};
  return {
    pair: idea.pair || "—",
    direction: (idea.direction || "").toUpperCase(),
    status: idea.status || "Planned",
    result: idea.result || "Unknown",
    title: idea.title || "",
    timeframe: idea.timeframe || "",
    author,
  };
}

function buildBacktestData(payload, author) {
  const bt = payload?.backtest || {};
  const name = bt.name || payload?.name || "Backtest";
  const tradeCount = bt.tradeCount || (bt.trades ? bt.trades.length : null);
  return { name, tradeCount, author };
}

// ── Pill / badge helpers ──

function pillEl(text, color, bg) {
  return {
    type: "div",
    props: {
      style: {
        display: "flex", alignItems: "center",
        padding: "8px 20px", borderRadius: "999px",
        fontSize: "22px", fontWeight: 700,
        letterSpacing: "0.05em",
        fontFamily: "'Orbitron', system-ui, sans-serif",
        color, background: bg,
        border: `1px solid ${color}22`,
      },
      children: text,
    },
  };
}

function smallBadge(text, color, bg) {
  return {
    type: "div",
    props: {
      style: {
        display: "flex", alignItems: "center",
        padding: "6px 16px", borderRadius: "10px",
        fontSize: "18px", fontWeight: 700,
        letterSpacing: "0.03em",
        fontFamily: "'Orbitron', system-ui, sans-serif",
        color, background: bg || "rgba(59,130,246,0.12)",
        border: `1px solid ${color}18`,
      },
      children: text,
    },
  };
}

// ── Logo element ──

function logoRow() {
  const logoSrc = getLogoSrc();
  const logoChildren = [];
  if (logoSrc) {
    logoChildren.push({
      type: "img",
      props: {
        src: logoSrc,
        width: 44, height: 44,
        style: { borderRadius: "10px", width: "44px", height: "44px" },
      },
    });
  } else {
    logoChildren.push({
      type: "div",
      props: {
        style: {
          display: "flex", alignItems: "center", justifyContent: "center",
          width: "44px", height: "44px", borderRadius: "10px",
          background: "rgba(59,130,246,0.2)", fontSize: "24px",
        },
        children: "👻",
      },
    });
  }
  logoChildren.push({
    type: "span",
    props: {
      style: { fontSize: "24px", fontWeight: 800, color: ACCENT, letterSpacing: "0.12em", fontFamily: "'Orbitron', system-ui, sans-serif" },
      children: "HAUNTED",
    },
  });
  return {
    type: "div",
    props: {
      style: { display: "flex", alignItems: "center", gap: "12px" },
      children: logoChildren,
    },
  };
}

// ── Content builders (type-specific JSX children) ──

function buildSingleTradeContent(d) {
  const pnlStr = formatPnl(d.pnl);
  const pnlColor = d.pnl != null ? (d.pnl >= 0 ? GREEN : RED) : GRAY;
  const rrStr = formatRR(d.rr);

  // Left column items
  const leftItems = [];

  // Row 1: Symbol + Direction pill
  const row1 = [];
  row1.push({
    type: "span",
    props: { style: { fontSize: "56px", fontWeight: 800, color: WHITE, letterSpacing: "0.04em", fontFamily: "'Orbitron', system-ui, sans-serif" }, children: d.symbol },
  });
  if (d.direction) {
    row1.push(pillEl(
      `${directionArrow(d.direction)} ${d.direction}`,
      directionColor(d.direction),
      directionBg(d.direction),
    ));
  }
  leftItems.push({
    type: "div",
    props: { style: { display: "flex", alignItems: "center", gap: "18px", flexWrap: "wrap" }, children: row1 },
  });

  // Row 2: Timeframe + Date
  const meta = [d.timeframe, d.date].filter(Boolean).join("  •  ");
  if (meta) {
    leftItems.push({
      type: "div",
      props: { style: { display: "flex", fontSize: "20px", color: DIM, marginTop: "6px", letterSpacing: "0.01em" }, children: meta },
    });
  }

  // Row 3: Outcome badge
  if (d.outcome) {
    leftItems.push({
      type: "div",
      props: {
        style: { display: "flex", marginTop: "8px" },
        children: [smallBadge(d.outcome, outcomeColor(d.outcome), outcomeBg(d.outcome))],
      },
    });
  }

  // Right column: Image (optional) + PnL + RR
  const rightItems = [];

  // Trade image thumbnail above PnL
  if (d.imageUrl) {
    rightItems.push({
      type: "div",
      props: {
        style: {
          display: "flex", alignItems: "flex-end", justifyContent: "flex-end",
          marginBottom: "14px",
        },
        children: [
          {
            type: "img",
            props: {
              src: d.imageUrl,
              width: 340,
              height: 190,
              style: {
                width: "340px", height: "190px", objectFit: "cover",
                borderRadius: "14px",
                border: `1.5px solid ${BORDER}`,
              },
            },
          },
        ],
      },
    });
  }

  if (pnlStr) {
    rightItems.push({
      type: "div",
      props: {
        style: {
          display: "flex", flexDirection: "column", alignItems: "flex-end",
          position: "relative",
        },
        children: [
          // Glow effect behind PnL
          {
            type: "div",
            props: {
              style: {
                position: "absolute", top: "-20px", right: "-30px",
                width: "300px", height: "120px", borderRadius: "50%",
                background: `radial-gradient(circle, ${d.pnl >= 0 ? "rgba(52,208,114,0.12)" : "rgba(240,82,82,0.12)"} 0%, transparent 70%)`,
              },
            },
          },
          {
            type: "div",
            props: { style: { display: "flex", fontSize: "62px", fontWeight: 800, color: pnlColor, letterSpacing: "0.02em", fontFamily: "'Orbitron', system-ui, sans-serif" }, children: pnlStr },
          },
        ],
      },
    });
  }
  if (rrStr) {
    rightItems.push({
      type: "div",
      props: { style: { display: "flex", fontSize: "24px", fontWeight: 700, color: GRAY, marginTop: "4px", fontFamily: "'Orbitron', system-ui, sans-serif" }, children: rrStr },
    });
  }

  return {
    type: "div",
    props: {
      style: { display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between", gap: "24px" },
      children: [
        { type: "div", props: { style: { display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }, children: leftItems } },
        rightItems.length > 0
          ? { type: "div", props: { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center" }, children: rightItems } }
          : null,
      ].filter(Boolean),
    },
  };
}

function buildMultiTradeContent(d) {
  const pnlStr = formatPnl(d.totalPnl);
  const pnlColor = d.totalPnl >= 0 ? GREEN : RED;

  const badges = [
    smallBadge(`WR: ${d.winRate}%`, d.winRate >= 50 ? GREEN : RED, d.winRate >= 50 ? "rgba(52,208,114,0.12)" : "rgba(240,82,82,0.12)"),
    smallBadge(pnlStr, pnlColor, d.totalPnl >= 0 ? "rgba(52,208,114,0.12)" : "rgba(240,82,82,0.12)"),
    smallBadge(`${d.count} trades`, GRAY, "rgba(148,163,184,0.12)"),
  ];

  return {
    type: "div",
    props: {
      style: { display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", gap: "24px" },
      children: [
        // Title row
        {
          type: "div",
          props: {
            style: { display: "flex", alignItems: "center", gap: "20px" },
            children: [
              { type: "span", props: { style: { fontSize: "52px", fontWeight: 800, color: WHITE, letterSpacing: "0.04em", fontFamily: "'Orbitron', system-ui, sans-serif" }, children: `${d.count} Trades` } },
              pillEl("Shared Trades", ACCENT, "rgba(79,142,247,0.15)"),
            ],
          },
        },
        // Stats row
        { type: "div", props: { style: { display: "flex", gap: "14px", flexWrap: "wrap" }, children: badges } },
      ],
    },
  };
}

function buildDocContent(d) {
  // Left column items
  const leftItems = [];

  // Type pill (promoted from smallBadge to pillEl for more prominence)
  leftItems.push({
    type: "div",
    props: {
      style: { display: "flex" },
      children: [pillEl(d.typeInfo.label, d.typeInfo.color, `${d.typeInfo.color}18`)],
    },
  });

  // Title
  const titleText = d.title.length > 50 ? d.title.slice(0, 50) + "…" : d.title;
  leftItems.push({
    type: "div",
    props: {
      style: { display: "flex", fontSize: "44px", fontWeight: 800, color: WHITE, marginTop: "12px", letterSpacing: "0.02em", fontFamily: "'Orbitron', system-ui, sans-serif", lineHeight: "1.2" },
      children: titleText,
    },
  });

  // Preview text
  if (d.preview) {
    leftItems.push({
      type: "div",
      props: {
        style: { display: "flex", fontSize: "20px", color: DIM, lineHeight: "1.5", marginTop: "12px" },
        children: d.preview,
      },
    });
  }

  // Meta row as badges
  const metaBadges = [];
  if (d.tradeCount > 0) {
    metaBadges.push(smallBadge(`${d.tradeCount} trade${d.tradeCount > 1 ? "s" : ""}`, ACCENT, "rgba(79,142,247,0.12)"));
  }
  if (d.date) {
    metaBadges.push(smallBadge(d.date, GRAY, "rgba(148,163,184,0.12)"));
  }
  if (metaBadges.length > 0) {
    leftItems.push({
      type: "div",
      props: {
        style: { display: "flex", gap: "12px", marginTop: "14px", flexWrap: "wrap" },
        children: metaBadges,
      },
    });
  }

  // Right column: decorative type indicator with glow
  const rightItems = [];
  rightItems.push({
    type: "div",
    props: {
      style: {
        display: "flex", flexDirection: "column", alignItems: "center",
        position: "relative",
      },
      children: [
        // Glow effect
        {
          type: "div",
          props: {
            style: {
              position: "absolute", top: "-40px", right: "-50px",
              width: "300px", height: "200px", borderRadius: "50%",
              background: `radial-gradient(circle, ${d.typeInfo.color}14 0%, transparent 65%)`,
            },
          },
        },
        // Large type icon
        {
          type: "div",
          props: {
            style: {
              display: "flex", alignItems: "center", justifyContent: "center",
              width: "130px", height: "130px", borderRadius: "28px",
              background: `${d.typeInfo.color}10`,
              border: `2px solid ${d.typeInfo.color}25`,
            },
            children: [
              {
                type: "span",
                props: {
                  style: {
                    fontSize: "64px", fontWeight: 800,
                    color: d.typeInfo.color,
                    fontFamily: "'Orbitron', system-ui, sans-serif",
                    letterSpacing: "0.02em",
                  },
                  children: d.typeInfo.label.charAt(0),
                },
              },
            ],
          },
        },
      ],
    },
  });

  return {
    type: "div",
    props: {
      style: { display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between", gap: "24px" },
      children: [
        { type: "div", props: { style: { display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }, children: leftItems } },
        { type: "div", props: { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center" }, children: rightItems } },
      ],
    },
  };
}

function buildIdeaContent(d) {
  // Left column items
  const leftItems = [];

  // Row 1: Pair + Direction pill
  const row1 = [];
  row1.push({
    type: "span",
    props: { style: { fontSize: "56px", fontWeight: 800, color: WHITE, letterSpacing: "0.04em", fontFamily: "'Orbitron', system-ui, sans-serif" }, children: d.pair },
  });
  if (d.direction) {
    row1.push(pillEl(
      `${directionArrow(d.direction)} ${d.direction}`,
      directionColor(d.direction),
      directionBg(d.direction),
    ));
  }
  leftItems.push({
    type: "div",
    props: { style: { display: "flex", alignItems: "center", gap: "18px", flexWrap: "wrap" }, children: row1 },
  });

  // Row 2: Title
  if (d.title) {
    const titleText = d.title.length > 70 ? d.title.slice(0, 70) + "…" : d.title;
    leftItems.push({
      type: "div",
      props: { style: { display: "flex", fontSize: "24px", fontWeight: 700, color: "#CBD5E1", marginTop: "8px", lineHeight: "1.4" }, children: titleText },
    });
  }

  // Row 3: Status + Timeframe badges
  const badges = [];
  badges.push(smallBadge(d.status, statusColor(d.status), "rgba(59,130,246,0.12)"));
  if (d.timeframe) {
    badges.push(smallBadge(d.timeframe, GRAY, "rgba(148,163,184,0.12)"));
  }
  leftItems.push({
    type: "div",
    props: { style: { display: "flex", gap: "14px", marginTop: "14px", flexWrap: "wrap" }, children: badges },
  });

  // Right column: Result indicator with glow (like PnL on trade OG)
  const rightItems = [];
  const rColor = resultColor(d.result);
  const rLabel = resultLabel(d.result);
  const glowColor = resultGlow(d.result);

  rightItems.push({
    type: "div",
    props: {
      style: {
        display: "flex", flexDirection: "column", alignItems: "flex-end",
        position: "relative",
      },
      children: [
        // Glow effect behind result
        {
          type: "div",
          props: {
            style: {
              position: "absolute", top: "-20px", right: "-30px",
              width: "300px", height: "120px", borderRadius: "50%",
              background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
            },
          },
        },
        // Result label
        {
          type: "div",
          props: { style: { display: "flex", fontSize: "52px", fontWeight: 800, color: rColor, letterSpacing: "0.02em", fontFamily: "'Orbitron', system-ui, sans-serif" }, children: rLabel },
        },
      ],
    },
  });

  // Direction arrow below result on right side
  if (d.direction) {
    const arrow = directionArrow(d.direction);
    const dColor = directionColor(d.direction);
    rightItems.push({
      type: "div",
      props: { style: { display: "flex", fontSize: "24px", fontWeight: 700, color: dColor, marginTop: "8px", fontFamily: "'Orbitron', system-ui, sans-serif" }, children: `${arrow} ${d.direction}` },
    });
  }

  return {
    type: "div",
    props: {
      style: { display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between", gap: "24px" },
      children: [
        { type: "div", props: { style: { display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }, children: leftItems } },
        { type: "div", props: { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center" }, children: rightItems } },
      ],
    },
  };
}

function buildBacktestContent(d) {
  const items = [];

  items.push({
    type: "div",
    props: {
      style: { display: "flex", alignItems: "center", gap: "20px" },
      children: [
        { type: "span", props: { style: { fontSize: "46px", fontWeight: 800, color: WHITE, letterSpacing: "0.02em", fontFamily: "'Orbitron', system-ui, sans-serif" }, children: d.name.length > 45 ? d.name.slice(0, 45) + "…" : d.name } },
        pillEl("Backtest", PURPLE, "rgba(180,156,255,0.15)"),
      ],
    },
  });

  if (d.tradeCount) {
    items.push({
      type: "div",
      props: { style: { display: "flex", fontSize: "20px", fontWeight: 700, color: DIM, marginTop: "10px" }, children: `${d.tradeCount} trade${d.tradeCount > 1 ? "s" : ""}` },
    });
  }

  return {
    type: "div",
    props: { style: { display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", gap: "4px" }, children: items },
  };
}

// ── Main JSX builder ──

function buildImageJsx(type, contentEl, author) {
  return {
    type: "div",
    props: {
      style: {
        width: "1200px",
        height: "630px",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Space Grotesk', system-ui, sans-serif",
        background: `linear-gradient(165deg, ${BG_FROM} 0%, ${BG_TO} 100%)`,
        position: "relative",
        overflow: "hidden",
      },
      children: [
        // Radial glow – top center (more prominent)
        {
          type: "div",
          props: {
            style: {
              position: "absolute", top: "-180px", left: "250px",
              width: "700px", height: "520px", borderRadius: "50%",
              background: "radial-gradient(circle, rgba(79,142,247,0.14) 0%, transparent 65%)",
            },
          },
        },
        // Radial glow – bottom right (new)
        {
          type: "div",
          props: {
            style: {
              position: "absolute", bottom: "-120px", right: "-60px",
              width: "450px", height: "380px", borderRadius: "50%",
              background: "radial-gradient(circle, rgba(180,156,255,0.07) 0%, transparent 65%)",
            },
          },
        },
        // Radial glow – bottom left
        {
          type: "div",
          props: {
            style: {
              position: "absolute", bottom: "-130px", left: "-80px",
              width: "480px", height: "380px", borderRadius: "50%",
              background: "radial-gradient(circle, rgba(56,220,244,0.06) 0%, transparent 65%)",
            },
          },
        },
        // Grid overlay – horizontal lines
        {
          type: "div",
          props: {
            style: {
              position: "absolute", top: 0, left: 0, width: "1200px", height: "630px",
              backgroundImage: "linear-gradient(rgba(79,142,247,0.035) 1px, transparent 1px)",
              backgroundSize: "100% 56px",
            },
          },
        },
        // Grid overlay – vertical lines
        {
          type: "div",
          props: {
            style: {
              position: "absolute", top: 0, left: 0, width: "1200px", height: "630px",
              backgroundImage: "linear-gradient(90deg, rgba(79,142,247,0.035) 1px, transparent 1px)",
              backgroundSize: "56px 100%",
            },
          },
        },
        // Inner card
        {
          type: "div",
          props: {
            style: {
              margin: "28px", flex: 1, display: "flex", flexDirection: "column",
              border: `1px solid ${BORDER}`, borderRadius: "24px",
              background: CARD_BG, position: "relative", overflow: "hidden",
            },
            children: [
              // Decorative gradient line at top
              {
                type: "div",
                props: {
                  style: {
                    width: "100%", height: "2px",
                    background: "linear-gradient(90deg, transparent 5%, rgba(79,142,247,0.5) 30%, rgba(180,156,255,0.3) 70%, transparent 95%)",
                  },
                },
              },
              // Card inner content
              {
                type: "div",
                props: {
                  style: { display: "flex", flexDirection: "column", flex: 1, padding: "36px 48px" },
                  children: [
                    // Top row: Logo
                    logoRow(),
                    // Content area
                    contentEl,
                    // Bottom: author + watermark
                    {
                      type: "div",
                      props: {
                        style: { display: "flex", justifyContent: "space-between", alignItems: "flex-end" },
                        children: [
                          { type: "span", props: { style: { fontSize: "19px", fontWeight: 700, color: GRAY }, children: `by ${author}` } },
                          { type: "span", props: { style: { fontSize: "15px", fontWeight: 700, color: "rgba(79,142,247,0.4)", letterSpacing: "0.08em", fontFamily: "'Orbitron', system-ui, sans-serif" }, children: "hauntedx.trade" } },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  };
}

// ── Tournament OG image builder ──

function buildTournamentContent(tournament, isVote) {
  const name = tournament.name || "Tournament";
  const desc = tournament.description || "";
  const startDate = formatDate(tournament.start_date);
  const endDate = formatDate(tournament.end_date);
  const labelEmoji = isVote ? "🗳️" : "🏆";
  const labelText = isVote ? "VOTE" : "TOURNAMENT";

  // ── LEFT SIDE ──
  const leftItems = [];

  // Row 1: Type pill
  leftItems.push({
    type: "div",
    props: {
      style: { display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" },
      children: [pillEl(`${labelEmoji} ${labelText}`, CYAN, "rgba(56,220,244,0.12)")],
    },
  });

  // Row 2: Tournament name (large)
  const truncName = name.length > 35 ? name.slice(0, 35) + "…" : name;
  leftItems.push({
    type: "div",
    props: {
      style: {
        display: "flex",
        fontSize: name.length > 25 ? "38px" : "46px",
        fontWeight: 800, color: WHITE,
        marginTop: "14px", letterSpacing: "0.02em",
        fontFamily: "'Orbitron', system-ui, sans-serif",
        lineHeight: "1.2",
      },
      children: truncName,
    },
  });

  // Row 3: Description (max 100 chars, only if exists)
  if (desc) {
    const truncDesc = desc.length > 100 ? desc.slice(0, 100) + "…" : desc;
    leftItems.push({
      type: "div",
      props: {
        style: { display: "flex", fontSize: "19px", color: DIM, lineHeight: "1.5", marginTop: "10px" },
        children: truncDesc,
      },
    });
  }

  // Row 4: Date range badge (if dates exist)
  const dateParts = [startDate, endDate].filter(Boolean);
  if (dateParts.length > 0) {
    const dateStr = dateParts.length === 2 ? `${dateParts[0]} — ${dateParts[1]}` : dateParts[0];
    leftItems.push({
      type: "div",
      props: {
        style: { display: "flex", gap: "12px", marginTop: "14px", flexWrap: "wrap" },
        children: [smallBadge(dateStr, GRAY, "rgba(148,163,184,0.12)")],
      },
    });
  }

  // ── RIGHT SIDE: Decorative trophy/vote icon with glow ──
  const rightItems = [];
  const iconColor = isVote ? PURPLE : CYAN;
  rightItems.push({
    type: "div",
    props: {
      style: {
        display: "flex", flexDirection: "column", alignItems: "center",
        position: "relative",
      },
      children: [
        // Glow effect
        {
          type: "div",
          props: {
            style: {
              position: "absolute", top: "-40px", right: "-50px",
              width: "300px", height: "200px", borderRadius: "50%",
              background: `radial-gradient(circle, ${iconColor}18 0%, transparent 65%)`,
            },
          },
        },
        // Large icon box
        {
          type: "div",
          props: {
            style: {
              display: "flex", alignItems: "center", justifyContent: "center",
              width: "140px", height: "140px", borderRadius: "32px",
              background: `${iconColor}10`,
              border: `2px solid ${iconColor}22`,
            },
            children: [
              { type: "span", props: { style: { fontSize: "72px" }, children: isVote ? "🗳️" : "🏆" } },
            ],
          },
        },
      ],
    },
  });

  return {
    type: "div",
    props: {
      style: { display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between", gap: "32px" },
      children: [
        { type: "div", props: { style: { display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }, children: leftItems } },
        { type: "div", props: { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center" }, children: rightItems } },
      ],
    },
  };
}

function buildVoteDayContent(data) {
  const tournamentName = data.tournament_name || "Tournament";
  const dayTitle = data.day_title || data.date_key || "Vote Day";
  const dateFormatted = formatDate(data.date_key);
  const assets = data.assets || [];

  // ── LEFT SIDE ──
  const leftItems = [];

  // Row 1: Type pill
  leftItems.push({
    type: "div",
    props: {
      style: { display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" },
      children: [pillEl("🗳️ VOTE DAY", PURPLE, "rgba(180,156,255,0.12)")],
    },
  });

  // Row 2: Day title (large)
  const truncTitle = dayTitle.length > 30 ? dayTitle.slice(0, 30) + "…" : dayTitle;
  leftItems.push({
    type: "div",
    props: {
      style: {
        display: "flex",
        fontSize: dayTitle.length > 20 ? "38px" : "46px",
        fontWeight: 800, color: WHITE,
        marginTop: "14px", letterSpacing: "0.02em",
        fontFamily: "'Orbitron', system-ui, sans-serif",
        lineHeight: "1.2",
      },
      children: truncTitle,
    },
  });

  // Row 3: Tournament name (subtitle)
  const truncTournament = tournamentName.length > 40 ? tournamentName.slice(0, 40) + "…" : tournamentName;
  leftItems.push({
    type: "div",
    props: {
      style: { display: "flex", fontSize: "20px", color: DIM, lineHeight: "1.4", marginTop: "8px" },
      children: truncTournament,
    },
  });

  // Row 4: Badges — date + asset list
  const badgeItems = [];
  if (dateFormatted) {
    badgeItems.push(smallBadge(dateFormatted, GRAY, "rgba(148,163,184,0.12)"));
  }
  if (assets.length > 0) {
    const assetStr = assets.map(a => a.asset_code).slice(0, 6).join(", ") + (assets.length > 6 ? " …" : "");
    badgeItems.push(smallBadge(assetStr, ACCENT, "rgba(79,142,247,0.12)"));
  }
  if (badgeItems.length > 0) {
    leftItems.push({
      type: "div",
      props: {
        style: { display: "flex", gap: "12px", marginTop: "14px", flexWrap: "wrap" },
        children: badgeItems,
      },
    });
  }

  // ── RIGHT SIDE: Decorative vote icon with glow ──
  const rightItems = [];
  rightItems.push({
    type: "div",
    props: {
      style: {
        display: "flex", flexDirection: "column", alignItems: "center",
        position: "relative",
      },
      children: [
        // Glow effect
        {
          type: "div",
          props: {
            style: {
              position: "absolute", top: "-40px", right: "-50px",
              width: "300px", height: "200px", borderRadius: "50%",
              background: "radial-gradient(circle, rgba(180,156,255,0.15) 0%, transparent 65%)",
            },
          },
        },
        // Large icon box
        {
          type: "div",
          props: {
            style: {
              display: "flex", alignItems: "center", justifyContent: "center",
              width: "140px", height: "140px", borderRadius: "32px",
              background: "rgba(180,156,255,0.08)",
              border: "2px solid rgba(180,156,255,0.2)",
            },
            children: [
              { type: "span", props: { style: { fontSize: "72px" }, children: "🗳️" } },
            ],
          },
        },
      ],
    },
  });

  return {
    type: "div",
    props: {
      style: { display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between", gap: "32px" },
      children: [
        { type: "div", props: { style: { display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }, children: leftItems } },
        { type: "div", props: { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center" }, children: rightItems } },
      ],
    },
  };
}

async function fetchTournamentBySlug(slug) {
  const pool = getPool();
  if (!pool) return null;
  try {
    const result = await pool.query(
      `SELECT t.id, t.name, t.description, t.banner_image_url,
              t.start_date, t.end_date
       FROM tournament_public_links pl
       JOIN tournaments t ON t.id = pl.tournament_id
       WHERE pl.public_slug = $1
         AND pl.is_enabled = true`,
      [slug]
    );
    return result.rows[0] || null;
  } catch (err) {
    console.error("[og-image] tournament db error:", err?.message);
    return null;
  }
}

async function fetchVoteDayData(slug, dayToken) {
  const pool = getPool();
  if (!pool) return null;
  try {
    const result = await pool.query(
      `SELECT t.name AS tournament_name,
              d.title AS day_title, d.date_key, d.id AS day_id
       FROM tournament_public_links pl
       JOIN tournaments t ON t.id = pl.tournament_id
       JOIN tournament_vote_days d ON d.tournament_id = t.id AND d.vote_token = $2
       WHERE pl.public_slug = $1
         AND pl.is_enabled = true`,
      [slug, dayToken]
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];

    // Fetch assets
    let assets = [];
    if (row.day_id) {
      const assetsRes = await pool.query(
        `SELECT asset_code, asset_name
         FROM tournament_vote_assets
         WHERE vote_day_id = $1 AND is_active = true
         ORDER BY sort_order ASC, id ASC`,
        [row.day_id]
      );
      assets = assetsRes.rows;
    }

    return {
      tournament_name: row.tournament_name,
      day_title: row.day_title,
      date_key: row.date_key,
      assets,
    };
  } catch (err) {
    console.error("[og-image] vote day db error:", err?.message);
    return null;
  }
}

function buildFallbackJsx() {
  const content = {
    type: "div",
    props: {
      style: { display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", gap: "12px" },
      children: [
        { type: "span", props: { style: { fontSize: "52px", fontWeight: 800, color: WHITE, letterSpacing: "0.04em", fontFamily: "'Orbitron', system-ui, sans-serif" }, children: "Haunted Trading Journal" } },
        { type: "span", props: { style: { fontSize: "22px", fontWeight: 700, color: DIM }, children: "Share your trades, ideas and strategies" } },
      ],
    },
  };
  return buildImageJsx("fallback", content, "Trading Journal");
}

async function sendImageResponse(res, element, cacheControl, fonts) {
  const opts = { width: 1200, height: 630 };
  if (fonts && fonts.length > 0) opts.fonts = fonts;
  const imgRes = new ImageResponse(element, opts);
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", cacheControl);
  return res.status(200).end(buffer);
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const type = url.searchParams.get("type");
    const id = url.searchParams.get("id");

    const fonts = await loadFonts();

    // Vote day OG image — uses slug + dayToken
    if (type === "voteday") {
      const slug = id;
      const dayToken = url.searchParams.get("day");
      if (!slug || !dayToken) {
        return sendImageResponse(res, buildFallbackJsx(), "public, max-age=60, s-maxage=300", fonts);
      }
      const data = await fetchVoteDayData(slug, dayToken);
      if (!data) {
        return sendImageResponse(res, buildFallbackJsx(), "public, max-age=60, s-maxage=300", fonts);
      }
      const contentEl = buildVoteDayContent(data);
      return sendImageResponse(res, buildImageJsx("voteday", contentEl, data.tournament_name || "Tournament"), "public, max-age=3600, s-maxage=86400", fonts);
    }

    // Tournament OG image — uses slug instead of share id
    if (type === "tournament") {
      const slug = id;
      const isVote = url.searchParams.get("vote") === "1";
      const tournament = await fetchTournamentBySlug(slug);
      if (!tournament) {
        return sendImageResponse(res, buildFallbackJsx(), "public, max-age=60, s-maxage=300", fonts);
      }
      const contentEl = buildTournamentContent(tournament, isVote);
      return sendImageResponse(res, buildImageJsx("tournament", contentEl, tournament.name || "Tournament"), "public, max-age=3600, s-maxage=86400", fonts);
    }

    if (!type || !id) {
      return sendImageResponse(res, buildFallbackJsx(), "public, max-age=3600, s-maxage=86400", fonts);
    }

    const share = await fetchShare(id);
    if (!share) {
      return sendImageResponse(res, buildFallbackJsx(), "public, max-age=60, s-maxage=300", fonts);
    }

    const author = resolveAuthor(share);
    const payload = share.payload || {};
    let contentEl;

    switch (type) {
      case "trade": {
        const td = buildTradeData(payload, author);
        contentEl = td.mode === "multi_trade"
          ? buildMultiTradeContent(td)
          : buildSingleTradeContent(td);
        break;
      }
      case "doc":
        contentEl = buildDocContent(buildDocData(payload, author));
        break;
      case "idea":
        contentEl = buildIdeaContent(buildIdeaData(payload, author));
        break;
      case "backtest":
        contentEl = buildBacktestContent(buildBacktestData(payload, author));
        break;
      default:
        contentEl = {
          type: "div",
          props: {
            style: { display: "flex", flex: 1, alignItems: "center", justifyContent: "center" },
            children: { type: "span", props: { style: { fontSize: "40px", fontWeight: 800, color: WHITE, fontFamily: "'Orbitron', system-ui, sans-serif" }, children: "Shared Content" } },
          },
        };
    }

    try {
      return await sendImageResponse(res, buildImageJsx(type, contentEl, author), "public, max-age=3600, s-maxage=86400", fonts);
    } catch (renderErr) {
      // If rendering fails (e.g. unsupported image format slipped through), retry without the trade image
      console.warn("[og-image] render failed, retrying without trade image:", renderErr?.message);
      if (type === "trade") {
        const td = buildTradeData(payload, author);
        td.imageUrl = null;
        contentEl = td.mode === "multi_trade"
          ? buildMultiTradeContent(td)
          : buildSingleTradeContent(td);
        return sendImageResponse(res, buildImageJsx(type, contentEl, author), "public, max-age=3600, s-maxage=86400", fonts);
      }
      throw renderErr;
    }
  } catch (err) {
    console.error("[og-image] error:", err);
    return sendImageResponse(res, buildFallbackJsx(), "public, max-age=60, s-maxage=300");
  }
}
