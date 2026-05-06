import { describe, it, expect } from "vitest";
import { buildBackup, parseBackup, BACKUP_VERSION, COLLECTIONS } from "@/lib/finance/backup.js";

const sampleState = {
  prefs: { baseCurrency: "UAH", theme: "system" },
  wallets: [{ id: "w1", name: "Cash" }],
  categories: [{ id: "c1", name: "Food", kind: "expense" }],
  transactions: [{ id: "t1", type: "expense", amount_cents: 100 }],
  budgets: [],
  goals: [],
  recurring: [],
  debts: [],
};

describe("buildBackup", () => {
  it("emits a meta header with the current version", () => {
    const out = buildBackup(sampleState);
    expect(out.meta.version).toBe(BACKUP_VERSION);
    expect(out.meta.app).toBe("koshyk");
    expect(out.meta.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("includes every collection even when missing on input", () => {
    const out = buildBackup({});
    for (const c of COLLECTIONS) expect(Array.isArray(out[c])).toBe(true);
    expect(out.prefs).toEqual({});
  });

  it("preserves prefs and arrays", () => {
    const out = buildBackup(sampleState);
    expect(out.prefs).toEqual(sampleState.prefs);
    expect(out.wallets).toEqual(sampleState.wallets);
    expect(out.transactions).toEqual(sampleState.transactions);
  });
});

describe("parseBackup", () => {
  it("rejects malformed JSON", () => {
    expect(() => parseBackup("{")).toThrow(/Invalid JSON/);
  });

  it("rejects backups from a different app", () => {
    const txt = JSON.stringify({ meta: { app: "other" } });
    expect(() => parseBackup(txt)).toThrow(/Not a Koshyk/);
  });

  it("rejects newer-version backups", () => {
    const txt = JSON.stringify({ meta: { app: "koshyk", version: BACKUP_VERSION + 1 } });
    expect(() => parseBackup(txt)).toThrow(/version too new/);
  });

  it("round-trips a buildBackup payload", () => {
    const txt = JSON.stringify(buildBackup(sampleState));
    const restored = parseBackup(txt);
    expect(restored.prefs).toEqual(sampleState.prefs);
    expect(restored.transactions).toEqual(sampleState.transactions);
    for (const c of COLLECTIONS) expect(Array.isArray(restored[c])).toBe(true);
  });

  it("falls back to empty arrays for missing collections", () => {
    const txt = JSON.stringify({ meta: { app: "koshyk", version: 1 }, transactions: [{ id: "x" }] });
    const restored = parseBackup(txt);
    expect(restored.transactions).toHaveLength(1);
    expect(restored.wallets).toEqual([]);
  });
});
