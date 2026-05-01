# HauntedX Trade — Sync Reliability Audit

**Working directory:** `/Users/admin/Projects/hauntedx-trade/hauntedx.trade`
**Branch:** `main`
**Audit date:** 2026-05-01
**Scope:** sync reliability — trades that disappear, slow Tiptap saves, leaky sync layer.

> **TL;DR.** Every user mutation (trade create, document edit, account update, tag add, …) results in **a full rewrite of one giant `state_json` JSONB column on a single row** (`states.user_id`), debounced 1.5–3 s and then PUT to `/api/state`. There are essentially no per-entity REST endpoints (Trading Ideas — a separate side-feature — are the only exception). On top of this monolithic-blob model the codebase has accumulated a ~3 000-line custom sync engine (`src/lib/syncDb.js`, `src/lib/syncChunked.js`) with retries, outbox, IDB cache, version vector, server-side merge, tombstone GC, image stripping/restoration, and ten layered `BUG #N` patches. The single most likely cause of "trades disappear / Tiptap fails to save" is the service-worker rule `urlPattern: /\/api\//` with `handler: 'NetworkFirst'` and `networkTimeoutSeconds: 10` (`vite.config.js:53-62`), which intercepts both reads (caching stale state) and writes (10-s timeout against a slow blob-rewrite endpoint). Five other root causes compound it (single-row contention, `pg.Pool({ max: 5 })`, no idempotency, missing per-entity tables, vestigial Vercel artifacts misleading current Railway deploy).

---

## Section 1 — Stack and infrastructure inventory

| Layer | Implementation | Version | File |
|---|---|---|---|
| Frontend framework | React | `^18.3.1` | [package.json:39](package.json#L39) |
| Router | react-router-dom | `^6.26.2` | [package.json:43](package.json#L43) |
| Build tool | Vite | `^5.3.4` | [package.json:55](package.json#L55) |
| Language | **JavaScript** (`.jsx`) — no TypeScript, no `tsconfig.json` | — | (verified: `ls *.ts` empty, no `tsconfig.json`) |
| State management | **React `useState` + custom `useSyncedDb` hook**. No Redux, Zustand, Jotai, MobX. | — | [src/lib/syncDb.js](src/lib/syncDb.js) |
| Data fetching | **Custom `apiJson` wrapper** with retry/backoff over `fetch`. No React Query, no SWR. | — | [src/lib/api.js:41-116](src/lib/api.js#L41-L116) |
| UI library | Tailwind CSS + `lucide-react` icons + custom components in `src/components/ui/`. No shadcn, no MUI, no Radix. | tailwind `^3.4.7`, lucide `^0.474.0` | [package.json:34,53](package.json) |
| Animation | framer-motion | `^11.0.0` | [package.json:30](package.json#L30) |
| Rich-text editor | **Tiptap 3** with StarterKit + Link + Image + Placeholder + TaskList/Item + Underline + Highlight + Table | `@tiptap/react ^3.17.0`, extensions `^3.18.0` | [src/components/common/RichTextEditor.jsx](src/components/common/RichTextEditor.jsx) |
| HTML sanitizer | `dompurify` | `^3.3.1` | [package.json:25](package.json#L25) |
| PWA / SW | `vite-plugin-pwa` (Workbox under the hood), `registerType: 'autoUpdate'` | `^0.21.1` | [vite.config.js:14-86](vite.config.js#L14-L86) |
| Backend framework | Express | `^4.19.2` | [package.json:28](package.json#L28) |
| Node version | engines `>=18.0.0`; `dns.setDefaultResultOrder('ipv4first')` set in [server/db.js:11](server/db.js#L11) | 18+ | [package.json:6-8](package.json#L6-L8) |
| DB driver | `pg` (node-postgres) — **raw SQL**, no Prisma, no Drizzle, no Knex | `^8.13.1` | [server/db.js:3](server/db.js#L3) |
| Schema management | **Hand-written `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE … ADD COLUMN IF NOT EXISTS`** all colocated in one ~1 000-line `initDb()` function | — | [server/db.js:102-1040](server/db.js#L102-L1040) |
| Migration runner | `npm run migrate` → [server/scripts/migrate.js](server/scripts/migrate.js) calls `initDb()`. NOT run on boot in production (`RUN_MIGRATIONS_ON_BOOT` defaults to false). | — | [server/scripts/migrate.js:7](server/scripts/migrate.js#L7) |
| Auth | Hand-rolled session cookies. Signed `tradecrm.sid` HMAC cookie → row in `sessions` table → `req.session = { sid, userId, … }`. **No JWT, no Passport, no express-session.** Bcrypt for password hash, otplib for TOTP. | bcryptjs `^2.4.3`, otplib `^12.0.1` | [server/app.js:137-247](server/app.js#L137-L247), [server/middleware/requireAuth.js](server/middleware/requireAuth.js) |
| File upload | `multer ^2.0.2` for in-process upload; **direct-to-Bunny CDN** path used for video education content (signed PUT URLs) | `^2.0.2` | [package.json:38](package.json#L38), [server/services/bunnyStream.service.js](server/services/bunnyStream.service.js) |
| Email | `resend ^4.0.0` | `^4.0.0` | [server/services/email.service.js](server/services/email.service.js) |
| Monitoring/observability | **NONE.** No Sentry, no winston, no pino, no Datadog, no OpenTelemetry. Confirmed by repo-wide grep. Only `console.log` / `console.warn` / `console.error`, plus hand-rolled JSON-line `logStateOp` / `logSyncOp` helpers. | — | (n/a) |
| Hosting | Long-running Node process. **No `Dockerfile`, no `railway.json`, no `Procfile`** in repo. Railway likely uses Nixpacks autodetection from `package.json` `start` script. | — | [package.json:14](package.json#L14) (`"start": "node server/index.js"`) |

**Vestigial Vercel artifacts that remain in the repo (the user confirmed they are now on Railway):**

- [vercel.json](vercel.json) — rewrites `/api/(.*)` → `/api/index.js` and headers/redirects for shares/tournaments. **Inert on Railway**, but confusing.
- [middleware.js](middleware.js) — Vercel Edge Middleware for canonical-host redirect. **Will not run on Railway.** Same redirect responsibility silently disappears unless a CDN handles it.
- [api/index.js](api/index.js) — wraps `createApp()` for Vercel serverless invocation. Caches via `globalThis.__tradej_app_promise`. Unused on Railway, but `server/app.js:81-97` still has `RUN_SEED_UPDATES` referenced as "for Vercel deploy".
- [api/og-image.js](api/og-image.js) — uses `@vercel/og` (`@vercel/og ^0.9.0` is in `dependencies`). Direct `pg.Pool` inside the file (separate from server pool). Only reachable via Vercel rewrite.
- [api/share-meta.js](api/share-meta.js), [api/tournament-meta.js](api/tournament-meta.js) — ditto, each instantiates its own `pg.Pool`.
- Helpful comments still reference Vercel: `server/app.js:80-81`, [src/lib/syncDb.js:97-99](src/lib/syncDb.js#L97-L99) (`Vercel allows 4.5MB (Hobby) / 6MB (Pro) per request body`).

---

## Section 2 — Repo structure (max depth 4, no `node_modules`/`.git`/`dist`)

```
.
├── api/                        VERCEL-ERA serverless entrypoints (vestigial on Railway)
│   ├── index.js                Wraps server/app.js for serverless
│   ├── og-image.js             OG-image renderer using @vercel/og
│   ├── share-meta.js           Crawler meta-tag generator for /share/:id
│   └── tournament-meta.js      Crawler meta-tag generator for tournaments
├── docs/
│   └── SYNC.md                 Hand-written sync architecture doc (some constants stale; says 800KB chunk threshold, code says 3.5MB)
├── public/                     Static assets, manifest.json, fonts/
│   └── fonts/                  Orbitron + Space Grotesk woff (used by api/og-image.js)
├── server/                     Backend (the production service on Railway)
│   ├── __tests__/              Vitest tests (5 files: data-loss, version-conflict, rate-limit, syncChunked, admin-restore)
│   ├── app.js                  createApp(): Express setup, auth middleware, route mounting, 30-s setInterval voting timer
│   ├── db.js                   initDb(): all CREATE TABLE + ALTER TABLE statements (~1000 lines); createPoolOnly(); pg.Pool max=5
│   ├── index.js                Local/dev runner (calls createApp + app.listen)
│   ├── middleware/
│   │   ├── banGuard.js         IP ban lookup
│   │   ├── ensureDb.js         Lazy DB pool init for /api/* (with skip list)
│   │   ├── metrics.js          Per-request counters into usage_daily
│   │   ├── rateLimitDb.js      Sliding-window in-memory + DB rate limiter
│   │   ├── requireAdmin.js
│   │   └── requireAuth.js
│   ├── routes/
│   │   ├── admin.routes.js     Admin user list, ban/unban, restore state, etc.
│   │   ├── auth.routes.js      Login, register, 2FA, sessions, email verify
│   │   ├── education.routes.js Video metadata + Bunny upload signing
│   │   ├── health.routes.js    /api/health (DB SELECT 1 latency check)
│   │   ├── ideas.routes.js     /api/ideas — only per-entity REST endpoints (uses trading_ideas table)
│   │   ├── notifications.routes.js
│   │   ├── ping.routes.js      /api/ping — used by client heartbeat
│   │   ├── publicShare.routes.js
│   │   ├── state.routes.js     ★ /api/state GET, PUT, POST, PATCH — single-row JSONB read/write
│   │   ├── sync.routes.js      ★ /api/sync/chunk, /api/sync/state-chunk — chunked uploads
│   │   ├── tournaments.routes.js
│   │   └── updates.routes.js   Project changelog + user feedback
│   ├── scripts/
│   │   ├── migrate.js          Runs initDb() — manual migration entry point
│   │   ├── seedUpdates.js      Seeds project_updates table
│   │   └── …
│   ├── services/
│   │   ├── audit.service.js
│   │   ├── auth.service.js
│   │   ├── backup.service.js   Admin DB backup creation
│   │   ├── bunnyStream.service.js
│   │   ├── db.service.js       ensurePool, queryWithRecovery, dbUnavailableResponse
│   │   ├── email.service.js
│   │   ├── notification.service.js
│   │   ├── ratelimit.service.js
│   │   ├── totp.service.js
│   │   ├── tournament.service.js
│   │   ├── tournamentImportExport.service.js
│   │   ├── tournamentScoring.service.js
│   │   └── tournamentVoting.service.js
│   └── utils/                  cookies.js, imageRestore.js, tombstones.js, userScope.js, validators.js
├── src/                        Frontend React app
│   ├── App.jsx                 Router + RequireAuth gates
│   ├── JournalApp.jsx          ★ ~98 KB — main authenticated shell. Calls useSyncedDb(user.id, SEED). Holds 60+ setDb(prev=>…) call-sites for every entity mutation.
│   ├── auth/AuthProvider.jsx   /api/auth/me + login/logout
│   ├── components/             Reusable UI (Header, Modal, Card, Button, …)
│   │   ├── common/             RichTextEditor, ResizableImageExtension, ScrollToTop, ReloadPrompt, InstallPrompt, …
│   │   ├── trades/             TradeForm, etc.
│   │   ├── settings/, dashboard/, analytics/, backtest/, ideas/
│   ├── i18n/
│   ├── lib/                    ★ Sync engine + utilities
│   │   ├── api.js              apiJson with retry/backoff
│   │   ├── syncDb.js           ★ ~116 KB — useSyncedDb hook
│   │   ├── syncChunked.js      ~40 KB — chunking + retry logic for large state
│   │   ├── idbStorage.js       IndexedDB wrapper (BUG #4 fix)
│   │   ├── tombstones.js       isDeleted helper (BUG #6 fix)
│   │   ├── share.js, prop.js, accountCalcs.js, …
│   ├── pages/                  ★ Heavy "god components"
│   │   ├── Trades.jsx          172 KB
│   │   ├── Documents.jsx       78 KB — Tiptap editor host
│   │   ├── Accounts.jsx        169 KB
│   │   ├── Analytics.jsx       90 KB
│   │   ├── Ideas.jsx           24 KB
│   │   ├── PublicShare*.jsx    public-share render pages
│   │   ├── admin/              Admin panel pages
│   │   └── …
│   └── styles/
├── index.html
├── middleware.js               VESTIGIAL Vercel Edge middleware (canonical host redirect)
├── package.json
├── package-lock.json
├── postcss.config.js, tailwind.config.js
├── vercel.json                 VESTIGIAL Vercel config (rewrites, headers)
├── vite.config.js              ★ Service worker config — contains the suspect NetworkFirst rule
├── README.md, README_SETUP.txt
└── NOTIFICATIONS.md, NOTIFICATION_FLOW.md, NOTIFICATION_SUMMARY.md
```

---

## Section 3 — Database schema (reconstructed from `server/db.js:initDb`)

**There are no migration files** — schema is defined inline in [server/db.js](server/db.js) (lines 102–1040), executed only when `npm run migrate` is invoked or `RUN_MIGRATIONS_ON_BOOT=1` is set. All statements use `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, so they're idempotent (and non-locking for the most part — covered in §12).

**There is no Trade table, no Document table, no Account table, no Backtest table, no Tag table, no Symbol table.** Trades, accounts, documents, backtests, libraries.symbols, libraries.sessions, libraries.models, customTags, docFolders, docShares, etc. all live as **arrays inside one JSONB column** — `states.state_json` — keyed by `user_id`. This is the single biggest architectural decision in the codebase and the root cause of the slow saves.

### Tables actually present in Postgres

| Table | Columns of interest | `version` | `deletedAt` (soft-delete) | `createdAt`/`updatedAt` | `userId` index | Notes |
|---|---|---|---|---|---|---|
| `users` | id, username, nickname, email, password_hash, role, role_color, is_disabled, google_id, totp_*, display_name, email_verify_*, pending_email_*, … | — | — | `created_at`, `updated_at` | (PK) | Many `ALTER TABLE ADD COLUMN` migrations stacked over time. |
| `states` | **`user_id` PK, `state_json` JSONB, `updated_at`, `version` BIGINT** | ✅ | (inside JSONB blob, per-item) | `updated_at` | (PK) | **★ Holds the entire user CRM dataset for ~1 500 active users in one row each.** |
| `sessions` | sid PK, user_id, created_at, last_seen_at, ip, ua, expires_at, revoked | — | — | `created_at` | `sessions_user_id_idx` | Hand-rolled session cookies. |
| `admin_logs` | id BIGSERIAL, admin_user_id, action, target_user_id, meta_json, created_at | — | — | `created_at` | — | Admin-only audit. |
| `ip_bans` | id, ip, reason, created_at, expires_at, created_by_admin_id | — | — | `created_at` | `ip_bans_ip_idx`, `ip_bans_expires_idx` | |
| `usage_daily` | day, user_id, ip, requests, bytes_in, bytes_out, total_ms, **PK(day, user_id, ip)** | — | — | `day` | `usage_daily_user_idx` | Per-day aggregates. |
| `rate_limits` | key, action, window_start, count, **PK(key, action, window_start)** | — | — | — | `rate_limits_key_action_idx` | Sliding-window rate limiter store. |
| `ideas` | id, user_id, title, description, category, priority, status, outcome, impact_score, effort_score, links JSONB, tags JSONB, created_at, implemented_at, resolved_at, updated_at | — | — | `created_at`, `updated_at` | `ideas_user_id_idx` | "Project ideas tracker" — distinct from trading_ideas. |
| `trading_ideas` | id, user_id, title, pair, direction, timeframe, status, result, notes_html, notes_text, links JSONB, images JSONB, tags JSONB, linked_trade_ids JSONB, idea_date, model_id, created_at, resolved_at, updated_at | — | — | `created_at`, `updated_at` | `trading_ideas_user_id_idx` | **Only entity with proper REST endpoints. Tiptap saves here go via PATCH `/api/ideas/:id`. notes_html capped at 50 000 chars.** |
| `public_shares` | id (text PK), type CHECK in ('trade','doc','idea','backtest'), user_id, payload JSONB, title, author_name, created_at, expires_at, revoked, views, status (added later) | — | — | `created_at` | `public_shares_user_id_idx`, `public_shares_created_at_idx` | |
| `share_chunks` | share_id, chunk_index, data, created_at, **PK(share_id, chunk_index)** | — | — | `created_at` | — | Temporary storage for chunked share uploads. |
| `admin_backups` | name PK, created_at, size_bytes, format, content BYTEA | — | — | `created_at` | — | Admin DB backups stored *in the DB* as bytea. |
| `project_updates` | id, title, description, category, version, created_at, published_at, is_published, created_by_admin_id | — | — | `created_at` | `project_updates_published_idx` | Admin changelog. |
| `user_feedback` | id, user_id, user_nickname, type, title, description, images JSONB, status, admin_notes, created_at, updated_at, closed_*, last_message_*, admin_read_at | — | — | `created_at`, `updated_at` | `user_feedback_status_idx`, `user_feedback_created_at_idx` | Bug-report ticketing. |
| `feedback_messages` | id, feedback_id (FK user_feedback), sender_role, sender_user_id, message, created_at | — | — | `created_at` | `feedback_messages_feedback_id_idx` | |
| `notifications` | id, user_id, type, data JSONB, read, created_at | — | — | `created_at` | `notifications_user_id_idx`, `notifications_read_idx`, `notifications_created_at_idx` | |
| `login_challenges` | id, user_id, remember, created_at, expires_at | — | — | `created_at` | `login_challenges_user_id_idx`, `login_challenges_expires_idx` | 2FA ticket flow. |
| `backup_codes` | id, user_id, code_hash, created_at, used_at | — | — | `created_at` | `backup_codes_user_id_idx` | 2FA recovery codes. |
| `password_resets` | id, user_id, token UNIQUE, created_at, expires_at, used_at, ip, ua | — | — | `created_at` | `password_resets_user_id_idx`, `password_resets_token_idx`, `password_resets_expires_idx` | |
| `sync_state_sessions` | session_id, user_id, total_chunks, status, created_at, updated_at, expires_at, **PK(session_id, user_id)** | — | — | `created_at`, `updated_at` | `sync_state_sessions_expires_idx` | Tracks in-progress chunked uploads. |
| `sync_state_chunks` | session_id, user_id, chunk_index, chunk_data JSONB, created_at, **UNIQUE(session_id, user_id, chunk_index)** | — | — | `created_at` | `sync_state_chunks_session_idx` | Stores chunk payloads while upload is in progress. |
| `tournaments`, `tournament_tables`, `tournament_participants`, `tournament_rounds`, `tournament_results`, `tournament_public_links`, `tournament_audit_log`, `tournament_points_log`, `tournament_vote_days`, `tournament_vote_assets`, `tournament_default_assets`, `tournament_votes`, `tournament_vote_selections`, `tournament_day_results`, `tournament_day_scores`, `tournament_leaderboard_cache` | (16 tables for the tournament-prediction feature) | — | (via `archived_at` / `status` fields) | `created_at`, `updated_at` | yes (per-tournament) | Properly normalized — does NOT use the JSONB blob model. Big chunk of [server/db.js:594-975](server/db.js#L594-L975). |
| `user_stats_cache` | user_id PK, trades_count, accounts_count, documents_count, updated_at | — | — | `updated_at` | `user_stats_cache_updated_at_idx` | Materialized counter cache to avoid expensive JSONB scans for the admin panel. **Currently never populated by the runtime path** (see Section 9). |

### What this implies for sync reliability
- A trade create/update is **NOT** an `INSERT INTO trades …`. It's a JSON merge in JavaScript followed by a `PUT /api/state` that does `UPDATE states SET state_json = $1, version = version + 1 WHERE user_id = $2`, with `FOR UPDATE` on the row.
- The only foreign-key pressure is the auth/admin/notifications graph; the user CRM data has no DB-level integrity at all.
- Per-row contention is real: multiple tabs of the same user serialize at the row lock; large blobs (3+ months of trades + images) push statement_timeout to 30 s ([server/routes/state.routes.js:46-49](server/routes/state.routes.js#L46-L49), [server/routes/sync.routes.js:32-35](server/routes/sync.routes.js#L32-L35)).
- There is no audit trail of what changed inside `state_json` between versions. "Trade disappeared" is fundamentally undebuggable from server data alone — only `[state.routes]` JSON-line logs and `tradeCount` deltas exist.

---

## Section 4 — Sync layer inventory (per entity)

### Trades (and Accounts, Documents, Backtests, libraries.symbols/sessions/models, customTags, docFolders, docShares)

#### Backend (the entire path)
- **Route file:** [server/routes/state.routes.js](server/routes/state.routes.js) (and [server/routes/sync.routes.js](server/routes/sync.routes.js) for chunked).
- **Endpoints / methods:**
  - `GET /api/state` — returns `{ state, updated_at, version }`. Sets `Cache-Control: no-store` ([state.routes.js:258](server/routes/state.routes.js#L258)). Triggers an async tombstone GC after responding ([state.routes.js:266](server/routes/state.routes.js#L266)).
  - `PUT /api/state` — full replacement with optimistic locking via `expected_version`. ([state.routes.js:512](server/routes/state.routes.js#L512))
  - `POST /api/state` — same handler as PUT, exists because `navigator.sendBeacon()` always sends POST. ([state.routes.js:514](server/routes/state.routes.js#L514))
  - `PATCH /api/state` — partial state with deep-merge. Same lock + `expected_version`. ([state.routes.js:518](server/routes/state.routes.js#L518))
  - `POST /api/sync/chunk` — chunked operations stream (uses `applyOperation` in `applyOperations`). ([sync.routes.js:272](server/routes/sync.routes.js#L272))
  - `POST /api/sync/state-chunk` — chunked full-state stream. ([sync.routes.js:458](server/routes/sync.routes.js#L458))
- **Idempotency check on the handler:** **NO** for `PUT /api/state`. PARTIAL for chunked routes: chunks are idempotent at the chunk level (`UNIQUE(session_id, user_id, chunk_index)` ON CONFLICT DO UPDATE — [sync.routes.js:163-172](server/routes/sync.routes.js#L163-L172)) and operations carry `opId` that is logged but **not deduplicated server-side** (`logSyncOp` records `opIds.slice(0,5)`, the operation is applied unconditionally — [sync.routes.js:361](server/routes/sync.routes.js#L361)).
- **Optimistic concurrency:** ✅ `version` column on `states`. Both PUT and PATCH lock the row (`SELECT … FOR UPDATE`), compare `version` to `expected_version`, and return 409 with `server_state` on mismatch ([state.routes.js:316-336, 561-580](server/routes/state.routes.js#L316-L336)).
- **Audit table:** **NONE for state mutations**. `admin_logs` exists but is admin-action only. `tournament_audit_log` exists for tournaments. Trade/document/account changes are **not** persisted anywhere except by overwriting the JSONB blob.
- **Soft-delete vs hard-delete:** **Soft-delete inside the JSONB**. Each item has `deletedAt: number` set via `isDeleted(item)` checks ([src/lib/tombstones.js](src/lib/tombstones.js), [server/utils/tombstones.js](server/utils/tombstones.js)). Tombstones older than 30 days are GC'd by `gcStateExpiredTombstones()` once per day per user ([state.routes.js:641-756](server/routes/state.routes.js#L641-L756)). The "delete" button never executes a SQL DELETE.
- **Connection pooling:** `pg.Pool({ max: 5, connectionTimeoutMillis: 20_000, idleTimeoutMillis: 30_000, keepAlive: true })` instantiated lazily and stored on `globalThis.__tradej_pool` ([server/db.js:66-90](server/db.js#L66-L90)). Singleton across hot reloads, single instance per Node process. With ~1 500 active users + multi-tab + chunked sync uploads, **`max: 5` is the bottleneck under concurrent saves**. Statement timeout `10 s` set per-connection in `pool.on('connect')`, raised to `30 s` for state writes ([state.routes.js:304](server/routes/state.routes.js#L304), [sync.routes.js:798](server/routes/sync.routes.js#L798)) and reset on release.
- **Transaction usage:** Every state write uses `client.query("BEGIN") … "FOR UPDATE" … INSERT … ON CONFLICT … "COMMIT"` ([state.routes.js:299-505](server/routes/state.routes.js#L299-L505)). Each save acquires a row lock, holds it for the duration of one large JSONB rewrite (potentially many MB and 10+ s), then commits.

#### Server-side data-loss safety net (deserves its own callout)
[state.routes.js:30-46](server/routes/state.routes.js#L30-L46) defines `MIN_RECORDS_FOR_PROTECTION = 10` and `MAX_ACCEPTABLE_DROP_PERCENTAGE = 0.5`. If an incoming PUT would empty the trades array or drop active records >50 %, the server merges the incoming state with the current server state (preferring whichever item has the newer `updatedAt`) instead of accepting the wipe — unless every dropped id has a corresponding tombstone in the incoming state. This logic is **mirrored client-side** in [syncDb.js:1700-1796](src/lib/syncDb.js#L1700-L1796) which can pre-emptively block the sync (`saveToOutbox(…, { code: 'EXCESSIVE_DATA_LOSS_BLOCKED' })`). When the heuristic mis-fires it both blocks the sync and saves to outbox; the user sees "pending" and never knows why. Same logic also lives a third time in [sync.routes.js:660-718](server/routes/sync.routes.js#L660-L718) for the chunked path.

#### Bug found while reading the merge path
[server/routes/state.routes.js:444-456](server/routes/state.routes.js#L444-L456) references `finalTradesCount`, `serverTradesCount`, `finalBacktestsCount`, `serverBacktestsCount` in an `else if` audit-log branch, but **`finalTradesCount` and `serverTradesCount` are never defined in that scope** (only `finalActiveTradesCount` / `serverActiveTradesCount` are defined inside the protective `if` block above). The comparison `finalTradesCount !== serverTradesCount` evaluates to `undefined !== undefined` → `false`, so **the audit log line never fires** for legitimate trade-count changes. Silent: no error, no log.

#### Frontend (mutations)
- **Where mutations live:** All 60+ trade/account/document/backtest mutations are inline `setDb((prev) => …)` calls inside [src/JournalApp.jsx](src/JournalApp.jsx) (90+ KB component). Examples: line 691 (add/update trade), 1159 (delete trade), 1275 (add account), 1365 (update account), 1521-1614 (libraries CRUD). Trade-page-specific mutations live in [src/pages/Trades.jsx](src/pages/Trades.jsx) (172 KB) and call `onUpsertTrade`/`onDeleteTrade` props which trace back to JournalApp's `setDb`.
- **Pattern:** No fetch/axios from components for state mutations. Components mutate the in-memory React state via callbacks (`onUpsertTrade(trade)` etc.) ⇒ JournalApp's `setDb(prev => …)` ⇒ `useSyncedDb` save effect ([syncDb.js:2063](src/lib/syncDb.js#L2063)) ⇒ debounced 1500 ms (or 3000 ms during active edits, [syncDb.js:1159-1160](src/lib/syncDb.js#L1159-L1160)) ⇒ `syncToServer(db)` ⇒ either `apiJson('/api/state', { method: 'PUT', body })` or chunked.
- **Optimistic updates:** ✅ Trivially — local React state updates immediately. There is no separate "pending mutation" concept; the in-memory state is the optimistic update and is also written to localStorage and IDB synchronously ([syncDb.js:208-268](src/lib/syncDb.js#L208-L268)).
- **Rollback on error:** **NO**. On sync failure the local state is kept; a failed sync just records the error to `localStorage[tradecrm:outbox:<userId>]` ([syncDb.js:289-307](src/lib/syncDb.js#L289-L307)). The user retains a UI that "looks saved" but isn't on the server. Status badge shows `"pending"` / `"error"`.
- **Retry logic / backoff:** ✅. Layered retries:
  - `apiJson` retries 503/429/0 with delays `[500, 1000, 2000] ± 25 % jitter`, respects `Retry-After` header on 429 ([api.js:4-115](src/lib/api.js#L4-L115)).
  - Outbox retries with exponential `1 s → 2 s → 4 s → … → 30 s` cap ± 25 % jitter, capped at 20 attempts ([syncDb.js:1166-1172, 2458-2479](src/lib/syncDb.js#L1166-L1172)).
  - Heartbeat ping every 20 s flushes outbox if the server becomes reachable ([syncDb.js:2378-2419](src/lib/syncDb.js#L2378-L2419)).
  - On `online` window event ([syncDb.js:2439](src/lib/syncDb.js#L2439)).
- **Request deduplication / mutation queue:** Partial. `syncInFlight` ref guards against concurrent `syncToServer` ([syncDb.js:1690](src/lib/syncDb.js#L1690)). The "queue" is a single outbox slot per user — newer state always replaces older — so multiple concurrent edits collapse to "the latest state to sync". `flushSync` polls `syncInFlight` for up to 30 s before allowing a fresh sync ([syncDb.js:2552-2561](src/lib/syncDb.js#L2552-L2561)).
- **Idempotency keys in mutation requests:** **NO** for PUT/PATCH `/api/state`. Chunked routes use `sessionId` + `chunkIndex` as the de-facto key.
- **How errors surface to the user:** `lastError = { code, message, status }` exposed by `useSyncedDb`; rendered as a sync-status badge by `useSyncWarning` and `SyncStatusBadge`-style UI in JournalApp. There is **no toast on every failure**; users typically only notice on extended outage.

#### Tiptap document saving specifically

- **File:** [src/components/common/RichTextEditor.jsx](src/components/common/RichTextEditor.jsx) is the editor; consumed by [src/pages/Documents.jsx:907-915](src/pages/Documents.jsx#L907-L915) (and also Trade notes, Idea notes elsewhere).
- **How autosave is triggered:** **There is no autosave.** The editor calls `onChange(html, text)` on every keystroke ([RichTextEditor.jsx:388-392](src/components/common/RichTextEditor.jsx#L388-L392) — `onUpdate` callback), which calls `handleContentChange` ([Documents.jsx:624-632](src/pages/Documents.jsx#L624-L632)) which **only updates local component state** `setEditDoc({…})`. Persistence to the global state (and therefore to localStorage / server) happens **only when the user clicks Save** — `handleSave` / `handleSaveAndClose` / `handleSaveQuiet` ([Documents.jsx:480-498](src/pages/Documents.jsx#L480-L498), called from line 1328, 1379, also implicitly on sub-doc navigation `handleCreateSubDocument:503`, `handleNavigateBack:534`).
  - **Implication:** if the user closes the tab without clicking Save, the in-progress doc edits are lost — `flushOnHide` flushes the *global* `db`, not `editDoc`.
  - **Implication 2:** documents are never autosaved, but the rest of the app's data (trades, accounts) is, so users have inconsistent expectations.
- **What's sent on save:** When the user clicks Save → `setDb` updates `state.documents[i] = updated` → after debounce (1.5–3 s), the **entire `state_json`** is sent — not just the document — via `PUT /api/state` (or chunked if >3.5 MB).
- **Typical save payload size:** A `state_json` for a moderate user (60 trades w/ 2 base64 images each at 200 KB compressed, 10 documents with embedded images) easily reaches 3–10 MB. The chunking threshold is `MAX_SINGLE_REQUEST_SIZE_BYTES = 3.5 * 1024 * 1024` ([syncDb.js:102](src/lib/syncDb.js#L102)) and chunk size `MAX_CHUNK_SIZE_BYTES = 1 * 1024 * 1024` ([syncChunked.js:11](src/lib/syncChunked.js#L11)). Any save on a "normal active user" easily triggers chunked sync.
- **Conflict detection:** ✅ via `expected_version` on PUT and chunked sync ([syncDb.js:1857-1894](src/lib/syncDb.js#L1857-L1894)). Hash/etag is **not** used.
- **Local persistence before send:** ✅ Three layers, executed synchronously *before* the server attempt:
  - localStorage (`tradecrm:user:<userId>`)
  - IndexedDB via `idbStorage.saveWithFallback` (50 MB+ quota — BUG #4 fix)
  - Outbox (`tradecrm:outbox:<userId>`) on failed sync.
- **What happens if the save fails:** `saveToOutbox(userId, state, { code, message })` ([syncDb.js:289](src/lib/syncDb.js#L289)). UI badge → `"pending"` (1 failure) or `"error"` (≥2 in a row). No toast; the user only knows because the badge stays orange. On reconnect (`online` event, heartbeat reachability flip, manual retry button), the outbox flushes — but uses `dbRef.current` (the latest in-memory state) rather than the snapshot in the outbox itself, intentionally to avoid stale resends ([syncDb.js:2048](src/lib/syncDb.js#L2048)). **Net effect:** rich-text edits sit unsynced in localStorage + IDB until something triggers a successful sync. Users who close the tab during the failure window can return on a fresh device and find old content.

### Trading Ideas (the only "real" entity table)

- **Route:** [server/routes/ideas.routes.js](server/routes/ideas.routes.js).
- **Endpoints:** `GET /api/ideas`, `GET /api/ideas/stats`, `POST /api/ideas`, `PATCH /api/ideas/:id`, `DELETE /api/ideas/:id`.
- **Idempotency check:** **NO**. POST creates a fresh row each call; PATCH compares only ownership. No `If-Match` / version column.
- **Optimistic concurrency:** **NO** — no version column on `trading_ideas`.
- **Audit table:** **NO**.
- **Soft-delete:** **NO** — DELETE is a hard `DELETE FROM trading_ideas WHERE id = $1 AND user_id = $2` ([ideas.routes.js:322-323](server/routes/ideas.routes.js#L322-L323)). Inconsistent with the rest of the app.
- **Connection pooling:** Uses the same singleton pool as everything else.
- **Transactions:** ❌ — single-statement queries.
- **Frontend:** [src/lib/api.js:122-145](src/lib/api.js#L122-L145) (`ideasApi.create / update / delete`) called from [src/pages/Ideas.jsx](src/pages/Ideas.jsx). No optimistic update — the page refetches the list after each mutation.
- **Tiptap content sent to this endpoint:** `notes_html` capped at 50 000 chars by `sanitizeTradingIdeaInput` ([ideas.routes.js:40-44](server/routes/ideas.routes.js#L40-L44)). Embedded images count against this — a user pasting a screenshot easily blows the cap and silently loses content.

### Other entities that go through `/api/state`

- **Tags** (`state.libraries.customTags`), **Symbols/Pairs** (`state.libraries.symbols`), **Sessions** (`state.libraries.sessions`), **Models** (`state.libraries.models`), **DocFolders** (`state.docFolders`), **DocShares** (`state.docShares`), **PropTemplates** (`state.propTemplates`), **UI settings** (`state.ui.theme/lang/etc`) — all the same JSONB-array pattern with `setDb((prev) => …)`. No separate endpoint exists for any of them.

### Public Shares

- [server/routes/publicShare.routes.js](server/routes/publicShare.routes.js). Has its own chunked-upload table (`share_chunks`). Soft-revoke via `revoked` boolean. Subject to share-rate-limit (`shareRateLimit`, 10/h). Out of scope for this audit.

### Notifications, Tournaments, Updates/Feedback, Education

These are real per-entity tables with proper REST endpoints. They are independent of the trade/document sync problem and are not in scope.

---

## Section 5 — Service worker / PWA analysis

**File:** [vite.config.js](vite.config.js) (lines 14–86).
The PWA plugin generates a Workbox-precaching service worker on build. `registerType: 'autoUpdate'` means new versions auto-replace via `skipWaiting + clientsClaim`. There is no separate `service-worker.js` source file.

### Runtime caching rules (in order)

| Pattern | Strategy | Cache | Notes |
|---|---|---|---|
| `/api/auth/` | `NetworkOnly` | — | Correct — never cache auth. |
| `/api/state` | `NetworkOnly` | — | **Correctly bypasses cache.** Added at some point as a fix. |
| `/api/` (any other endpoint, including `/api/sync/*`, `/api/ideas/*`, `/api/state-chunk`, `/api/health`, `/api/notifications/*`, `/api/updates/*`, …) | **`NetworkFirst` with `networkTimeoutSeconds: 10`, `maxEntries: 50`, `maxAgeSeconds: 5 * 60`** | `api-cache` | **★ Suspect rule.** See below. |
| Fonts (`woff2/ttf/otf/eot`) | `CacheFirst` | `font-cache` | 1 yr TTL. Fine. |
| Images (`png/jpg/jpeg/svg/gif/webp`) | `CacheFirst` | `image-cache` | 30 days. Fine. |
| `https://hauntedxcdn.b-cdn.net/*` | `CacheFirst` | `cdn-cache` | 7 days. Fine. |

### The suspect `/api/` `NetworkFirst` rule — full analysis

```js
// vite.config.js:53-62
{
  urlPattern: /\/api\//,
  handler: 'NetworkFirst',
  options: {
    cacheName: 'api-cache',
    networkTimeoutSeconds: 10,
    expiration: { maxEntries: 50, maxAgeSeconds: 5 * 60 },
  },
}
```

#### Effect on **mutations** (POST/PUT/PATCH/DELETE to `/api/sync/*`, `/api/ideas/*`, `/api/notifications/*`, …)

- Workbox's `NetworkFirst` strategy runs for **all HTTP methods** that match the regex. The regex matches every non-auth/non-state mutation. (Workbox 6+ does skip caching the *response* of non-GET requests in CacheStorage by default, but it still wraps the request in the strategy's timeout race.)
- The `networkTimeoutSeconds: 10` wraps `fetch(request)` in a `Promise.race` with a 10-s timer. If the server takes longer than 10 s — common for large state writes that hold a row lock and rewrite a multi-MB JSONB column — the strategy resolves with a cache lookup. For non-GET there is no cached response, so it returns `Response.error()`.
- The browser sees the fetch as failed and the client treats it as a network error → outbox → "pending" badge. **The server may have actually committed the write.** On the next fetch, the client's `serverVersion` is stale by one, the outbox retries with the in-memory state, and the server returns 409 → client merges + retries. With contention this can ping-pong.
- This is a strong candidate for "Tiptap rich-text Documents and Ideas often fail to save or save very slowly" because:
  1. Users with many trades + base64 images push individual saves >10 s server-side under pool contention.
  2. The 10-s SW timeout abort is invisible to the user until the badge turns orange.
  3. The chunked sync makes ~5–20 sequential round trips; even one timing out triggers the whole retry cascade.

#### Effect on **reads** (GET `/api/state`, `/api/notifications`, `/api/ideas`)

- `/api/state` is explicitly `NetworkOnly` ([vite.config.js:48-51](vite.config.js#L48-L51)) so it isn't cached.
- But `GET /api/ideas`, `GET /api/notifications`, `GET /api/health`, `GET /api/auth/me` (no — `auth` is excluded), `GET /api/updates`, `GET /api/education`, etc. **are** all in the `api-cache`. The TTL is 5 min, max entries 50.
- Workbox's `NetworkFirst` ignores the `Cache-Control: no-store` header that the server is setting in [server/app.js:257-263](server/app.js#L257-L263). Workbox makes its own cache decisions.
- This is mostly fine for non-state reads, but it adds confusion: stale notifications, stale Idea lists for up to 5 minutes after a network blip.

#### `BackgroundSync` is **not** configured

- No `backgroundSync` plugin, no `Workbox.BackgroundSyncPlugin`, no Background Sync API anywhere. Failed mutations are not replayed by the service worker — only by the application-level outbox in `localStorage`, which only runs while the SPA is open.
- Users who close the browser before a sync finishes have no SW-level recovery; they rely on next-open + outbox retry.

#### Cache invalidation

- No explicit `cache.delete` or version-keyed cache name. `registerType: 'autoUpdate'` rolls the *precached app shell* on each deploy, but the runtime caches (`api-cache`, `image-cache`, `cdn-cache`) survive across deploys until their TTL expires. After a critical fix to a mutation endpoint, users could keep hitting cached failed responses for up to 5 min.

---

## Section 6 — Backend deployment topology

- **Entry point on Railway:** `npm run start` → `node server/index.js` ([package.json:14](package.json#L14)).
- **Boot sequence:** [server/index.js:11-35](server/index.js#L11-L35) imports `createApp()` from `app.js`, awaits it (which calls `ensurePool()` once and registers all routes), then `app.listen(PORT)`. `PORT` defaults to `8080`. In `NODE_ENV=production` it also serves `dist/` as static. The fact that a built SPA is served from the same Node process is the key signal that this is a **long-running monolith on Railway**, not Vercel serverless functions.
- **Long-running confirmed:** `setInterval(processAllTimedVoteDays, 30_000)` in [server/app.js:350-355](server/app.js#L350-L355) and `_cleanupInterval = setInterval(…)` in [server/middleware/rateLimitDb.js:22](server/middleware/rateLimitDb.js#L22) only make sense in a long-running process.
- **Listening port:** `process.env.PORT || 8080` ([server/index.js:11](server/index.js#L11)).
- **Clustering / pm2 / multiple workers:** **NONE.** Single Node process. No `cluster.fork`, no pm2 config, no `WORKER_COUNT`. Railway typically runs a single replica unless you scale; this means the in-memory rate-limit cache and `lastGcByUser` Map are not shared across replicas (they're not used for correctness, just throttling).
- **Memory and CPU expectations:** With JSONB blobs that can reach 50 MB body + Express `express.json({ limit: '50mb' })` ([app.js:131](server/app.js#L131)), each in-flight save can spike to 100+ MB of resident memory (parsed JSON + serialization for `client.query`). With 5 simultaneous saves from `pg.Pool({ max: 5 })`, RSS can briefly exceed 500 MB. This is workable on Railway's 1–2 GB plans but tight.
- **Graceful shutdown:** **NOT IMPLEMENTED.** No `process.on('SIGTERM')`, no `pool.end()` on shutdown, no `app.close()`. Railway sends SIGTERM on deploy; in-flight chunked uploads will be interrupted mid-transaction. Postgres rolls back the transaction, but the client sees a 502/connection reset and surfaces it as a sync error.
- **Vestigial Vercel code present:** `api/index.js` (wraps `createApp` for serverless), `api/og-image.js` (uses `@vercel/og`), `api/share-meta.js`, `api/tournament-meta.js`, `vercel.json`, `middleware.js` (Vercel Edge). The OG-image / share-meta paths previously served social-crawler meta tags via Vercel rewrites; on Railway these routes appear to be **broken** unless an upstream proxy translates `/share/:id` → `api/share-meta.js`. Check Bunny CDN config: it may be doing the rewrite.

---

## Section 7 — Database connection details

- **DATABASE_URL consumption:** First-set-wins among `DATABASE_URL`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING` ([server/db.js:19-26](server/db.js#L19-L26)). The current code does **not** look at the URL to decide pooled-vs-direct — it just passes whatever string to `pg.Pool`.
- **Neon pooler endpoint?** Indeterminate from code; depends entirely on the env var the user set. Recommendation in Section 11.
- **Pool instantiation:** `createPoolOnly()` in [server/db.js:33-90](server/db.js#L33-L90) creates the pool, runs `SELECT 1` health check, stores on `globalThis.__tradej_pool`. Subsequent calls reuse via `if (globalThis.__tradej_pool)`. `ensurePool()` in [server/services/db.service.js:61-101](server/services/db.service.js#L61-L101) wraps it with an in-flight init promise (`globalThis.__tradej_db_init_promise`) so only one creation happens under concurrent boot.
- **Connection limit:** `max: 5` ([server/db.js:68](server/db.js#L68)). **No `?connection_limit=` query parameter** is added to the URL. With Neon's pooled endpoint this would translate to 5 simultaneous PgBouncer-side sessions per Node replica. With ~1 500 active users and chunked sync (15+ writes per save burst), a write burst from a busy user can saturate the pool and starve all other queries.
- **SSL:** Auto-enabled for non-localhost URLs unless `PGSSL_DISABLE=1`. `rejectUnauthorized: false` to accept Neon's chain ([server/db.js:45-47](server/db.js#L45-L47)).
- **Statement timeout:** Set to `10s` (and `idle_in_transaction_session_timeout = '10s'`) per-connection in `pool.on('connect')` ([server/db.js:79-83](server/db.js#L79-L83)). This is a *per-session* setting that resets every time the pool dispenses a connection. Within state writes the handlers raise it to `30s` and reset to `10s` before release ([state.routes.js:304, 503](server/routes/state.routes.js#L304-L503)).
- **Retry logic:** `queryWithRecovery` in [server/services/db.service.js:107-125](server/services/db.service.js#L107-L125) inspects errors against `RESET_ERROR_PATTERNS` (`ECONNRESET`, `ETIMEDOUT`, `Connection terminated`, `server closed the connection unexpectedly`, `connection lost`, `Client has encountered a connection error`), calls `resetPool()`, and retries the query once. Note: **the actual state-write transactions do NOT use `queryWithRecovery`**; they use `pool.connect()` directly ([state.routes.js:300, 545](server/routes/state.routes.js#L300-L545)). Connection drops mid-transaction return a 500 to the client with no automatic retry server-side.
- **Unhealthy-state detection:** `getDbError()` keeps the last init error on `globalThis.__tradej_db_error`; `dbUnavailableResponse()` ([db.service.js:143-169](server/services/db.service.js#L143-L169)) returns it in 503 responses. The DNS-IPv4-first override (`dns.setDefaultResultOrder('ipv4first')`) defends against IPv6-routing flakiness ([server/db.js:11](server/db.js#L11)).
- **Separate connections for transactions:** No — same pool. Long state-write transactions consume one of the `max: 5` slots for the duration of the JSONB rewrite.

---

## Section 8 — Error tracking and observability

- **Sentry:** **Not configured.** No `@sentry/*` in `package.json`, no `Sentry.init`, no DSN env var.
- **Other APMs (Datadog, New Relic, Honeycomb):** **Not configured.**
- **Structured logging libraries:** **None.** No `winston`, no `pino`, no `bunyan`. The codebase uses `console.log/warn/error` exclusively (verified by repo-wide grep).
- **What is logged for mutation failures:** Hand-rolled JSON-line logging in [state.routes.js:19-27](server/routes/state.routes.js#L19-L27) (`logStateOp(op, userId, details)`) and [sync.routes.js:18-26](server/routes/sync.routes.js#L18-L26) (`logSyncOp`). These print one line of JSON per state op (load, save, patch, conflict, merge, tombstone GC, …) including `tradesCount`, `version`, `error?.message`. With 1 500 active users this is fairly noisy; on Railway it ends up in the build logs.
- **Sync success/failure metrics:** **None aggregated.** Per-request metrics are written to `usage_daily` ([server/middleware/metrics.js](server/middleware/metrics.js)) — `requests`, `bytes_in`, `bytes_out`, `total_ms` — but bucketed only by `(day, user_id, ip)`. There is no breakdown of sync success vs failure rate, no histogram of save latency, no count of 409 conflicts, no count of `EXCESSIVE_DATA_LOSS_BLOCKED`, no count of chunked-vs-single saves.
- **Debugging "my trade disappeared" today:** the available trail is:
  1. Search Railway logs for `[state.routes]` / `[sync.routes]` lines containing the user's id.
  2. Compare `tradesCount` across consecutive `op:put` entries.
  3. Check `version` continuity — gaps imply a write from another tab.
  4. Look for `merge_to_prevent_trades_data_loss` / `EXCESSIVE_DATA_LOSS_BLOCKED` lines.
  5. There is **no per-trade audit** — you cannot prove which save dropped a specific trade id.
- **Frontend observability:** There is `[syncDb] …` console output gated behind `IS_DEV` ([syncDb.js:19](src/lib/syncDb.js#L19)) — production users see nothing in their console. The `[TradeJ] Startup diagnostics` line in [src/main.jsx:16-25](src/main.jsx#L16-L25) is the only consistently-on log.
- **Net effect:** when a user reports lost trades, support has very little to go on beyond "let me see your last_known_user_id and Railway log timestamp".

---

## Section 9 — Code smells / red flags

### Pool / connection patterns
- `pg.Pool({ max: 5 })` at [server/db.js:68](server/db.js#L68). Low; with 1 500 active users + chunked sync this is the bottleneck. (Not the "max ≥10" pattern asked about, but the inverse — too low, with no `connection_limit=` URL parameter.)
- Three additional `new pg.Pool()` instances in vestigial Vercel API files: [api/og-image.js:6](api/og-image.js#L6), [api/share-meta.js:5](api/share-meta.js#L5), [api/tournament-meta.js](api/tournament-meta.js). On Railway these never run, but if they did they would each create their own pool — Postgres connections would multiply by 4×.

### React/state patterns
- `useState` storing data that should be in a query cache: **the entire user dataset** lives in one `useState` inside `useSyncedDb` ([syncDb.js:1132](src/lib/syncDb.js#L1132): `const [db, setDb] = useState(seed)`). Re-renders cascade through the whole app on any mutation. (Documented architectural choice, but worth flagging.)
- Direct `fetch` calls inside React components: very few — everything is funnelled through `apiJson`. Exception: [src/lib/api.js:247-260](src/lib/api.js#L247-L260) (`educationApi.adminUpload`) uses raw `fetch` for FormData; reasonable since `apiJson` always JSON-stringifies.
- Heavy "god components" that aren't memoized:
  - `RichTextEditor` is **not wrapped in `React.memo`** ([RichTextEditor.jsx:302](src/components/common/RichTextEditor.jsx#L302) `export default function`). Its `useEditor({ content: value, onUpdate })` plus the outside-controlled `useEffect(() => editor.commands.setContent(value || ''))` ([RichTextEditor.jsx:487-491](src/components/common/RichTextEditor.jsx#L487-L491)) means *any* parent re-render with a new `value` prop forces a full document reset — this loses cursor position and is likely contributing to the "save very slowly" perception.
  - `Trades.jsx` is 172 KB single-component, `Documents.jsx` 78 KB, `Accounts.jsx` 169 KB, `Analytics.jsx` 90 KB. Re-rendering on every `db` change.
- `Tiptap editor not memoized`: confirmed above.
- Missing error boundaries in mutation paths: `ErrorBoundary.jsx` wraps the app shell ([App.jsx:127-130](src/App.jsx#L127-L130)) and `AdminErrorBoundary` for admin. There is **no error boundary specifically wrapping the editor** — a Tiptap render crash takes down the whole tab. (The `ResizableImageExtension` is custom code at [src/components/common/](src/components/common/) — risk surface for unhandled exceptions.)
- Mutations called inside `useEffect` with no cleanup:
  - The save effect in [syncDb.js:2063-2173](src/lib/syncDb.js#L2063-L2173) does have a `clearTimeout` in cleanup. ✅
  - Visibility/pagehide effect in [syncDb.js:2178-2368](src/lib/syncDb.js#L2178-L2368) has cleanup. ✅
  - `setInterval` polls in [src/components/common/NotificationBell.jsx:55](src/components/common/NotificationBell.jsx#L55), [src/components/common/ReloadPrompt.jsx:18](src/components/common/ReloadPrompt.jsx#L18) (30 min), [src/pages/PublicTournamentLeaderboard.jsx:161](src/pages/PublicTournamentLeaderboard.jsx#L161), [src/pages/PublicTournament.jsx:123](src/pages/PublicTournament.jsx#L123), [src/pages/PublicTournamentVote.jsx:44, 101](src/pages/PublicTournamentVote.jsx#L44), [src/pages/admin/AdminFeedback.jsx:484](src/pages/admin/AdminFeedback.jsx#L484), [src/pages/admin/AdminNav.jsx:58](src/pages/admin/AdminNav.jsx#L58) — all do `clearInterval` in their effect cleanup. ✅ No leaks found.
  - Server: `setInterval(processAllTimedVoteDays, 30_000)` at [server/app.js:350](server/app.js#L350) **is never cleared on shutdown** — but since the process dies wholesale on Railway redeploys, this is only a concern for graceful-shutdown SIGTERM handling.
- `localStorage.setItem('token', …)`: **No.** Sessions are httpOnly cookies. localStorage stores `tradecrm:lastKnownUserId` (an integer) and the per-user state cache — no secrets. ✅

### Mutation hygiene
- Mutations that don't await the server response before updating UI: by design — see optimistic update pattern. Failure recovery hinges on outbox + tombstone + version conflict, not on rollback.
- Idempotency keys on mutation endpoints: **NO** for `/api/state`, `/api/ideas/*`. PARTIAL via `sessionId+chunkIndex` for `/api/sync/*`.

### Logging noise
- `console.log/warn/error` counts (server only):
  - `server/routes/tournaments.routes.js`: 72
  - `server/db.js`: 42
  - `server/routes/updates.routes.js`: 33
  - `server/routes/education.routes.js`: 28
  - `server/routes/auth.routes.js`: 28
  - …
  - These run unconditionally in production. JSON-line logs are useful, but free-form `console.error("[trading_ideas] …", error)` is just noise.

### `JSON.parse` without try/catch or validation
- [src/lib/syncDb.js:319, 1234, 1320, 1538, 1573, 1659](src/lib/syncDb.js) — all wrapped in try/catch returning null. ✅
- [src/auth/AuthProvider.jsx](src/auth/AuthProvider.jsx) — none direct.
- Server-side `pool.query` returns parsed JSONB automatically (pg does it). ✅

### TypeScript `any` types in critical paths
- N/A — project is plain JavaScript. No type safety at all between client and server. Any field-name mismatch (e.g. `ideaDate` vs `idea_date`) is silently ignored — see [ideas.routes.js:59-71](server/routes/ideas.routes.js#L59-L71) explicitly handling both casings as a defensive measure.

### Vestigial Vercel-isms
- [vercel.json](vercel.json), [middleware.js](middleware.js), [api/index.js](api/index.js), [api/og-image.js](api/og-image.js), [api/share-meta.js](api/share-meta.js), [api/tournament-meta.js](api/tournament-meta.js), `@vercel/og ^0.9.0` in dependencies, comments referencing "Vercel" in [server/app.js:80-81](server/app.js#L80-L81), [src/lib/syncDb.js:97-99](src/lib/syncDb.js#L97-L99) (`Vercel allows 4.5MB (Hobby) / 6MB (Pro)…`), [api/index.js:31](api/index.js#L31) ("Set DATABASE_URL in Vercel Environment Variables").
- The `MAX_SINGLE_REQUEST_SIZE_BYTES = 3.5 MB` is sized for Vercel Hobby. **On Railway the Express body limit is 50 MB** — this threshold can safely be relaxed by ~10×, eliminating most of the chunked-sync paths.
- [docs/SYNC.md:136](docs/SYNC.md#L136) still claims `MAX_SINGLE_REQUEST_SIZE_BYTES = 800 * 1024` — out of date; the constant is now `3.5 MB`.

### Other concrete bugs found while reading
1. **`finalTradesCount` is undefined** in [server/routes/state.routes.js:444-456](server/routes/state.routes.js#L444-L456) — the audit-log branch silently never fires. Cosmetic but blinds you to legitimate trade-count changes during merge.
2. **`deletedAt` is referenced but undefined** in [src/lib/syncDb.js:584](src/lib/syncDb.js#L584) inside an IS_DEV log line — cosmetic.
3. **`setLastLocalSaveAt` is referenced but undefined** in the version-conflict retry path at [src/lib/syncDb.js:1969](src/lib/syncDb.js#L1969) — `saveToLocalStorageSync(userId, merged, setLastLocalSaveAt)`. The third arg is meant to be the React state setter from `useSyncedDb` but isn't passed in. Probably means the "last local save time" UI doesn't update after a 409-merge resolution.
4. **`finalTradesCount`** related dead code — same as #1.
5. **`user_stats_cache` is created in DB but never updated by the runtime code path** — trace `INSERT INTO user_stats_cache` / `UPDATE user_stats_cache`: only present in admin scripts. Admin counters will be stuck at 0/last manual run.
6. **Vercel-era `RUN_SEED_UPDATES` boot path** in [server/app.js:81-97](server/app.js#L81-L97) runs on every Railway boot if the env var was carried over — could re-seed `project_updates` on every deploy, surprising admins.

---

## Section 10 — The custom `syncDb` / soft sync layer

### Where it lives
- **Definition:** [src/lib/syncDb.js](src/lib/syncDb.js) (~3 000 lines, ~116 KB).
- **Companion:** [src/lib/syncChunked.js](src/lib/syncChunked.js) (~40 KB) for the chunking + image-stripping pipeline.
- **IDB wrapper:** [src/lib/idbStorage.js](src/lib/idbStorage.js) — added in BUG #4 fix to escape localStorage's 5–10 MB quota.
- **Wired into the React tree:** [src/JournalApp.jsx:89](src/JournalApp.jsx#L89): `const { db, setDb, syncStatus, refetch, retrySync, flushSync, setShareInFlight, lastError, hasUnsavedChanges, syncProgress, isReadOnly } = useSyncedDb(user?.id, SEED, { lastKnownUserId });`. Everything below `JournalApp` reads `db` and writes via `setDb((prev) => …)`.

### What it does (honest summary)
Combines, in one ~3 000-line hook:
- **Read-through cache** — IndexedDB → localStorage → server, with a "stale-while-revalidate"-ish merge on initial load.
- **Write-back queue** — localStorage outbox per user, exponential-backoff retry, online/heartbeat triggers.
- **Optimistic updates** — in-memory `db` mutates immediately; localStorage + IDB write synchronously; server is debounced.
- **Optimistic concurrency** — `expected_version` per write; on 409 it re-fetches server state, merges, retries once.
- **Last-writer-wins per item** by `updatedAt`/`createdAt` timestamp inside the `mergeArraysById` / `mergeStates` / `mergeTradesArrays` / `mergeBacktestsArray` family.
- **Tombstone-based deletes** — `deletedAt: number`. Tombstones survive merges (Math.max). Server GC's tombstones >30 days old once/day/user.
- **Image stripping/restoration** — to fit Vercel body limits, oversized chunks have base64 images replaced with `[IMAGE_STRIPPED]` and the server restores them from existing state (and the client re-restores from local). Three places do this.
- **Server-reachability heartbeat** — `pingOnce()` to `/api/ping` every 20 s, with one retry, to detect VPN/DPI blocking that `navigator.onLine` misses.
- **Page-visibility flush** — `flushOnHide` + `syncWithBeacon` on `pagehide` / `visibilitychange:hidden` / `beforeunload` / `pageshow.persisted=true` (bfcache).
- **Race-condition guards** — `syncInFlight`, `shareInFlightRef`, `isResettingRef`, `justLoadedFromServerRef`, `lastSuccessfulSync.current`, plus a 2-s debounced visibility-fetch and a 3-s post-write fetch suppression to dodge CDN read-after-write inconsistency.
- **Schema versioning** — `CURRENT_SCHEMA_VERSION = 1` with a `MIGRATIONS` map for future state-shape changes (BUG #10 fix).

### How it handles network failures
- `apiJson` retries 0/429/503 up to 3× with backoff.
- On terminal failure, `saveToOutbox(userId, state, { code, message })` writes the state to localStorage.
- Status badge shows `pending` (1 fail) / `error` (2+ fails) / `offline` (no network).
- Heartbeat (every 20 s) re-checks `/api/ping`; on success while outbox is non-empty, it flushes — but uses `dbRef.current` (latest in-memory) not the snapshot stored in the outbox.
- `online` window event triggers an immediate flush.
- Manual retry button (`retrySync`) resets backoff and forces an attempt.

### How it handles two tabs on the same entity
- Each tab runs an independent `useSyncedDb`. Two tabs of the same user share localStorage but **not** the React in-memory `db`.
- Tab A saves trade T1 → server `version` becomes 5.
- Tab B saves trade T2 with `expected_version: 4` → server returns 409 with `server_state` ([state.routes.js:316-336](server/routes/state.routes.js#L316-L336)).
- Tab B's client (syncDb.js:1957-2005) merges its in-memory state with the server's, writes the merged state back with `expected_version: 5`. The merge is timestamp-based per-item, so T1 and T2 both survive.
- **Edge case:** Tab B receives a successful server save and updates `serverVersion` in its localStorage. Tab A still believes it's at version 4 because it doesn't subscribe to localStorage changes. On Tab A's next save, it sends `expected_version: 4` against server `version: 6` → 409 → merge. This works but is wasteful — every cross-tab save costs an extra round trip. There's no `BroadcastChannel` / `storage` event listener.
- **No two-tab mutex on the same row** — Postgres `FOR UPDATE` serializes saves but doesn't prevent the wasteful merge dance.

### How it persists state
- **localStorage:** `tradecrm:user:<userId>` (the full state JSON), `tradecrm:lastSynced:<userId>`, `tradecrm:lastLocalSave:<userId>`, `tradecrm:serverVersion:<userId>`, `tradecrm:outbox:<userId>`, `tradecrm:lastKnownUserId`, `tradecrm:syncProgress:<userId>`. Approx 5–10 MB per-user limit before quota errors.
- **IndexedDB:** primary store after BUG #4. Same key (`tradecrm:user:<userId>`). Up to 50 MB+. localStorage save is fired in parallel for legacy compatibility.
- **In-flight mutations on reload:** the outbox survives reload. The save-effect timer does not (it's a `setTimeout`). On reload, `useSyncedDb` re-runs `fetchState` → fetches server → merges with localStorage cache (which contains the unsynced edits) → `hadLocalChanges=true` → status is `pending` and the next debounced save effect sends them. Robust, with the caveats already documented.

### TODO/FIXME inside the sync layer
- Repo-wide grep for `TODO|FIXME|HACK|XXX` in syncDb.js / syncChunked.js / sync.routes.js / state.routes.js returned **no hits**. The author has chosen to embed `BUG #1`–`BUG #10` references in inline comments instead, cross-referenced in [docs/SYNC.md:181-275](docs/SYNC.md#L181-L275). Reading those is essential context: the current code is a heap of independent fixes for ten distinct lost-data scenarios.

### Honest critique
- The sync layer has been patched ten times in response to specific incidents. Each fix introduced new state (`shareInFlightRef`, `serverVersionChanged`, `safeIsInitialLoad`, `justLoadedFromServerRef`, `isResettingRef`, …). The module is now too large to hold in a single mental model.
- The lossy image-stripping pipeline is a workaround for the Vercel-era body-size limit. On Railway it's no longer needed and adds three independent code paths that can drop images.
- The outbox stores the *full state* per user, not individual mutations, so there is no concept of "operation N succeeded, operation N+1 failed". A single failed save means "all changes since the last success are pending."
- Replacement candidates: TanStack Query's `useMutation` with `onMutate`/`onError`/`onSettled`, or a CRDT (Yjs) for the Tiptap content specifically — covered in §11.

---

## Section 11 — Top-10 quick wins (impact / effort / risk)

Ranked by impact-to-effort ratio for **sync reliability**.

| # | Change | Effort | Impact | Risk of breakage | Incrementally deployable? |
|---|---|---|---|---|---|
| 1 | **Service-worker fix:** narrow `urlPattern` from `/\/api\//` to `^/api/(?!auth\|state\|sync\|ideas\|notifications\|updates\|tournaments\|public-share\|admin\|education).*$` and replace `NetworkFirst` with `NetworkOnly` for all mutations. Ideal: split into per-method rules (`method: 'GET'` for `NetworkFirst`, `method: 'POST'/'PUT'/'PATCH'/'DELETE'` for `NetworkOnly`). | **0.5–2 h** | **HIGH** — directly addresses both "saves fail" and "stale data on reopen" complaints. | Low. Worst case a few pages have to refetch on reload. Rollback is one config change. | ✅ Frontend-only deploy. Old SW unregisters automatically via `skipWaiting`. |
| 2 | **Singleton + raise pool size:** change `pg.Pool({ max: 5 })` to `max: 20` and confirm `globalThis` cache survives module reloads. Or: add `?connection_limit=10` to a Neon **pooled** endpoint and bump `max` to 10. The pool is already singleton (`globalThis.__tradej_pool`). | **0.5 h** | **HIGH** — current `max:5` is the bottleneck under chunked-write bursts. | Low if you're already on the Neon pooler endpoint; medium if you're on the direct endpoint and you exhaust Neon connection limits. Verify `pg_stat_activity` count against Neon's plan. | ✅ Server-only. Single restart. |
| 3 | **Switch `DATABASE_URL` to the Neon pooler endpoint** with `?pgbouncer=true&connection_limit=20&pool_timeout=10`. The URL ends in `-pooler.us-east-2.aws.neon.tech:5432` (or your region). Combine with #2. | **0.5 h** | **HIGH** — eliminates per-connection-cost spikes, allows raising `max` safely, faster reconnects from idle. | Low. Pooled endpoints don't support all session-level features; verify the `SET statement_timeout` per-connection still works (it does, pgBouncer transaction mode). | ✅ Env-var change only. |
| 4 | **Add Sentry** (or equivalent) to both client and server, with releases tagged. Wire it into `apiJson` failure path, the outbox-save path, and `syncToServer`'s catch. Server-side wrap `state.routes.js` and `sync.routes.js` handlers. | **2–4 h** | **HIGH** — turns "trades disappear" from anecdote into a measured rate. Without this, every other fix is impossible to verify. | Very low (no behavior change). | ✅ Independent of any other change. |
| 5 | **Drop the SW timeout for mutations** (subset of #1) — even if you keep `NetworkFirst` for reads, remove `networkTimeoutSeconds: 10` for any rule that matches POST/PUT/PATCH/DELETE. The browser already gives the request indefinitely until the server responds. Today's 10-s timeout aborts legitimate slow saves. | **0.5 h** | **HIGH** — stops aborting legitimate slow chunked uploads. | Low. | ✅ |
| 6 | **Add idempotency keys** on PUT/PATCH `/api/state` and `POST /api/ideas`. Client generates `Idempotency-Key: <uuid>` per logical save; server stores `(user_id, key) -> result` for 24 h in a small Postgres table; replays return the cached result. Eliminates the "server saved but client thinks it failed → retries → 409" cascade. | **4–6 h** | **MEDIUM-HIGH** — eliminates wasted retries, helps debug-ability. | Low. Backwards-compatible (header optional). | ✅ Two-step deploy: server first (accepts but doesn't require), then client. |
| 7 | **Per-entity `trades` and `documents` tables** (gradual migration). Start with **just `documents`** since they're the source of the slowest saves: `CREATE TABLE documents (id TEXT PK, user_id INT, type TEXT, title TEXT, content_html TEXT, content_text TEXT, images JSONB, version BIGINT, deleted_at TIMESTAMPTZ, created_at, updated_at)`. Replace `state.documents[]` reads/writes with REST calls to `/api/documents/*`. Keep dual-writes during migration. | **3–5 days** | **VERY HIGH** — directly fixes the "Tiptap saves slowly" complaint by eliminating the multi-MB blob rewrite per keystroke-save. | Medium — risk of dual-write divergence during cutover. Mitigate with `version` on both sides. | ✅ Dual-write phase + read-from-old-blob fallback while you backfill, then flip to new table. |
| 8 | **Bump `MAX_SINGLE_REQUEST_SIZE_BYTES`** from `3.5 MB` (Vercel-era) to `30 MB` (Railway has a 50 MB body limit). Most users would skip the chunked path entirely. Remove the image-stripping fallback. | **0.5 h + 1 h cleanup** | **MEDIUM-HIGH** — eliminates the 5–20 round-trip chunked save for typical users. | Low for the threshold bump. Cleanup of image-stripping is medium risk because it touches the merge path. | ✅ Threshold first, image-stripping cleanup later. |
| 9 | **Replace `[IMAGE_STRIPPED]` placeholders with content-addressed image upload** to Bunny CDN (already in stack). Documents/trades store image URLs (small) instead of base64. Cuts per-state size by 10–100×. Solves payload-size at the source. | **2–3 days** | **VERY HIGH** — long-term fix; obsoletes most of `syncChunked.js`. | Medium — needs a migration of existing base64 images to CDN URLs (background job). | ✅ New uploads go to CDN immediately; backfill in batches. |
| 10 | **Add Yjs to the Tiptap saves** specifically for documents (when #7 is done): each document keeps a Y.Doc, the editor binds to it, and the wire format is the Y update binary diff (small). On the server, store the latest Y.Doc snapshot + an append-only update log. Solves cross-tab and intermittent-network correctness for free. | **5–10 days** | **HIGH** — bullet-proof rich-text saves. | Medium — adds a new dependency surface. | ✅ Roll out per-doc-type; old docs continue to use HTML until you migrate them. |

### Honorable mentions (didn't make top 10)
- **Add `BroadcastChannel` cross-tab listener** so a save in tab A invalidates `serverVersion` in tab B. ~1 h. Eliminates the wasteful merge dance.
- **Replace JSON.parse-of-localStorage with Zod / Valibot validation** (~1 day). Catches schema drift early. Lower-priority because the schema is centralized.
- **Implement graceful shutdown (SIGTERM)** to drain in-flight chunked uploads before Railway redeploys. ~2 h.
- **Hard-delete `trading_ideas` is inconsistent with the rest of the app.** Add `deleted_at` and use soft-delete. ~1 h.
- **Index `states.updated_at`** so admin "users with recent activity" queries don't scan-and-skip. ~5 min.

---

## Section 12 — Migration concerns per quick win

### #1 Service-worker rule narrow (mutations → NetworkOnly)
- **DB migration?** No.
- **Coordinated FE+BE deploy?** No — frontend-only.
- **User re-login / session invalidation?** No.
- **Effect on existing 1 500 users:** new SW activates on next page load via `skipWaiting`. No data implications. The 5-min `api-cache` may still hold one stale GET per endpoint until naturally evicted — bump `cacheName` (e.g. `api-cache-v2`) to force eviction.

### #2 Pool `max: 20`
- **DB migration?** No.
- **Coordinated FE+BE deploy?** No — server-only.
- **User re-login?** No.
- **Effect on existing users:** none until concurrency exceeds 5. Verify Neon's per-database connection limit on your plan can absorb 20× replicas (Railway typically 1 replica → fine).

### #3 Neon pooler URL
- **DB migration?** No (env var change).
- **Coordinated FE+BE deploy?** No.
- **User re-login?** No.
- **Effect on existing users:** zero data effect. Watch for any code that relies on session-level Postgres features (advisory locks, `SET LOCAL` outside a transaction). [server/db.js:79-83](server/db.js#L79-L83) sets `SET statement_timeout` and `idle_in_transaction_session_timeout` — both work in pgBouncer transaction mode.

### #4 Sentry
- **DB migration?** No.
- **Coordinated FE+BE deploy?** Independent — server first, client whenever.
- **User re-login?** No.
- **Effect on existing users:** none beyond a small JS bundle increase (~30 KB gzipped client-side).

### #5 Drop SW mutation timeout
- Subset of #1. Same answers.

### #6 Idempotency keys
- **DB migration?** Yes — small `idempotency_keys` table:
  ```sql
  CREATE TABLE idempotency_keys (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    response JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours',
    PRIMARY KEY (user_id, key)
  );
  ```
  No table lock (new table, idempotent `IF NOT EXISTS`).
- **Coordinated FE+BE deploy?** Two-step recommended: server accepts the header but doesn't require it; release client; observe; then make required.
- **User re-login?** No.
- **Effect on existing users:** none during phase 1.

### #7 Per-entity `documents` table
- **DB migration?** Yes — `CREATE TABLE documents …` + indexes. Backfill via a background job that reads each user's `state.documents` array and inserts. Idempotent on `(user_id, id)`.
- **Coordinated FE+BE deploy?** Yes — strict order:
  1. Create table + write-through code that **dual-writes** (state.documents[] AND documents row). Reads continue from blob.
  2. Backfill existing data in batches of N users.
  3. Flip reads to the new table; keep dual-write for one release.
  4. Stop writing into `state.documents` and remove from the blob (next save naturally drops the field).
- **User re-login?** No.
- **Effect on existing users:** none if dual-write is correct. Monitor with #4 in place. Risk of divergence is real — a server-side reconciler should run nightly during the dual-write phase to detect (state.documents.id) ⊕ (documents.id) drift.
- **Lock risk:** none on the new table. The blob shrinks naturally on next save (no rewrite of existing rows triggered).

### #8 Body-size threshold bump (`3.5 MB → 30 MB`)
- **DB migration?** No.
- **Coordinated FE+BE deploy?** No — client-only constant.
- **User re-login?** No.
- **Effect on existing users:** more single-PUT saves, fewer chunked. Net positive. Watch Railway memory headroom — saves now hold up to 30 MB in memory rather than chunking. With Express `limit: '50mb'` already, server is OK.

### #9 Image-upload-to-CDN
- **DB migration?** Add a `media_assets` table (or reuse Bunny URLs directly inside `images[].url`). Backfill is a background job that reads existing `dataUrl` base64, uploads to Bunny, replaces with URL, and writes the user state.
- **Coordinated FE+BE deploy?** Yes — RichTextEditor's `compressImage` paths and the document's `images[]` schema both change. Plan dual-format support (`{ url } | { dataUrl }`) for at least one release to absorb in-flight saves.
- **User re-login?** No.
- **Effect on existing users:** zero downtime. Older clients that still write `dataUrl` will be back-converted by the server on read or by a one-time backfill.

### #10 Yjs
- **DB migration?** Yes — `document_updates` (append-only) + `document_snapshots` (latest Y.Doc binary). Tables only; no lock risk.
- **Coordinated FE+BE deploy?** Yes — both editor and server need to speak Y updates. Migration of existing HTML → Y.Doc is non-trivial; recommend opt-in flag for new docs first.
- **User re-login?** No.
- **Effect on existing users:** none until they edit a Yjs-enabled doc. Old docs continue to use the existing path until backfilled.

---

## Appendix — Important file:line references

- Single suspect SW rule: [vite.config.js:53-62](vite.config.js#L53-L62)
- pg.Pool max=5 + singleton: [server/db.js:66-90](server/db.js#L66-L90)
- DATABASE_URL resolution order: [server/db.js:19-26](server/db.js#L19-L26)
- The `states` table definition: [server/db.js:128-132](server/db.js#L128-L132)
- `version` column added later: [server/db.js:382-390](server/db.js#L382-L390)
- PUT /api/state with FOR UPDATE + version check: [server/routes/state.routes.js:298-510](server/routes/state.routes.js#L298-L510)
- `finalTradesCount` undefined audit-log bug: [server/routes/state.routes.js:445-456](server/routes/state.routes.js#L445-L456)
- Tombstone GC: [server/routes/state.routes.js:641-756](server/routes/state.routes.js#L641-L756)
- Chunked state-chunk handler with data-loss merge: [server/routes/sync.routes.js:458-788](server/routes/sync.routes.js#L458-L788)
- `useSyncedDb` definition: [src/lib/syncDb.js:1126](src/lib/syncDb.js#L1126)
- Save effect (debounced): [src/lib/syncDb.js:2063-2173](src/lib/syncDb.js#L2063-L2173)
- Visibility/pagehide flush: [src/lib/syncDb.js:2178-2368](src/lib/syncDb.js#L2178-L2368)
- 409 conflict + merge-and-retry: [src/lib/syncDb.js:1957-2005](src/lib/syncDb.js#L1957-L2005)
- Outbox save: [src/lib/syncDb.js:289-307](src/lib/syncDb.js#L289-L307)
- IDB storage: [src/lib/idbStorage.js](src/lib/idbStorage.js)
- Tiptap editor: [src/components/common/RichTextEditor.jsx](src/components/common/RichTextEditor.jsx)
- Document save handler: [src/pages/Documents.jsx:480-498, 1798-1801](src/pages/Documents.jsx#L480-L498)
- Trading Ideas REST endpoints (the only "real" ones): [server/routes/ideas.routes.js](server/routes/ideas.routes.js)
- Vercel artifacts: [vercel.json](vercel.json), [middleware.js](middleware.js), [api/index.js](api/index.js), [api/og-image.js](api/og-image.js), [api/share-meta.js](api/share-meta.js), [api/tournament-meta.js](api/tournament-meta.js)
- The 10 historical bug-fix rationales: [docs/SYNC.md:181-275](docs/SYNC.md#L181-L275)
