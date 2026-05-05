import { describe, it, expect } from "vitest";
import {
  walletBalance,
  budgetWindow,
  budgetSpent,
  budgetProgress,
  rangeSummary,
  expenseByCategory,
  monthlyCashflow,
  goalProgress,
} from "@/lib/finance/calc.js";

const wallet = (over = {}) => ({
  id: "w1",
  balance_cents: 0,
  currency: "UAH",
  ...over,
});

const tx = (over = {}) => ({
  id: `t_${Math.random()}`,
  type: "expense",
  amount_cents: 100,
  currency: "UAH",
  walletId: "w1",
  date: new Date("2026-01-15").toISOString(),
  ...over,
});

describe("walletBalance", () => {
  it("starts from opening balance", () => {
    expect(walletBalance(wallet({ balance_cents: 5000 }), [])).toBe(5000);
  });

  it("adds income, subtracts expense", () => {
    const balance = walletBalance(wallet({ balance_cents: 1000 }), [
      tx({ type: "income", amount_cents: 500 }),
      tx({ type: "expense", amount_cents: 200 }),
    ]);
    expect(balance).toBe(1300);
  });

  it("transfers move both wallets", () => {
    const w1 = wallet({ id: "w1", balance_cents: 1000 });
    const w2 = wallet({ id: "w2", balance_cents: 0 });
    const txns = [
      tx({ type: "transfer", walletId: "w1", toWalletId: "w2", amount_cents: 300 }),
    ];
    expect(walletBalance(w1, txns)).toBe(700);
    expect(walletBalance(w2, txns)).toBe(300);
  });

  it("ignores soft-deleted transactions", () => {
    const balance = walletBalance(wallet(), [
      tx({ type: "income", amount_cents: 500 }),
      tx({ type: "income", amount_cents: 500, deletedAt: new Date().toISOString() }),
    ]);
    expect(balance).toBe(500);
  });
});

describe("budgetWindow", () => {
  it("monthly window starts on the 1st", () => {
    const { start, end } = budgetWindow({ period: "monthly" }, new Date("2026-03-15"));
    expect(start.slice(0, 10)).toBe("2026-03-01");
    expect(end.slice(0, 10)).toBe("2026-04-01");
  });

  it("yearly window covers Jan 1 → Jan 1", () => {
    const { start, end } = budgetWindow({ period: "yearly" }, new Date("2026-07-04"));
    expect(start.slice(0, 10)).toBe("2026-01-01");
    expect(end.slice(0, 10)).toBe("2027-01-01");
  });

  it("custom period passes through start/end", () => {
    const { start, end } = budgetWindow({
      period: "custom",
      startDate: "2026-01-10",
      endDate: "2026-02-20",
    });
    expect(start).toBe("2026-01-10");
    expect(end).toBe("2026-02-20");
  });
});

describe("budgetSpent + budgetProgress", () => {
  const budget = {
    period: "monthly",
    limit_cents: 10000,
    categoryIds: ["food"],
    currency: "UAH",
  };
  const txns = [
    tx({ amount_cents: 3000, categoryId: "food", date: "2026-03-05" }),
    tx({ amount_cents: 2000, categoryId: "food", date: "2026-03-20" }),
    tx({ amount_cents: 5000, categoryId: "transport", date: "2026-03-12" }),
    tx({ amount_cents: 9999, categoryId: "food", date: "2026-02-28" }),
  ];

  it("only counts in-window expenses for matching categories", () => {
    expect(budgetSpent(budget, txns, new Date("2026-03-10"))).toBe(5000);
  });

  it("progress = spent / limit", () => {
    expect(budgetProgress({ ...budget, limit_cents: 10000, categoryIds: ["food"] }, txns)).toBe(0);
  });
});

describe("rangeSummary", () => {
  it("computes income, expense, net", () => {
    const r = rangeSummary(
      [
        tx({ type: "income", amount_cents: 1000, date: "2026-01-10" }),
        tx({ type: "expense", amount_cents: 600, date: "2026-01-15" }),
        tx({ type: "transfer", amount_cents: 5000, date: "2026-01-15" }),
        tx({ type: "expense", amount_cents: 1000, date: "2025-12-31" }),
      ],
      "2026-01-01",
      "2026-02-01"
    );
    expect(r).toEqual({ income: 1000, expense: 600, net: 400 });
  });
});

describe("expenseByCategory", () => {
  it("groups and sorts descending", () => {
    const cats = [
      { id: "food", name: "Food" },
      { id: "trans", name: "Transport" },
    ];
    const txns = [
      tx({ amount_cents: 100, categoryId: "food", date: "2026-01-10" }),
      tx({ amount_cents: 200, categoryId: "trans", date: "2026-01-12" }),
      tx({ amount_cents: 50, categoryId: "food", date: "2026-01-13" }),
    ];
    const out = expenseByCategory(txns, cats, "2026-01-01", "2026-02-01");
    expect(out[0].category.id).toBe("trans");
    expect(out[0].cents).toBe(200);
    expect(out[1].cents).toBe(150);
  });
});

describe("monthlyCashflow", () => {
  it("returns the requested number of months", () => {
    const out = monthlyCashflow([], 4, new Date("2026-05-15"));
    expect(out).toHaveLength(4);
  });
});

describe("goalProgress", () => {
  it("0 when target is unset", () => {
    expect(goalProgress({})).toBe(0);
  });

  it("clamps to [0, 1]", () => {
    expect(goalProgress({ target_cents: 100, current_cents: 50 })).toBe(0.5);
    expect(goalProgress({ target_cents: 100, current_cents: 200 })).toBe(1);
    expect(goalProgress({ target_cents: 100, current_cents: -50 })).toBe(0);
  });
});
