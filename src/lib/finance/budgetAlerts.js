/**
 * Compute which budget alerts should fire right now.
 * Pure helper: takes the budgets list, transactions, and a Set of
 * already-seen alert keys (`${budgetId}:${level}`) and returns the new
 * alerts that haven't been seen yet plus the updated seen-set.
 *
 * Levels:
 *   - "warn"      → spent crossed budget.alertAt% (default 80)
 *   - "exceeded"  → spent crossed 100%
 */

import { active } from "./store.jsx";
import { budgetSpent, budgetWindow } from "./calc.js";

/**
 * @param {Array<object>} budgets
 * @param {Array<object>} transactions
 * @param {Iterable<string>} alreadySeen seen-set passed forward across renders
 * @param {Date} [now=new Date()]
 * @returns {{ alerts: Array<{ key: string, level: "warn"|"exceeded", budget: object, spent: number }>, seen: Set<string> }}
 */
export function computeBudgetAlerts(budgets, transactions, alreadySeen, now = new Date()) {
  const seen = new Set(alreadySeen || []);
  const out = [];
  for (const b of active(budgets)) {
    if (!b.limit_cents || b.limit_cents <= 0) continue;
    // Window-scoped alert key: same budget in a new period gets a fresh chance.
    const window = budgetWindow(b, now);
    const periodKey = `${window.start}:${window.end}`;
    const spent = budgetSpent(b, transactions, now);
    const pct = spent / b.limit_cents;
    const warnAt = (b.alertAt || 80) / 100;

    if (pct >= 1) {
      const key = `${b.id}:${periodKey}:exceeded`;
      if (!seen.has(key)) {
        out.push({ key, level: "exceeded", budget: b, spent });
        seen.add(key);
      }
    } else if (pct >= warnAt) {
      const key = `${b.id}:${periodKey}:warn`;
      if (!seen.has(key)) {
        out.push({ key, level: "warn", budget: b, spent });
        seen.add(key);
      }
    }
  }
  return { alerts: out, seen };
}
