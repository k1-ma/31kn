import express from "express";
import { createApp } from "../server/app.js";

function createFallbackApp(err) {
  const app = express();
  app.use(express.json());

  // Allow the UI to boot in "local-only" mode even if the server can't connect to DB.
  // State endpoints return 503 so client knows to use localStorage as source of truth.
  app.get("/api/auth/me", (req, res) => {
    return res.status(200).json({ user: null, db: "down" });
  });

  app.get("/api/state", (req, res) => {
    return res.status(503).json({ state: null, db: "down", code: "DB_UNAVAILABLE" });
  });

  app.put("/api/state", (req, res) => {
    return res.status(503).json({ ok: false, db: "down", code: "DB_UNAVAILABLE" });
  });

  app.post("/api/auth/logout", (req, res) => {
    return res.status(200).json({ ok: true, db: "down" });
  });

  app.all("/api/*", (req, res) => {
    return res.status(500).json({
      error: "Server is not configured",
      detail: String(err?.message || err),
      hint:
        "Set DATABASE_URL (or POSTGRES_URL) in Vercel Environment Variables, then redeploy. Also set SESSION_SECRET for secure cookies. If you see TLS/SSL errors, ensure your Postgres URL is correct and SSL is enabled (this project enables SSL automatically for non-local DBs; set PGSSL_DISABLE=1 only for local dev).",
    });
  });
  return app;
}

const appPromise =
  globalThis.__tradej_app_promise ||
  createApp().catch((err) => {

    console.error("[api] boot error:", err);
    return createFallbackApp(err);
  });

globalThis.__tradej_app_promise = appPromise;

export default async function handler(req, res) {
  const app = await appPromise;
  return app(req, res);
}
