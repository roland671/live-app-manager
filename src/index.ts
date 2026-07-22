import "dotenv/config";
import express from "express";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assertSupabaseEnvConfigured } from "./lib/env.js";
import authRouter from "./routes/auth.js";
import trackRouter from "./routes/track.js";
import dashboardRouter from "./routes/dashboard.js";

// Phase 1: refuse silent misconfiguration on boot
assertSupabaseEnvConfigured();

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const publicDir = join(process.cwd(), "public");

app.use(express.json());

// --- API & system routes (registered before static / SPA fallbacks) ---

app.get(["/health", "/api/health"], (_req, res) => {
  res.status(200).json({ status: "healthy" });
});

/** AI crawler / LLM context map */
app.get(["/llms.txt", "/.well-known/llms.txt"], (_req, res) => {
  try {
    const body = readFileSync(join(process.cwd(), "llms.txt"), "utf8");
    res.type("text/plain; charset=utf-8").send(body);
  } catch {
    res.status(404).type("text/plain").send("llms.txt not found");
  }
});

app.use(authRouter);
app.use(trackRouter);
app.use(dashboardRouter);

// --- Frontend static assets (HTML/JS/CSS under /public) ---
if (existsSync(publicDir)) {
  app.use(
    express.static(publicDir, {
      index: false,
      fallthrough: true,
    }),
  );
}

/**
 * Root URL → primary Dashboard UI (User view).
 * API routes above take precedence; static files do not shadow /api/* or /dashboard/*.
 */
app.get("/", (_req, res) => {
  res.redirect(302, "/dashboard/user?workspaceId=demo");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
