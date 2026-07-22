import "dotenv/config";
import express from "express";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertSupabaseEnvConfigured } from "./lib/env.js";
import authRouter from "./routes/auth.js";
import trackRouter from "./routes/track.js";
import dashboardRouter from "./routes/dashboard.js";

// Phase 1: refuse silent misconfiguration on boot
assertSupabaseEnvConfigured();

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(express.json());

app.get("/health", (_req, res) => {
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
