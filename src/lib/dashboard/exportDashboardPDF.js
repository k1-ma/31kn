/**
 * exportDashboardPDF
 *
 * Generates a Haunted-themed multi-page PDF report from dashboard metrics
 * and triggers a browser download. Mirrors the dark "Blue Steel" aesthetic
 * used across the app: deep navy background, accent blue/cyan, glowing
 * borders, and ASCII-friendly typography (jsPDF default Helvetica).
 *
 * Usage:
 *   await exportDashboardPDF({ metrics, accounts, filters, currency, ui });
 */

import { fmtMoney, fmtPct, fmtRR, clampNum } from "@/lib/utils";

// ---------- Haunted palette (RGB) ----------
const C = {
  bg: [11, 14, 17],          // page background
  card: [19, 23, 34],         // card surface
  cardAlt: [24, 30, 44],      // alt card surface for stripes
  border: [42, 46, 57],
  borderGlow: [41, 98, 255],
  fg: [215, 219, 230],
  muted: [138, 146, 166],
  dim: [90, 107, 138],
  accent: [41, 98, 255],
  accent2: [0, 184, 217],
  success: [34, 197, 94],
  danger: [251, 113, 133],
  warning: [251, 191, 36],
  white: [255, 255, 255],
};

// ---------- Page geometry (A4 portrait, mm) ----------
const PAGE = { w: 210, h: 297, margin: 14 };

// ---------- Helpers ----------
const fmtNumber = (n, digits = 2) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  return x.toFixed(digits);
};

const sign = (n) => (Number(n) > 0 ? "+" : "");

const safeStr = (s) => {
  if (s == null) return "";
  // jsPDF Helvetica is WinAnsi — strip emoji / non-latin glyphs to avoid tofu.
  return String(s).replace(/[^\x20-\x7E -ÿ]/g, "").trim();
};

const colorForPnl = (n) => {
  const v = Number(n) || 0;
  if (v > 0) return C.success;
  if (v < 0) return C.danger;
  return C.muted;
};

const setFill = (doc, [r, g, b]) => doc.setFillColor(r, g, b);
const setStroke = (doc, [r, g, b]) => doc.setDrawColor(r, g, b);
const setText = (doc, [r, g, b]) => doc.setTextColor(r, g, b);

// ---------- Background painter ----------
function paintBackground(doc) {
  setFill(doc, C.bg);
  doc.rect(0, 0, PAGE.w, PAGE.h, "F");

  // subtle accent gradient bar (top)
  setFill(doc, C.accent);
  doc.rect(0, 0, PAGE.w, 1.2, "F");
  setFill(doc, C.accent2);
  doc.rect(0, 1.2, PAGE.w, 0.4, "F");

  // bottom hairline
  setFill(doc, C.border);
  doc.rect(PAGE.margin, PAGE.h - 12, PAGE.w - PAGE.margin * 2, 0.2, "F");
}

// "Glow" border around a rect — three concentric strokes fading out.
function glowRect(doc, x, y, w, h, radius = 2.5) {
  setStroke(doc, [12, 24, 56]);
  doc.setLineWidth(1.6);
  doc.roundedRect(x - 0.6, y - 0.6, w + 1.2, h + 1.2, radius + 0.6, radius + 0.6);
  setStroke(doc, [22, 48, 110]);
  doc.setLineWidth(0.9);
  doc.roundedRect(x - 0.3, y - 0.3, w + 0.6, h + 0.6, radius + 0.3, radius + 0.3);
  setStroke(doc, C.borderGlow);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, w, h, radius, radius);
}

function card(doc, x, y, w, h, { glow = false } = {}) {
  setFill(doc, C.card);
  doc.roundedRect(x, y, w, h, 2.5, 2.5, "F");
  if (glow) {
    glowRect(doc, x, y, w, h, 2.5);
  } else {
    setStroke(doc, C.border);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, y, w, h, 2.5, 2.5);
  }
}

// ---------- Header & footer ----------
function pageHeader(doc, { title, subtitle }) {
  paintBackground(doc);

  // Brand chip
  const brandY = 12;
  setFill(doc, C.accent);
  doc.roundedRect(PAGE.margin, brandY, 5, 5, 1, 1, "F");
  setFill(doc, C.accent2);
  doc.roundedRect(PAGE.margin + 6, brandY, 5, 5, 1, 1, "F");

  setText(doc, C.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("HAUNTED X", PAGE.margin + 14, brandY + 4);

  setText(doc, C.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("TRADING JOURNAL", PAGE.margin + 41, brandY + 4);

  // Right-side title
  setText(doc, C.fg);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(safeStr(title || "Dashboard Report"), PAGE.w - PAGE.margin, brandY + 2.8, {
    align: "right",
  });

  if (subtitle) {
    setText(doc, C.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(safeStr(subtitle), PAGE.w - PAGE.margin, brandY + 6.4, { align: "right" });
  }

  // Divider
  setFill(doc, C.borderGlow);
  doc.rect(PAGE.margin, brandY + 9.5, PAGE.w - PAGE.margin * 2, 0.25, "F");
}

function pageFooter(doc, pageNum, pageCount, generatedAt) {
  setText(doc, C.dim);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`Generated ${generatedAt}`, PAGE.margin, PAGE.h - 7);
  doc.text("hauntedx.trade", PAGE.w / 2, PAGE.h - 7, { align: "center" });
  doc.text(`Page ${pageNum} / ${pageCount}`, PAGE.w - PAGE.margin, PAGE.h - 7, {
    align: "right",
  });
}

// ---------- Section title ----------
function sectionTitle(doc, x, y, label) {
  setFill(doc, C.accent);
  doc.rect(x, y - 2.6, 0.9, 3.4, "F");
  setText(doc, C.fg);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(safeStr(label).toUpperCase(), x + 3, y);
}

// ---------- KPI tile ----------
function kpiTile(doc, x, y, w, h, { label, value, sub, color }) {
  card(doc, x, y, w, h, { glow: false });

  setText(doc, C.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(safeStr(label).toUpperCase(), x + 4, y + 5.5);

  setText(doc, color || C.fg);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(safeStr(value), x + 4, y + 13.5);

  if (sub) {
    setText(doc, C.dim);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(safeStr(sub), x + 4, y + 19);
  }
}

// ---------- Hero P&L card ----------
function heroPnl(doc, x, y, w, h, { netPnl, profitPct, currency, totalTrades, winRate }) {
  card(doc, x, y, w, h, { glow: true });

  setText(doc, C.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("NET PROFIT & LOSS", x + 6, y + 7.5);

  const pnlColor = colorForPnl(netPnl);
  setText(doc, pnlColor);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  const pnlText = `${sign(netPnl)}${fmtMoney(netPnl, currency)}`;
  doc.text(pnlText, x + 6, y + 22);

  setText(doc, pnlColor);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`${sign(profitPct)}${fmtPct(profitPct)}`, x + 6, y + 30);

  // right-side mini stats
  const rx = x + w - 60;
  setText(doc, C.muted);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text("TRADES", rx, y + 9);
  doc.text("WIN RATE", rx + 28, y + 9);

  setText(doc, C.fg);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(String(totalTrades || 0), rx, y + 16);
  doc.text(fmtPct(winRate), rx + 28, y + 16);

  // accent underline
  setFill(doc, C.accent);
  doc.rect(x + 6, y + h - 6, 18, 0.6, "F");
}

// ---------- Generic table ----------
function drawTable(doc, x, y, w, columns, rows, { rowHeight = 6.4, headerHeight = 7 } = {}) {
  // Header
  setFill(doc, [28, 33, 48]);
  doc.roundedRect(x, y, w, headerHeight, 1.5, 1.5, "F");
  setText(doc, C.muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  let cx = x + 3;
  for (const col of columns) {
    const cw = col.width;
    const tx = col.align === "right" ? cx + cw - 1.5 : cx + 0.5;
    doc.text(
      safeStr(col.label).toUpperCase(),
      tx,
      y + headerHeight - 2.4,
      { align: col.align || "left" }
    );
    cx += cw;
  }

  // Rows
  let ry = y + headerHeight + 1;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  rows.forEach((row, idx) => {
    // zebra
    if (idx % 2 === 1) {
      setFill(doc, C.cardAlt);
      doc.rect(x, ry - 0.5, w, rowHeight, "F");
    }

    let cellX = x + 3;
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const cell = row[i] || {};
      const text = safeStr(cell.text);
      setText(doc, cell.color || C.fg);
      doc.setFont("helvetica", cell.bold ? "bold" : "normal");
      const tx = col.align === "right" ? cellX + col.width - 1.5 : cellX + 0.5;
      doc.text(text, tx, ry + rowHeight - 2.4, { align: col.align || "left" });
      cellX += col.width;
    }
    ry += rowHeight;
  });

  // bottom rule
  setStroke(doc, C.border);
  doc.setLineWidth(0.2);
  doc.line(x, ry, x + w, ry);
  return ry;
}

// ---------- Summary chip row ----------
function chip(doc, x, y, label, value) {
  const text = `${label}: ${value}`;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  const tw = doc.getTextWidth(text) + 4;
  setFill(doc, [28, 33, 48]);
  doc.roundedRect(x, y - 3.4, tw, 4.8, 1, 1, "F");
  setText(doc, C.muted);
  doc.text(text, x + 2, y - 0.2);
  return tw;
}

// ---------- Page builders ----------
function buildOverview(doc, ctx) {
  const { metrics, currency, accountLabel, filterSummary, generatedAt } = ctx;

  pageHeader(doc, {
    title: "Performance Overview",
    subtitle: accountLabel,
  });

  // Filter chips
  let cx = PAGE.margin;
  const cy = 30;
  for (const [label, val] of filterSummary) {
    const w = chip(doc, cx, cy, label, val);
    cx += w + 2;
    if (cx > PAGE.w - PAGE.margin - 30) break;
  }

  // Hero
  const heroY = 36;
  heroPnl(doc, PAGE.margin, heroY, PAGE.w - PAGE.margin * 2, 38, {
    netPnl: metrics.netPnl,
    profitPct: metrics.profitPct,
    currency,
    totalTrades: metrics.totalTrades,
    winRate: metrics.winRate,
  });

  // KPI grid (4 cols x 2 rows)
  const gridY = heroY + 44;
  const gap = 3;
  const cols = 4;
  const tileW = (PAGE.w - PAGE.margin * 2 - gap * (cols - 1)) / cols;
  const tileH = 24;

  const tiles = [
    { label: "Profit Factor", value: fmtNumber(metrics.profitFactor), color: C.accent2 },
    { label: "Expectancy", value: `${sign(metrics.expectancy)}${fmtMoney(metrics.expectancy, currency)}`, color: colorForPnl(metrics.expectancy) },
    { label: "Avg R:R", value: fmtRR(metrics.avgRR), color: C.fg },
    { label: "Payoff Ratio", value: fmtNumber(metrics.payoffRatio), color: C.fg },
    { label: "Avg Win", value: fmtMoney(metrics.avgWin, currency), color: C.success },
    { label: "Avg Loss", value: fmtMoney(metrics.avgLoss, currency), color: C.danger },
    { label: "Avg Trade", value: `${sign(metrics.avgTrade)}${fmtMoney(metrics.avgTrade, currency)}`, color: colorForPnl(metrics.avgTrade) },
    { label: "Max Drawdown", value: fmtMoney(metrics.maxDrawdown, currency), sub: fmtPct(metrics.maxDrawdownPct), color: C.danger },
  ];

  tiles.forEach((t, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = PAGE.margin + col * (tileW + gap);
    const y = gridY + row * (tileH + gap);
    kpiTile(doc, x, y, tileW, tileH, t);
  });

  // Days & Streaks
  const dsY = gridY + (tileH + gap) * 2 + 6;
  sectionTitle(doc, PAGE.margin, dsY, "Days & Streaks");

  const ds2Y = dsY + 4;
  const dsCols = 4;
  const dsW = (PAGE.w - PAGE.margin * 2 - gap * (dsCols - 1)) / dsCols;
  const dsH = 22;

  const dsTiles = [
    { label: "Trading Days", value: String(metrics.tradingDays || 0), color: C.fg },
    { label: "Green Days", value: String(metrics.greenDays || 0), color: C.success },
    { label: "Red Days", value: String(metrics.redDays || 0), color: C.danger },
    { label: "Win Streak / Loss Streak", value: `${metrics.maxWinStreak || 0} / ${metrics.maxLossStreak || 0}`, color: C.accent2 },
  ];
  dsTiles.forEach((t, i) => {
    const x = PAGE.margin + i * (dsW + gap);
    kpiTile(doc, x, ds2Y, dsW, dsH, t);
  });

  // Best/Worst day
  const bwY = ds2Y + dsH + 6;
  sectionTitle(doc, PAGE.margin, bwY, "Best & Worst Day");
  const bw2Y = bwY + 4;
  const bwW = (PAGE.w - PAGE.margin * 2 - gap) / 2;
  const bwH = 22;

  kpiTile(doc, PAGE.margin, bw2Y, bwW, bwH, {
    label: "Best Day",
    value: `${sign(metrics.bestDay?.pnl)}${fmtMoney(metrics.bestDay?.pnl, currency)}`,
    sub: metrics.bestDay?.date || "-",
    color: C.success,
  });
  kpiTile(doc, PAGE.margin + bwW + gap, bw2Y, bwW, bwH, {
    label: "Worst Day",
    value: `${sign(metrics.worstDay?.pnl)}${fmtMoney(metrics.worstDay?.pnl, currency)}`,
    sub: metrics.worstDay?.date || "-",
    color: C.danger,
  });

  // Long vs Short comparison
  const lsY = bw2Y + bwH + 6;
  sectionTitle(doc, PAGE.margin, lsY, "Long vs Short");
  const ls2Y = lsY + 4;
  const lsW = (PAGE.w - PAGE.margin * 2 - gap) / 2;
  const lsH = 26;

  card(doc, PAGE.margin, ls2Y, lsW, lsH);
  setText(doc, C.accent2);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("LONG", PAGE.margin + 4, ls2Y + 6);
  setText(doc, C.muted);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text(`Trades: ${metrics.longStats?.trades || 0}`, PAGE.margin + 4, ls2Y + 12);
  doc.text(`Win Rate: ${fmtPct(metrics.longStats?.winRate)}`, PAGE.margin + 4, ls2Y + 17);
  setText(doc, colorForPnl(metrics.longStats?.pnl));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(
    `${sign(metrics.longStats?.pnl)}${fmtMoney(metrics.longStats?.pnl, currency)}`,
    PAGE.margin + lsW - 4,
    ls2Y + 12,
    { align: "right" }
  );

  card(doc, PAGE.margin + lsW + gap, ls2Y, lsW, lsH);
  setText(doc, C.warning);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("SHORT", PAGE.margin + lsW + gap + 4, ls2Y + 6);
  setText(doc, C.muted);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text(`Trades: ${metrics.shortStats?.trades || 0}`, PAGE.margin + lsW + gap + 4, ls2Y + 12);
  doc.text(`Win Rate: ${fmtPct(metrics.shortStats?.winRate)}`, PAGE.margin + lsW + gap + 4, ls2Y + 17);
  setText(doc, colorForPnl(metrics.shortStats?.pnl));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(
    `${sign(metrics.shortStats?.pnl)}${fmtMoney(metrics.shortStats?.pnl, currency)}`,
    PAGE.margin + lsW * 2 + gap - 4,
    ls2Y + 12,
    { align: "right" }
  );
}

function buildEquityChart(doc, ctx) {
  const { metrics, currency } = ctx;
  pageHeader(doc, {
    title: "Equity Curve & Daily P&L",
    subtitle: ctx.accountLabel,
  });

  // Equity curve
  sectionTitle(doc, PAGE.margin, 30, "Equity Curve");
  const ecX = PAGE.margin;
  const ecY = 34;
  const ecW = PAGE.w - PAGE.margin * 2;
  const ecH = 90;
  card(doc, ecX, ecY, ecW, ecH, { glow: true });

  drawLineChart(doc, {
    x: ecX + 8,
    y: ecY + 8,
    w: ecW - 16,
    h: ecH - 16,
    points: (metrics.equityPoints || []).map((p) => Number(p?.equity ?? p?.value ?? 0)),
    fill: true,
    color: C.accent,
    fillColor: [41, 98, 255, 0.18],
    yLabelFmt: (v) => fmtMoney(v, currency),
  });

  // Daily PnL bars
  sectionTitle(doc, PAGE.margin, ecY + ecH + 9, "Daily P&L (last 60 days)");
  const dpX = PAGE.margin;
  const dpY = ecY + ecH + 13;
  const dpW = PAGE.w - PAGE.margin * 2;
  const dpH = 80;
  card(doc, dpX, dpY, dpW, dpH);

  const series = (metrics.dailyPnL || []).slice(-60).map((d) => Number(d?.pnl || 0));
  drawBarChart(doc, {
    x: dpX + 8,
    y: dpY + 8,
    w: dpW - 16,
    h: dpH - 16,
    values: series,
    posColor: C.success,
    negColor: C.danger,
  });
}

// ---------- Mini chart helpers ----------
function drawLineChart(doc, { x, y, w, h, points, color, fill, fillColor, yLabelFmt }) {
  if (!points || points.length === 0) {
    setText(doc, C.muted);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.text("No data", x + w / 2, y + h / 2, { align: "center" });
    return;
  }

  let min = Math.min(...points);
  let max = Math.max(...points);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const range = max - min;

  // grid
  setStroke(doc, [28, 33, 48]);
  doc.setLineWidth(0.15);
  for (let i = 0; i <= 4; i++) {
    const gy = y + (h * i) / 4;
    doc.line(x, gy, x + w, gy);
  }
  // y labels
  setText(doc, C.dim);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  for (let i = 0; i <= 4; i++) {
    const v = max - (range * i) / 4;
    const gy = y + (h * i) / 4;
    doc.text(yLabelFmt ? yLabelFmt(v) : fmtNumber(v, 0), x - 1.5, gy + 1.5, {
      align: "right",
    });
  }

  // Build path
  const stepX = points.length > 1 ? w / (points.length - 1) : w;
  const ptsXY = points.map((p, i) => [
    x + i * stepX,
    y + h - ((p - min) / range) * h,
  ]);

  // Soft fill: vertical hairlines from each point down to baseline
  if (fill && fillColor && ptsXY.length > 1) {
    try { doc.setGState(new doc.GState({ opacity: 0.12 })); } catch (_) {}
    setStroke(doc, fillColor.slice(0, 3));
    doc.setLineWidth(Math.max(0.4, w / Math.max(ptsXY.length, 1)));
    for (const [px, py] of ptsXY) {
      doc.line(px, py, px, y + h);
    }
    try { doc.setGState(new doc.GState({ opacity: 1 })); } catch (_) {}
  }

  // Line
  setStroke(doc, color);
  doc.setLineWidth(0.6);
  for (let i = 1; i < ptsXY.length; i++) {
    doc.line(ptsXY[i - 1][0], ptsXY[i - 1][1], ptsXY[i][0], ptsXY[i][1]);
  }
}

function drawBarChart(doc, { x, y, w, h, values, posColor, negColor }) {
  if (!values || values.length === 0) {
    setText(doc, C.muted);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.text("No data", x + w / 2, y + h / 2, { align: "center" });
    return;
  }
  const absMax = Math.max(1, ...values.map((v) => Math.abs(v)));
  const zeroY = y + h / 2;
  const barW = Math.max(0.6, w / values.length - 0.4);
  // zero line
  setStroke(doc, C.border);
  doc.setLineWidth(0.2);
  doc.line(x, zeroY, x + w, zeroY);

  values.forEach((v, i) => {
    const bx = x + i * (w / values.length);
    const bh = ((Math.abs(v) / absMax) * h) / 2;
    if (v >= 0) {
      setFill(doc, posColor);
      doc.rect(bx, zeroY - bh, barW, bh, "F");
    } else {
      setFill(doc, negColor);
      doc.rect(bx, zeroY, barW, bh, "F");
    }
  });
}

// ---------- Breakdown page ----------
function buildBreakdowns(doc, ctx) {
  const { metrics, currency } = ctx;
  pageHeader(doc, {
    title: "Performance Breakdowns",
    subtitle: ctx.accountLabel,
  });

  const fullW = PAGE.w - PAGE.margin * 2;
  const cols = [
    { label: "Name", width: fullW * 0.32, align: "left" },
    { label: "Trades", width: fullW * 0.12, align: "right" },
    { label: "Win Rate", width: fullW * 0.14, align: "right" },
    { label: "Net P&L", width: fullW * 0.18, align: "right" },
    { label: "Avg R:R", width: fullW * 0.12, align: "right" },
    { label: "Profit Factor", width: fullW * 0.12, align: "right" },
  ];

  const sections = [
    { title: "By Symbol", rows: metrics.breakdowns?.byPair || [] },
    { title: "By Session", rows: metrics.breakdowns?.bySession || [] },
    { title: "By Weekday", rows: metrics.breakdowns?.byWeekday || [] },
  ];

  let cy = 30;
  for (const sec of sections) {
    if (cy > PAGE.h - 40) {
      doc.addPage();
      pageHeader(doc, { title: "Performance Breakdowns (cont.)", subtitle: ctx.accountLabel });
      cy = 30;
    }
    sectionTitle(doc, PAGE.margin, cy, sec.title);
    cy += 4;
    const top = (sec.rows || [])
      .slice()
      .sort((a, b) => clampNum(b?.pnl) - clampNum(a?.pnl))
      .slice(0, 8);

    if (top.length === 0) {
      setText(doc, C.muted);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.text("No data for this period.", PAGE.margin, cy + 4);
      cy += 10;
      continue;
    }

    const rows = top.map((r) => [
      { text: r?.name || r?.label || "-" },
      { text: String(r?.trades || 0), align: "right" },
      { text: fmtPct(r?.winRate), align: "right" },
      {
        text: `${sign(r?.pnl)}${fmtMoney(r?.pnl, currency)}`,
        color: colorForPnl(r?.pnl),
        bold: true,
        align: "right",
      },
      { text: fmtRR(r?.avgRR), align: "right" },
      { text: fmtNumber(r?.profitFactor), align: "right" },
    ]);

    cy = drawTable(doc, PAGE.margin, cy, fullW, cols, rows);
    cy += 8;
  }
}

// ---------- Insights page ----------
function buildInsights(doc, ctx) {
  const { metrics } = ctx;
  pageHeader(doc, {
    title: "Smart Insights & Consistency",
    subtitle: ctx.accountLabel,
  });

  // Consistency score card
  const csY = 30;
  card(doc, PAGE.margin, csY, PAGE.w - PAGE.margin * 2, 26, { glow: true });
  setText(doc, C.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("CONSISTENCY SCORE", PAGE.margin + 6, csY + 7);

  const score = clampNum(metrics.consistencyScore);
  setText(doc, score >= 70 ? C.success : score >= 40 ? C.warning : C.danger);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text(`${Math.round(score)}/100`, PAGE.margin + 6, csY + 20);

  setText(doc, C.fg);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    safeStr(metrics.consistencyLabel || ""),
    PAGE.w - PAGE.margin - 6,
    csY + 14,
    { align: "right" }
  );

  // Score bar
  const sbX = PAGE.margin + 6;
  const sbY = csY + 22;
  const sbW = PAGE.w - PAGE.margin * 2 - 12;
  setFill(doc, [28, 33, 48]);
  doc.roundedRect(sbX, sbY, sbW, 1.6, 0.8, 0.8, "F");
  setFill(doc, score >= 70 ? C.success : score >= 40 ? C.warning : C.danger);
  doc.roundedRect(sbX, sbY, (sbW * Math.max(0, Math.min(100, score))) / 100, 1.6, 0.8, 0.8, "F");

  // Insights list
  const insY = csY + 32;
  sectionTitle(doc, PAGE.margin, insY, "Smart Insights");

  const insights = (metrics.insights || []).slice(0, 8);
  let iy = insY + 6;
  if (insights.length === 0) {
    setText(doc, C.muted);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.text("Not enough data yet to generate insights.", PAGE.margin, iy);
    return;
  }

  for (const ins of insights) {
    const tone = ins?.type || ins?.severity || "info";
    const toneColor =
      tone === "positive" || tone === "success"
        ? C.success
        : tone === "negative" || tone === "warning" || tone === "danger"
        ? C.danger
        : C.accent2;

    const cardW = PAGE.w - PAGE.margin * 2;
    const cardH = 16;
    if (iy + cardH > PAGE.h - 16) break;

    card(doc, PAGE.margin, iy, cardW, cardH);
    setFill(doc, toneColor);
    doc.rect(PAGE.margin, iy, 1.4, cardH, "F");

    setText(doc, C.fg);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(safeStr(ins?.title || ins?.label || "Insight"), PAGE.margin + 5, iy + 6);

    setText(doc, C.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const desc = safeStr(ins?.description || ins?.message || ins?.text || "");
    const wrapped = doc.splitTextToSize(desc, cardW - 10);
    doc.text(wrapped.slice(0, 2), PAGE.margin + 5, iy + 10.5);

    iy += cardH + 3;
  }
}

// ---------- Public API ----------
export async function exportDashboardPDF({
  metrics,
  accounts = [],
  selectedAccounts = [],
  filters = {},
  currency = "$",
  filename,
} = {}) {
  if (!metrics) throw new Error("exportDashboardPDF: metrics required");

  // Lazy-load jsPDF so it stays out of the main bundle until the user
  // actually exports — keeps initial page weight (and PWA precache) lean.
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });

  const generatedAt = new Date().toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Account label
  let accountLabel = "All Accounts";
  if (selectedAccounts && selectedAccounts.length === 1) {
    const acc = accounts.find((a) => a?.id === selectedAccounts[0]);
    accountLabel = acc?.name ? `Account: ${acc.name}` : "Account";
  } else if (selectedAccounts && selectedAccounts.length > 1) {
    accountLabel = `${selectedAccounts.length} accounts`;
  }

  // Filter chips
  const filterSummary = [];
  if (filters?.datePreset) filterSummary.push(["Period", String(filters.datePreset)]);
  if (filters?.direction && filters.direction !== "all") {
    filterSummary.push(["Direction", String(filters.direction)]);
  }
  if (filters?.selectedPairs?.length) {
    filterSummary.push(["Symbols", `${filters.selectedPairs.length}`]);
  }
  if (filters?.selectedSessions?.length) {
    filterSummary.push(["Sessions", `${filters.selectedSessions.length}`]);
  }
  filterSummary.push(["Generated", generatedAt]);

  const ctx = { metrics, currency, accountLabel, filterSummary, generatedAt };

  // Pages
  buildOverview(doc, ctx);
  doc.addPage();
  buildEquityChart(doc, ctx);
  doc.addPage();
  buildBreakdowns(doc, ctx);
  doc.addPage();
  buildInsights(doc, ctx);

  // Footers (after page count is known)
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    pageFooter(doc, i, pageCount, generatedAt);
  }

  // Filename
  const stamp = new Date().toISOString().slice(0, 10);
  const finalName = filename || `hauntedx-dashboard-${stamp}.pdf`;
  doc.save(finalName);
  return finalName;
}

export default exportDashboardPDF;
