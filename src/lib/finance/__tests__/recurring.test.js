import { describe, it, expect } from "vitest";
import { advance, dueRules, materialize } from "@/lib/finance/recurring.js";

describe("advance", () => {
  it("daily advances by N days", () => {
    expect(advance("2026-01-01", "daily", 3).toISOString().slice(0, 10)).toBe("2026-01-04");
  });
  it("weekly advances by 7N", () => {
    expect(advance("2026-01-01", "weekly", 2).toISOString().slice(0, 10)).toBe("2026-01-15");
  });
  it("monthly advances months", () => {
    expect(advance("2026-01-15", "monthly", 1).toISOString().slice(0, 10)).toBe("2026-02-15");
  });
  it("yearly advances years", () => {
    expect(advance("2026-01-01", "yearly", 1).toISOString().slice(0, 10)).toBe("2027-01-01");
  });
  it("defaults every to 1 even when 0/negative", () => {
    expect(advance("2026-01-01", "daily", 0).toISOString().slice(0, 10)).toBe("2026-01-02");
  });
});

describe("dueRules", () => {
  const past = new Date("2025-01-01").toISOString();
  const future = new Date("2099-01-01").toISOString();
  const now = new Date("2026-06-01");

  it("returns rules with past nextRunAt", () => {
    const rules = [
      { id: "a", nextRunAt: past, active: true },
      { id: "b", nextRunAt: future, active: true },
    ];
    expect(dueRules(rules, now).map((r) => r.id)).toEqual(["a"]);
  });

  it("excludes deleted and inactive rules", () => {
    const rules = [
      { id: "a", nextRunAt: past, active: true, deletedAt: new Date().toISOString() },
      { id: "b", nextRunAt: past, active: false },
      { id: "c", nextRunAt: past, active: true },
    ];
    expect(dueRules(rules, now).map((r) => r.id)).toEqual(["c"]);
  });
});

describe("materialize", () => {
  it("copies template fields and stamps the runAt date", () => {
    const rule = {
      id: "r1",
      template: {
        type: "expense",
        amount_cents: 1500,
        currency: "UAH",
        walletId: "w1",
        categoryId: "c1",
        note: "Netflix",
      },
    };
    const runAt = new Date("2026-04-01T00:00:00Z");
    const out = materialize(rule, runAt);
    expect(out).toMatchObject({
      type: "expense",
      amount_cents: 1500,
      currency: "UAH",
      walletId: "w1",
      categoryId: "c1",
      note: "Netflix",
      recurringId: "r1",
    });
    expect(out.date).toBe("2026-04-01T00:00:00.000Z");
  });
});
