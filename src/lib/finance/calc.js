import { active } from "./store.jsx";

/**
 * Compute a wallet's effective balance: opening balance + all confirmed
 * transactions touching it.
 */
export function walletBalance(wallet, transactions) {
  let total = wallet.balance_cents || 0;
  for (const tx of active(transactions)) {
    if (tx.type === "income" && tx.walletId === wallet.id) {
      total += tx.amount_cents;
    } else if (tx.type === "expense" && tx.walletId === wallet.id) {
      total -= tx.amount_cents;
    } else if (tx.type === "transfer") {
      if (tx.walletId === wallet.id) total -= tx.amount_cents;
      if (tx.toWalletId === wallet.id) total += tx.amount_cents;
    }
  }
  return total;
}

/** Return a {start, end} ISO-string range for a budget at the given anchor date. */
export function budgetWindow(budget, anchor = new Date()) {
  const start = new Date(anchor);
  const end = new Date(anchor);
  if (budget.period === "weekly") {
    const day = start.getDay() || 7; // Mon = 1, Sun = 7
    start.setDate(start.getDate() - (day - 1));
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 7);
  } else if (budget.period === "monthly") {
    start.setDate(1);
    end.setTime(start.getTime());
    end.setMonth(end.getMonth() + 1);
  } else if (budget.period === "yearly") {
    start.setMonth(0, 1);
    end.setTime(start.getTime());
    end.setFullYear(end.getFullYear() + 1);
  } else if (budget.period === "custom") {
    return {
      start: budget.startDate || start.toISOString(),
      end: budget.endDate || end.toISOString(),
    };
  }
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Sum expenses in the budget's category set within its current window. */
export function budgetSpent(budget, transactions, anchor = new Date()) {
  const { start, end } = budgetWindow(budget, anchor);
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const cats = new Set(budget.categoryIds || []);
  let total = 0;
  for (const tx of active(transactions)) {
    if (tx.type !== "expense") continue;
    if (cats.size && !cats.has(tx.categoryId)) continue;
    const ts = new Date(tx.date).getTime();
    if (ts < startMs || ts >= endMs) continue;
    total += tx.amount_cents || 0;
  }
  return total;
}

/** 0..1 progress; >1 means over-budget. */
export function budgetProgress(budget, transactions) {
  const spent = budgetSpent(budget, transactions);
  if (!budget.limit_cents) return 0;
  return spent / budget.limit_cents;
}

/** Aggregate for a date range: income, expense, net. */
export function rangeSummary(transactions, startDate, endDate) {
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  let income = 0;
  let expense = 0;
  for (const tx of active(transactions)) {
    if (tx.type === "transfer") continue;
    const ts = new Date(tx.date).getTime();
    if (ts < startMs || ts >= endMs) continue;
    if (tx.type === "income") income += tx.amount_cents || 0;
    else if (tx.type === "expense") expense += tx.amount_cents || 0;
  }
  return { income, expense, net: income - expense };
}

/** Group expenses by category for a date range. Returns sorted array. */
export function expenseByCategory(transactions, categories, startDate, endDate) {
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const totals = new Map();
  for (const tx of active(transactions)) {
    if (tx.type !== "expense") continue;
    const ts = new Date(tx.date).getTime();
    if (ts < startMs || ts >= endMs) continue;
    totals.set(tx.categoryId, (totals.get(tx.categoryId) || 0) + (tx.amount_cents || 0));
  }
  const catMap = new Map(active(categories).map((c) => [c.id, c]));
  return Array.from(totals.entries())
    .map(([id, cents]) => ({ category: catMap.get(id), cents }))
    .filter((x) => x.category)
    .sort((a, b) => b.cents - a.cents);
}

/** Cash-flow data for the last `n` months, oldest first. */
export function monthlyCashflow(transactions, months = 6, anchor = new Date()) {
  const out = [];
  const cur = new Date(anchor.getFullYear(), anchor.getMonth() - months + 1, 1);
  for (let i = 0; i < months; i++) {
    const start = new Date(cur);
    const end = new Date(cur);
    end.setMonth(end.getMonth() + 1);
    const { income, expense } = rangeSummary(transactions, start.toISOString(), end.toISOString());
    out.push({
      label: start.toLocaleDateString("en-US", { month: "short" }),
      ym: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
      income,
      expense,
      net: income - expense,
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

/** Goal progress 0..1. */
export function goalProgress(goal) {
  if (!goal.target_cents) return 0;
  return Math.max(0, Math.min(1, (goal.current_cents || 0) / goal.target_cents));
}
