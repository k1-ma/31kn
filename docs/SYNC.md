# Sync Architecture

This document describes the synchronization mechanism used to persist user data between the client and server.

## Overview

The TradeJ application uses a **hybrid sync model** combining local-first storage with server synchronization:

1. **Local Storage**: All changes are saved immediately to `localStorage` (synchronously)
2. **Server Sync**: Debounced sync to PostgreSQL via `/api/state` endpoint
3. **Offline Support**: Changes persist locally; outbox queue retries when online

## Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│   Server    │────▶│  PostgreSQL │
│ localStorage│◀────│  /api/state │◀────│   states    │
└─────────────┘     └─────────────┘     └─────────────┘
```

## Chunked Sync

For large payloads (>3MB), the client automatically splits data into smaller chunks:

### When Chunking Occurs

- Total payload exceeds `MAX_SINGLE_REQUEST_SIZE_BYTES` (3MB; defined in `src/lib/syncDb.js`)
- Each chunk is limited to `MAX_CHUNK_SIZE_BYTES` (1MB; defined in `src/lib/syncChunked.js`)

### Chunk Protocol

1. Client creates a unique `sessionId` for the sync session
2. Data is split into chunks with `chunkIndex` and `totalChunks`
3. Each chunk is sent to `/api/sync/state-chunk`
4. Server assembles chunks and applies them transactionally
5. The final chunk triggers the database write

### API Endpoints

#### POST /api/sync/chunk
Receives a chunk of operations for incremental sync.

```json
{
  "sessionId": "uuid",
  "chunkIndex": 0,
  "totalChunks": 5,
  "operations": [
    { "opId": "uuid", "type": "create", "collection": "trades", "entityId": "trade-1", "data": {...} }
  ],
  "isLast": false
}
```

#### POST /api/sync/state-chunk
Receives a chunk of full state data.

```json
{
  "sessionId": "uuid",
  "chunkIndex": 0,
  "totalChunks": 3,
  "chunk": {
    "type": "partialState" | "fullState" | "arrayBatch",
    "data": {...},
    "keys": ["trades", "accounts"]
  },
  "isLast": false
}
```

### Response Format

```json
{
  "ok": true,
  "chunksReceived": 3,
  "totalChunks": 5,
  "status": "receiving" | "complete"
}
```

## Operation Types

The chunked sync supports these operation types:

| Type | Description |
|------|-------------|
| `create` | Add new item to a collection |
| `update` | Update existing item |
| `delete` | Remove item from collection |
| `set` | Replace a top-level key |
| `setBatch` | Partial array update (for large arrays) |

## Deduplication

- Each operation has a unique `opId`
- Each chunk has a unique `chunkIndex` within a session
- Duplicate chunks are accepted idempotently (return success without re-processing)
- Sessions expire after 5 minutes

## Error Handling

### Client-Side

1. **PAYLOAD_TOO_LARGE (413)**: Auto-strips oversized images and retries chunked sync
2. **Network errors**: Saved to outbox, retried automatically
3. **Auth errors**: Marked as unauthorized, manual retry required

### Server-Side

1. **Session mismatch**: Returns 403 if wrong user
2. **Invalid request**: Returns 400 with error code
3. **Database errors**: Returns 500, client retries

## UI Indicators

The sync status is displayed in the UserMenu component:

| Status | Icon | Description |
|--------|------|-------------|
| `saving` | Save (pulsing) / Upload (pulsing) | Syncing to server (shows chunk progress when chunking) |
| `synced` | Check | All changes saved |
| `pending` | Cloud | Changes saved locally |
| `offline` | CloudOff | No network connection |
| `error` | CloudOff (red) | Sync failed |

During chunked sync, the UI shows progress: `"3/12"` (current/total chunks) with an upload icon.

## Configuration

Key constants in `src/lib/syncDb.js`:

```javascript
const MAX_SINGLE_REQUEST_SIZE_BYTES = 800 * 1024;  // 800KB - use chunked above this
const MAX_CHUNK_SIZE_BYTES = 200 * 1024;           // 200KB per chunk
const DEBOUNCE_FAST_MS = 1500;                     // Debounce for single changes
const DEBOUNCE_SLOW_MS = 3000;                     // Debounce during active editing
```

## Performance Tips

1. **Avoid large base64 images**: They bloat the sync payload
2. **Limit inline images**: Use external image hosting when possible
3. **Clean up old data**: Remove unused trades/documents periodically

## Troubleshooting

### "Data too large to sync"

This error no longer blocks sync. The chunked sync pipeline automatically handles
oversized payloads by:

1. Splitting state into 200KB chunks
2. Detecting chunks that exceed the Vercel body limit (4MB)
3. Stripping base64 images from oversized chunks so they can be transmitted
4. Retrying on 413 errors with images stripped

If you notice images missing after sync, the original images were too large to
transmit within Vercel's body size limit. To prevent this:

1. Reduce image quality/size before uploading
2. Limit the number of inline screenshots per trade
3. Use external image hosting when possible

### Sync stuck in "pending"

1. Check network connection
2. Click the retry button
3. Check browser console for errors

### Data not appearing on other devices

1. Wait for sync to complete (check status indicator)
2. Refresh the page on the other device
3. Ensure you're logged into the same account

## Recent Fixes

### BUG #1 — Trades disappear: `isInitialLoad=false` drops server-only items

**Problem:** When `loadedRef.current === true` and `serverVersionChanged === false`, server-only items were silently dropped as "locally deleted." This caused data loss when:
- Another device added a trade while this device was offline
- `localStorage` quota error silently dropped items from cache
- A chunked sync partially wrote some keys server-side but the session expired

**Fix:** Replaced the "drop server-only" heuristic with **tombstone-based deletion only**. An item is now dropped only if local has a tombstone (`deletedAt > 0`) for that id. Added a tombstone GC pass on the server that runs once per day per user, removing tombstones older than 30 days.

### BUG #2 — Backtests disappear after "Share"

**Problem:** Sharing a backtest could trigger a `visibilitychange` event (when the browser tab hangs or the user switches tabs), which caused `fetchState` to overwrite local state with stale server data. The `shareInFlight` guard was not set in `BacktestShareModal`, and large payloads (>64KB) were silently skipped by the beacon sync.

**Fix:**
- `BacktestShareModal` now sets `shareInFlight(true)` before the share call and clears it in `finally` with a 90-second hard timeout
- `flushSync()` is called before every share creation to ensure the server has the latest state
- Large payloads that exceed the 64KB beacon limit now save to the outbox for retry on next page load, instead of being silently dropped

### BUG #3 — "50% drop" guard blocks legitimate bulk deletes but misses actual corruption

**Problem:** `MAX_ACCEPTABLE_DROP_PERCENTAGE = 0.5` compared array lengths (including tombstones), not active records. Users deleting >50% of trades got `EXCESSIVE_DATA_LOSS_BLOCKED` and their sync silently stopped, while actual corruption (records vanishing without tombstones) was sometimes missed because tombstones inflated the array length.

**Fix:**
- Changed the guard to compare **active records only** (`!isDeleted(t)`)
- If all dropped trade IDs have matching tombstones, it's a legitimate delete — allow sync
- If trades vanished without tombstones, it's corruption — block sync and save to outbox
- Both client-side (syncDb.js) and server-side (state.routes.js) guards updated

### BUG #4 — localStorage quota silently corrupts state

**Problem:** On quota exceeded, code removed the `lastSynced` cache and retried. If retry also failed, it logged to console and continued — in-memory state was never flushed anywhere, so on refresh the user lost everything added since last successful write.

**Fix:**
- Added **IndexedDB** as primary state store via `idbStorage.js` (50MB+ default quota)
- `saveToLocalStorageSync` now fires an async IDB save alongside the sync localStorage save
- One-time migration on app init: if localStorage has data and IDB is empty, migrate
- On quota exceeded in both IDB and localStorage: log a critical warning
- Added `compressImageToWebP()` utility for client-side image compression

### BUG #5 — Version counter races let newer device overwrite older device's unsynced work

**Problem:** `expected_version` was deliberately not sent. On concurrent edits from two devices, last write wins — device B could overwrite device A's unsynced trades.

**Fix:**
- Client now sends `expected_version` with every PUT and chunked sync
- Server returns 409 with `VERSION_CONFLICT` code and the current server state
- Client handles 409 by fetching server state, merging locally, and retrying once
- Chunked sync: first chunk sends `expected_version`; subsequent chunks inherit the session

### BUG #6 — `isDeleted` check is inconsistent across client and server

**Problem:** `isDeleted` requires `deletedAt > 0`, but multiple places used `if (t.deletedAt)` (truthy check) which treats `deletedAt: 0` differently from `deletedAt: "0"`. Inconsistency caused some views to show deleted trades.

**Fix:**
- Created shared `isDeleted` module: `src/lib/tombstones.js` (client) + `server/utils/tombstones.js` (server)
- Replaced all ad-hoc `.deletedAt` truthy checks with `isDeleted()` across the codebase
- Files updated: syncDb.js, JournalApp.jsx, prop.js, Documents.jsx, Accounts.jsx, SmartInsights.jsx, CreateSymbolModal.jsx, state.routes.js, sync.routes.js

### BUG #7 — `visibility:visible` fetch can race with in-flight debounced sync

**Problem:** If a write completed just before `visibilitychange` fired, the fetch could return stale data from a CDN edge cache or read replica, overwriting the just-written data.

**Fix:**
- Track `lastSuccessfulSync.current` timestamp (already existed)
- Skip visibility fetch if tab became visible within 3 seconds of a successful write
- Added `Cache-Control: no-store` to `GET /api/state` response to prevent CDN caching

### BUG #8 — Chunked share has no cleanup on client error mid-upload

**Problem:** Failed chunked uploads left orphaned "pending" shares + chunks in the DB. With 1-hour TTL, DB bloat accumulated quickly under repeated failures.

**Fix:**
- Client: wrapped chunked upload in try/catch that calls `DELETE /api/public-share/chunked/:shareId/abort` on failure
- Server: added abort endpoint that deletes the pending row + chunks immediately
- Reduced `PENDING_SHARE_TTL_MS` from 1 hour to 10 minutes

### BUG #9 — No per-user write rate limit

**Problem:** One runaway client could spam the DB with unlimited writes to `/api/state`, `/api/sync/*`, and `/api/public-share`.

**Fix:**
- Implemented `SlidingWindowRateLimiter` in `server/middleware/rateLimitDb.js`
- Applied `writeRateLimit` (60 writes/min per user) to `/api/state` and `/api/sync`
- Applied `shareRateLimit` (10 shares/hour per user) to `/api/public-share`
- Returns 429 with `Retry-After` header; client respects it and backs off
- Client `api.js` updated to treat 429 as retryable, respecting `Retry-After`

### BUG #10 — Outbox has no schema version

**Problem:** If the state schema changes, old outbox entries written by the previous app version would be sent verbatim to the new server, which may reject or misinterpret.

**Fix:**
- Added `CURRENT_SCHEMA_VERSION` constant and `schemaVersion` field to outbox entries
- On load, if `schemaVersion < CURRENT_SCHEMA_VERSION`, run registered migrations in order
- Migration infrastructure added via `MIGRATIONS` map and `migrateState()` function
