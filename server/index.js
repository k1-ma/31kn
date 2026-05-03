// server/index.js (local/dev runner)
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createApp } from "./app.js";
import { getPool } from "./services/db.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const PORT = Number(process.env.PORT || 8080);
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";

const app = await createApp();

// Serve built client in local production runs
if (IS_PROD) {
  const dist = path.join(ROOT, "dist");
  if (fs.existsSync(dist)) {
    const expressStatic = (await import("express")).default.static;
    // Vite emits hashed filenames into /assets — safe to cache forever.
    // Other top-level files (index.html, manifests, sw.js) must revalidate
    // so PWA updates aren't served stale.
    app.use(
      expressStatic(dist, {
        etag: true,
        lastModified: true,
        setHeaders(res, filePath) {
          if (/\/assets\//.test(filePath)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          } else if (/\.(?:woff2?|ttf|otf|eot)$/.test(filePath)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          } else if (/\/(?:index\.html|sw\.js|registerSW\.js|manifest\.webmanifest)$/.test(filePath)) {
            res.setHeader("Cache-Control", "no-cache, must-revalidate");
          }
        },
      })
    );
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
      return res.sendFile(path.join(dist, "index.html"));
    });
  } else {
    // eslint-disable-next-line no-console
    console.warn('[server] dist/ not found. Run "npm run build" first.');
  }
}

const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log("[server] http://localhost:" + PORT + " (" + NODE_ENV + ")");
});

// Graceful shutdown. Railway sends SIGTERM on redeploys; without this handler
// Node exits immediately on the next tick and drops any in-flight HTTP
// requests — including saves that are mid-DB-write. SIGINT (Ctrl-C) is
// wired for parity in local dev.
//
// Sequence:
//   1. Hard-exit fallback timer (25 s, .unref()'d) — fires only if the graceful
//      path stalls. Beats Railway's ~30 s SIGKILL with a clean exit(1) and
//      a clear log message.
//   2. Stop accepting new connections (server.close), wait up to 10 s for
//      in-flight requests to finish.
//   3. Close the pg pool (waits for in-flight queries to settle).
//   4. process.exit(0) on clean shutdown, exit(1) if any step failed.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return; // ignore repeated signals
  shuttingDown = true;

  // eslint-disable-next-line no-console
  console.log(`[server] received ${signal}, shutting down gracefully`);

  // Hard-exit fallback. If the graceful path stalls (e.g. server.close hangs
  // on an unresponsive client connection beyond the 10 s timeout, or
  // pool.end() blocks on a long query), Railway will SIGKILL after ~30 s.
  // Beat them to it with a clean exit(1) at 25 s. .unref() is critical —
  // without it the timer keeps the event loop alive and prevents normal
  // exit on the happy path.
  setTimeout(() => {
    // eslint-disable-next-line no-console
    console.error("[server] hard-exit after 25s — graceful shutdown stalled");
    process.exit(1);
  }, 25_000).unref();

  let exitCode = 0;

  // 1. Stop accepting new connections, wait up to 10 s for in-flight requests.
  try {
    if (typeof server !== "undefined" && server) {
      await Promise.race([
        new Promise((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("server.close() timed out after 10s")), 10_000)
        ),
      ]);
      // eslint-disable-next-line no-console
      console.log("[server] HTTP server closed cleanly");
    } else {
      // eslint-disable-next-line no-console
      console.warn("[server] no server instance to close (received signal during boot)");
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[server] HTTP server close failed:", err?.message || err);
    exitCode = 1;
  }

  // 2. Close the pg pool (waits for in-flight queries to settle).
  try {
    const pool = getPool();
    if (pool) await pool.end();
    // eslint-disable-next-line no-console
    console.log("[server] pg pool ended");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[server] pool.end() failed:", err?.message || err);
    exitCode = 1;
  }

  process.exit(exitCode);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
