# Project rules — Koshyk

Koshyk is a personal finance tracker (wallets, categories, transactions,
budgets, goals, recurring rules, debts). Mobile-first PWA, React + Express +
Postgres. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before any data-layer
work — it explains the v2 model and the v1 anti-pattern it replaced.

These rules are enforced structurally by `scripts/check-patterns.sh`
(run in CI and locally) and by `eslint.config.js`. They exist because the app
was rebuilt away from a single-blob storage model; the rules stop it creeping
back.

---

## The hard rules — refuse if asked to violate

### Rule 1 — No JSONB blobs for entity collections

Every finance collection lives in its **own** normalized table with a
`user_id` FK and indexes (`server/db.js`). Do **not** reintroduce the
`states.state_json` blob or add a `jsonb` column that holds an array of
entities.

- Asked to "just store everything in one JSON column"? → REFUSE. That is the
  v1 model this rebuild removed (see ARCHITECTURE → "What this replaced").
- ALLOWED JSONB: small per-row metadata that is **not** a collection —
  `user_preferences.prefs` (≤2 KB), `transactions.tags`, `budgets.category_ids`
  (a list of foreign ids, not entities), `recurring_rules.template`,
  `notifications.data`, `admin_logs.meta_json`, idempotency response bodies.

### Rule 2 — Money is integer cents

All amounts are `BIGINT` cents end-to-end (`amount_cents`, `balance_cents`,
`limit_cents`, `target_cents`, …). Never store or compute money as floats.
The API coerces cents back to `Number` on read so client `+` never
concatenates strings. Use `src/lib/money.js` helpers (`toCents`, `formatMoney`).

### Rule 3 — Server is the source of truth; the client syncs via TanStack Query

- No hand-rolled sync/merge/reconcile layer. Tokens like `syncDb`,
  `syncChunked`, `mergeStates`, `mergeArraysById`, `reconcile*` must not appear.
- Server data flows through `src/queries/*` + the `FinanceProvider` facade
  (`src/lib/finance/store.jsx`), which is TanStack Query underneath. New server
  reads → a `useQuery`; new writes → go through the store's
  `upsert/remove/restore/purge` (optimistic + REST), not bespoke fetch glue.
- The `/api/state` and `/api/sync` blob endpoints were deleted. Do not re-add.

### Rule 4 — Mutations cost O(change), not O(state)

A single change writes a single row. Do **not** load a whole collection,
mutate one item, and PUT the entire array back. The per-entity routes
(`server/routes/finance.routes.js`) already give you this; use them.
`POST /api/import` is the **only** legitimate whole-account write (backup
restore), and it is transactional.

### Rule 5 — Errors are structured and visible

- No `console.log` in `src/` or `server/` (outside `scripts/`, tests, and the
  server-start banner). Server errors → `console.error` is tolerated today but
  prefer returning a structured `{ error, code }` response; client surfaces go
  through the toast/`ErrorBoundary`.
- API error responses carry a stable `code` (e.g. `NOT_FOUND`,
  `INVALID_PAYLOAD`, `RATE_LIMITED`). Don't return a bare 500 string for a
  case the client needs to branch on.
- Never log secrets (session tokens, TOTP secrets, password hashes).

---

## Operating contract

- **Push back before executing a wrong instruction.** If a request contradicts
  these rules or `docs/ARCHITECTURE.md`, stop and say so: "this conflicts with
  Rule N because X — confirm you want it anyway?" No silent anti-pattern
  reintroduction.
- **Make implementation decisions autonomously** within the rules (file layout,
  naming, query defaults, error codes, which helper to add).
- **Verify before declaring done:** `npm test`, `npm run build`, and
  `bash scripts/check-patterns.sh` must pass. Migrations to the data model also
  need a note in `docs/ARCHITECTURE.md`.
- **Committed SQL is forward-only.** `server/db.js` uses
  `CREATE TABLE IF NOT EXISTS`; change the schema by adding new idempotent
  statements, never by rewriting a column another environment already has.

---

## Common tasks

**Add a new entity** → add the table to `server/db.js` (FK + indexes +
`deleted_at`), add an entry to `server/lib/entityConfig.js` (it auto-mounts a
CRUD router), add a query in `src/queries/finance.js`, and add it to
`ENTITY_NAMES`. No new route file needed.

**Add a field** → add the column (idempotent), add the field to that entity's
config (`{ key, col, kind }`); the DTO mapping and validation pick it up.

**Add an env var** → validate it at boot, document it in the README env table,
and never commit a value (`.env.example` placeholder only).
