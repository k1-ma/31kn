/**
 * Tiny CSV reader/writer tailored to Koshyk's transaction shape.
 * Accepts the same column set we emit from the export: date, type, amount,
 * currency, wallet, category, note. Returns parsed rows with no validation;
 * callers map names → ids before persisting.
 */

import { toCents } from "@/lib/money.js";

/** Parse RFC4180-ish CSV. Handles quoted commas and "" escaping. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ""));
}

/** Convert a parsed CSV (with header row) to an array of transaction-shaped objects. */
export function csvToTransactions(text, { wallets = [], categories = [] } = {}) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => String(h).trim().toLowerCase());
  const idx = (name) => header.indexOf(name);
  const iDate = idx("date");
  const iType = idx("type");
  const iAmount = idx("amount");
  const iCurrency = idx("currency");
  const iWallet = idx("wallet");
  const iCategory = idx("category");
  const iNote = idx("note");
  const walMap = new Map(wallets.map((w) => [String(w.name || "").toLowerCase(), w]));
  const catMap = new Map(categories.map((c) => [`${c.kind}|${String(c.name || "").toLowerCase()}`, c]));

  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const type = String(row[iType] || "").toLowerCase();
    if (!["income", "expense", "transfer"].includes(type)) continue;
    const amountCents = toCents(row[iAmount]);
    if (amountCents <= 0) continue;
    const wallet = walMap.get(String(row[iWallet] || "").toLowerCase());
    const catKey = `${type === "income" ? "income" : "expense"}|${String(row[iCategory] || "").toLowerCase()}`;
    const category = catMap.get(catKey);
    const date = row[iDate] ? new Date(row[iDate]) : new Date();
    out.push({
      type,
      amount_cents: amountCents,
      currency: row[iCurrency] || wallet?.currency || "UAH",
      walletId: wallet?.id || null,
      categoryId: category?.id || null,
      date: isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
      note: row[iNote] || "",
    });
  }
  return out;
}
