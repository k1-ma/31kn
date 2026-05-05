import { describe, it, expect } from "vitest";
import { computeBudgetAlerts } from "@/lib/finance/budgetAlerts.js";

const tx = (over = {}) => ({
  id: `t_${Math.random()}`,
  type: "expense",
  amount_cents: 0,
  walletId: "w1",
  date: new Date("2026-03-10").toISOString(),
  ...over,
});

const budget = (over = {}) => ({
  id: "b1",
  name: "Food",
  period: "monthly",
  limit_cents: 10000,
  alertAt: 80,
  categoryIds: ["food"],
  ...over,
});

const now = new Date("2026-03-15");

describe("computeBudgetAlerts", () => {
  it("emits no alert below the warn threshold", () => {
    const { alerts } = computeBudgetAlerts(
      [budget()],
      [tx({ amount_cents: 7000, categoryId: "food" })],
      [],
      now
    );
    expect(alerts).toEqual([]);
  });

  it("emits warn at 80% and exceeded at 100%", () => {
    const { alerts: warn } = computeBudgetAlerts(
      [budget()],
      [tx({ amount_cents: 8000, categoryId: "food" })],
      [],
      now
    );
    expect(warn).toHaveLength(1);
    expect(warn[0].level).toBe("warn");

    const { alerts: over } = computeBudgetAlerts(
      [budget()],
      [tx({ amount_cents: 12000, categoryId: "food" })],
      [],
      now
    );
    expect(over).toHaveLength(1);
    expect(over[0].level).toBe("exceeded");
  });

  it("does not re-fire an alert that's already in the seen set", () => {
    const seen = [];
    const first = computeBudgetAlerts(
      [budget()],
      [tx({ amount_cents: 8500, categoryId: "food" })],
      seen,
      now
    );
    expect(first.alerts).toHaveLength(1);

    const second = computeBudgetAlerts(
      [budget()],
      [tx({ amount_cents: 9000, categoryId: "food" })],
      first.seen,
      now
    );
    expect(second.alerts).toHaveLength(0);
  });

  it("ignores soft-deleted budgets and zero limits", () => {
    const { alerts } = computeBudgetAlerts(
      [budget({ deletedAt: new Date().toISOString() }), budget({ id: "b2", limit_cents: 0 })],
      [tx({ amount_cents: 50000, categoryId: "food" })],
      [],
      now
    );
    expect(alerts).toEqual([]);
  });

  it("emits a fresh alert in a new period", () => {
    const seen = [];
    const t1 = new Date("2026-03-15");
    const t2 = new Date("2026-04-15");
    const first = computeBudgetAlerts(
      [budget()],
      [tx({ amount_cents: 12000, categoryId: "food", date: "2026-03-10" })],
      seen,
      t1
    );
    const second = computeBudgetAlerts(
      [budget()],
      [tx({ amount_cents: 12000, categoryId: "food", date: "2026-04-10" })],
      first.seen,
      t2
    );
    expect(second.alerts).toHaveLength(1);
  });
});
