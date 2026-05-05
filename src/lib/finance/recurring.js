/**
 * Recurring rules: pure helpers for advancing nextRunAt and materializing
 * the next due transaction(s) when the user opens the app.
 */

const MS_DAY = 24 * 60 * 60 * 1000;

/** Add `every` units of `frequency` to a date and return a new Date. */
export function advance(date, frequency, every = 1) {
  const d = new Date(date);
  const n = Math.max(1, Number(every) || 1);
  if (frequency === "daily") d.setDate(d.getDate() + n);
  else if (frequency === "weekly") d.setDate(d.getDate() + 7 * n);
  else if (frequency === "monthly") d.setMonth(d.getMonth() + n);
  else if (frequency === "yearly") d.setFullYear(d.getFullYear() + n);
  return d;
}

/** Return the list of rules whose nextRunAt is in the past (or missing). */
export function dueRules(rules, now = new Date()) {
  const ts = now.getTime();
  return (rules || [])
    .filter((r) => !r.deletedAt && r.active !== false)
    .filter((r) => {
      const next = r.nextRunAt ? new Date(r.nextRunAt).getTime() : 0;
      return !next || next <= ts;
    });
}

/**
 * Build a transaction object from a rule's template, dated at the rule's
 * current nextRunAt (or now). Caller is responsible for upserting it and
 * advancing the rule's nextRunAt.
 */
export function materialize(rule, runAt = new Date()) {
  const tpl = rule.template || {};
  return {
    type: tpl.type,
    amount_cents: tpl.amount_cents,
    currency: tpl.currency,
    walletId: tpl.walletId,
    toWalletId: tpl.toWalletId || null,
    categoryId: tpl.categoryId,
    note: tpl.note || "",
    tags: tpl.tags || [],
    date: new Date(runAt).toISOString(),
    recurringId: rule.id,
  };
}

export { MS_DAY };
