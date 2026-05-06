/**
 * Debts helpers.
 *
 * Settling a debt usually corresponds to a real money movement:
 *   - "I owe X" → I pay X out of a wallet (an EXPENSE)
 *   - "X owes me" → I receive X into a wallet (an INCOME)
 *
 * `transactionForSettle` builds the matching transaction shape (caller
 * still has to upsert it). The category is left null so the user can
 * re-categorize after the fact.
 */

/**
 * @param {{ direction: "owe"|"owed", amount_cents: number, currency: string, counterparty?: string, note?: string, id?: string }} debt
 * @param {{ id: string, currency: string }} wallet
 * @param {Date|string} [when]
 * @returns {{ type: "expense"|"income", amount_cents: number, currency: string, walletId: string, categoryId: null, date: string, note: string, debtId: string|null }}
 */
export function transactionForSettle(debt, wallet, when = new Date()) {
  if (!debt || !wallet) throw new Error("debt + wallet required");
  return {
    type: debt.direction === "owe" ? "expense" : "income",
    amount_cents: Number(debt.amount_cents) || 0,
    currency: wallet.currency || debt.currency,
    walletId: wallet.id,
    categoryId: null,
    date: new Date(when).toISOString(),
    note: [debt.counterparty, debt.note].filter(Boolean).join(" · ").slice(0, 200),
    debtId: debt.id || null,
  };
}
