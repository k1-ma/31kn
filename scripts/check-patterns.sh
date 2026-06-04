#!/usr/bin/env bash
#
# Structural guard against reintroducing the v1 anti-patterns Koshyk was
# rebuilt to remove (see CLAUDE.md + docs/ARCHITECTURE.md). Runs in CI and as a
# local pre-commit check. Exits non-zero on the first violation.
#
# It enforces the rules that are *deterministically* clean after the v2
# migration. Stylistic hygiene (console.*, unused vars) is left to ESLint as
# non-blocking warnings — this script only fails on architecture regressions.

set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
report() {
  # $1 = human description, $2 = ripgrep/grep matches (may be multi-line)
  echo "✗ GUARD FAILED — $1"
  echo "$2" | sed 's/^/    /'
  echo
  fail=1
}

# grep wrapper: prints matches (file:line) or nothing. Never aborts the script.
scan() { grep -rnI "$@" 2>/dev/null || true; }

echo "→ check-patterns: scanning for v1 anti-patterns…"

# Rule 3 — the blob sync endpoints are gone; the client must not call them.
m=$(scan -E 'apiJson\(\s*["'"'"']/api/(state|sync)' src)
[ -n "$m" ] && report "client calls the removed /api/state or /api/sync blob endpoints (Rule 3)" "$m"

# Rule 3 — no hand-rolled sync/merge/reconcile layer.
m=$(scan -E '\b(syncDb|useSyncedDb|syncChunked|mergeStates|mergeArraysById|reconcileAccounts|reconcileFooBar)\b' src server)
[ -n "$m" ] && report "custom sync/merge/reconcile tokens reintroduced (Rule 3)" "$m"

# Rule 3 — the IndexedDB blob store was deleted; nothing should import it.
m=$(scan -E '\bidbStorage\b' src server)
[ -n "$m" ] && report "idbStorage (the deleted blob store) is referenced again (Rule 3)" "$m"

# Rule 1 — the single state blob must not creep back into the app layer.
# The legacy table definition in server/db.js and the one-shot backfill script
# are the only sanctioned places that may name it.
m=$(scan -E '\bstate_json\b' server/routes server/services)
[ -n "$m" ] && report "state_json (the v1 blob) used in routes/services (Rule 1)" "$m"

# Rule 4 — read-modify-write of a whole collection back to the server is the
# visible symptom of a blob. Flag spreading an existing collection into a
# request body (e.g. body: JSON.stringify({ transactions: [...prev.transactions] })).
m=$(scan -E 'JSON\.stringify\(\s*\{[^}]*\.\.\.[a-zA-Z_]+\.(wallets|categories|transactions|budgets|goals|recurring|debts)\b' src)
[ -n "$m" ] && report "whole-collection read-modify-write detected (Rule 4)" "$m"

if [ "$fail" -eq 0 ]; then
  echo "✓ check-patterns: clean"
fi
exit "$fail"
