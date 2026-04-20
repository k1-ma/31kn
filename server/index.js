// server/index.js (local/dev runner)
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createApp } from "./app.js";

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
    app.use((await import("express")).default.static(dist));
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
      return res.sendFile(path.join(dist, "index.html"));
    });
  } else {
    // eslint-disable-next-line no-console
    console.warn('[server] dist/ not found. Run "npm run build" first.');
  }
}

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log("[server] http://localhost:" + PORT + " (" + NODE_ENV + ")");
});
