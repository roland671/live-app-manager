import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { getDb } from "../lib/db.js";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SignupBody {
  email: string;
}

function isSignupBody(body: unknown): body is SignupBody {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return typeof b.email === "string" && EMAIL_RE.test(b.email.trim());
}

/** POST /api/v1/signup — provision a sandbox workspace and return workspaceId. */
router.post("/api/v1/signup", async (req: Request, res: Response) => {
  try {
    if (!isSignupBody(req.body)) {
      res.status(400).json({ error: "Valid email is required." });
      return;
    }

    const email = req.body.email.trim().toLowerCase();
    const workspaceId = randomUUID();
    const db = getDb();

    const { error } = await db.from("workspaces").insert({
      id: workspaceId,
      email,
      name: email,
      status: "sandbox",
      lifetime_unique_bugs: 0,
      stripe_payment_method_attached: false,
      created_at: new Date().toISOString(),
    });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(201).json({
      workspaceId,
      status: "sandbox",
      email,
      message: "Sandbox workspace provisioned.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    res.status(500).json({ error: message });
  }
});

/** GET /register — onboarding UI: email → workspace token delivery. */
router.get("/register", (_req: Request, res: Response) => {
  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Register · Live App OSS</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;700&family=IBM+Plex+Sans:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #F3F4F6;
      --surface: #FFFFFF;
      --border: #E5E7EB;
      --text: #111827;
      --body: #374151;
      --muted: #6B7280;
      --cobalt: #2563EB;
      --cobalt-soft: #EFF6FF;
      --green: #059669;
      --green-soft: #D1FAE5;
      --crimson: #DC2626;
      --font: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
      --mono: "IBM Plex Mono", ui-monospace, Consolas, monospace;
      --shadow: 0 10px 30px rgba(16, 24, 40, 0.08);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font);
      background:
        radial-gradient(900px 420px at 10% -10%, #DBEAFE 0%, transparent 55%),
        radial-gradient(700px 380px at 100% 0%, #E0E7FF 0%, transparent 50%),
        var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .shell { width: 100%; max-width: 520px; }
    .brand {
      font-size: 13px; font-weight: 800; letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--cobalt); margin-bottom: 10px;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      box-shadow: var(--shadow);
      padding: 28px 28px 24px;
    }
    h1 {
      font-size: 28px; font-weight: 700; letter-spacing: -0.03em;
      margin-bottom: 8px;
    }
    .lead { color: var(--body); font-size: 15px; margin-bottom: 22px; line-height: 1.5; }
    label {
      display: block; font-size: 13px; font-weight: 700; color: var(--muted);
      text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px;
    }
    input[type="email"] {
      width: 100%; font: inherit; font-size: 16px;
      border: 1px solid var(--border); border-radius: 8px;
      padding: 12px 14px; color: var(--text); background: #fff;
      margin-bottom: 14px;
    }
    input[type="email"]:focus {
      outline: 2px solid #93C5FD; border-color: var(--cobalt);
    }
    button.primary {
      width: 100%; appearance: none; border: 0; border-radius: 8px;
      background: var(--cobalt); color: #fff; font: inherit;
      font-size: 15px; font-weight: 700; padding: 12px 16px; cursor: pointer;
    }
    button.primary:hover { filter: brightness(1.05); }
    button.primary:disabled { opacity: 0.55; cursor: not-allowed; filter: none; }
    .err {
      display: none; margin-top: 12px; padding: 10px 12px; border-radius: 8px;
      background: #FEE2E2; color: var(--crimson); font-size: 14px; font-weight: 600;
    }
    .err.show { display: block; }
    .links { margin-top: 16px; font-size: 14px; color: var(--muted); }
    .links a { color: var(--cobalt); font-weight: 700; text-decoration: none; }
    .links a:hover { text-decoration: underline; }

    /* Onboarding modal */
    .overlay {
      display: none; position: fixed; inset: 0; z-index: 40;
      background: rgba(17, 24, 39, 0.55);
      align-items: center; justify-content: center; padding: 20px;
    }
    .overlay.show { display: flex; }
    .modal {
      width: 100%; max-width: 640px;
      background: #fff; border: 2px solid #111827; border-radius: 12px;
      box-shadow: 0 24px 60px rgba(0,0,0,0.28);
      overflow: hidden;
    }
    .modal-band {
      background: var(--green-soft); border-bottom: 1px solid #A7F3D0;
      padding: 16px 20px;
    }
    .modal-band h2 {
      font-size: 22px; font-weight: 800; color: #065F46; letter-spacing: -0.02em;
    }
    .modal-body { padding: 20px; }
    .modal-body p {
      font-size: 15px; color: var(--body); line-height: 1.55; margin-bottom: 16px;
    }
    .token-box {
      display: flex; gap: 8px; align-items: stretch; margin-bottom: 18px;
    }
    .token-box code {
      flex: 1; font-family: var(--mono); font-size: 13px; font-weight: 700;
      background: #111827; color: #F9FAFB; padding: 12px 14px; border-radius: 8px;
      word-break: break-all; line-height: 1.4;
    }
    .token-box button {
      appearance: none; border: 1px solid var(--border); background: var(--cobalt-soft);
      color: var(--cobalt); font: inherit; font-size: 13px; font-weight: 700;
      padding: 0 14px; border-radius: 8px; cursor: pointer; white-space: nowrap;
    }
    .snippet-label {
      font-size: 12px; font-weight: 800; letter-spacing: 0.05em;
      text-transform: uppercase; color: var(--muted); margin-bottom: 8px;
    }
    pre.snippet {
      background: #0B1220; color: #E5E7EB; border-radius: 8px;
      padding: 14px 16px; font-family: var(--mono); font-size: 12px;
      line-height: 1.5; overflow: auto; max-height: 220px;
      border: 1px solid #1F2937;
    }
    .modal-actions {
      display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px;
    }
    .modal-actions a, .modal-actions button {
      appearance: none; border: 1px solid var(--border); background: #fff;
      color: var(--text); font: inherit; font-size: 14px; font-weight: 700;
      padding: 10px 14px; border-radius: 8px; cursor: pointer; text-decoration: none;
    }
    .modal-actions a.primary, .modal-actions button.primary {
      background: var(--cobalt); color: #fff; border-color: var(--cobalt);
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="brand">Live App · Open Source</div>
    <div class="card" id="signup-card">
      <h1>Get your free API token</h1>
      <p class="lead">
        Provision a sandbox workspace in seconds. Track up to
        <strong>10 unique bugs</strong> free — then link a payment card to unlock more.
      </p>
      <form id="signup-form">
        <label for="email">Work email</label>
        <input id="email" name="email" type="email" required placeholder="you@company.com" autocomplete="email" />
        <button class="primary" type="submit" id="submit-btn">Get Free API Token</button>
      </form>
      <div class="err" id="err"></div>
      <p class="links">
        Already set up?
        <a href="/dashboard/user">Open dashboard</a>
      </p>
    </div>
  </div>

  <div class="overlay" id="overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal">
      <div class="modal-band">
        <h2 id="modal-title">Your Sandbox is Live!</h2>
      </div>
      <div class="modal-body">
        <p>
          Copy your Workspace ID below. Your account is capped at
          <strong>10 unique bugs</strong> until a payment card is linked.
        </p>
        <div class="token-box">
          <code id="workspace-id"></code>
          <button type="button" id="copy-id">Copy ID</button>
        </div>
        <div class="snippet-label">Drop-in client snippet · go live in under 10 seconds</div>
        <pre class="snippet" id="snippet"></pre>
        <div class="modal-actions">
          <button type="button" class="primary" id="copy-snippet">Copy snippet</button>
          <a class="primary" id="dash-link" href="/dashboard/user">Open User Dashboard</a>
          <a href="/dashboard/admin">Admin</a>
        </div>
      </div>
    </div>
  </div>

  <script>
    const form = document.getElementById("signup-form");
    const err = document.getElementById("err");
    const submitBtn = document.getElementById("submit-btn");
    const overlay = document.getElementById("overlay");
    const workspaceEl = document.getElementById("workspace-id");
    const snippetEl = document.getElementById("snippet");
    const dashLink = document.getElementById("dash-link");

    function buildSnippet(workspaceId) {
      const origin = window.location.origin;
      return \`async function reportError(error) {
  await fetch("\${origin}/api/v1/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: "\${workspaceId}",
      errorType: error.name || "Error",
      message: error.message,
      stackTrace: error.stack || String(error),
    }),
  });
}

window.addEventListener("error", (e) => {
  if (e.error) void reportError(e.error);
});

window.addEventListener("unhandledrejection", (e) => {
  const err = e.reason instanceof Error ? e.reason : new Error(String(e.reason));
  void reportError(err);
});\`;
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.classList.remove("show");
      submitBtn.disabled = true;
      submitBtn.textContent = "Provisioning…";

      try {
        const email = document.getElementById("email").value.trim();
        const res = await fetch("/api/v1/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Signup failed");

        const id = data.workspaceId;
        workspaceEl.textContent = id;
        snippetEl.textContent = buildSnippet(id);
        dashLink.href = "/dashboard/user?workspaceId=" + encodeURIComponent(id);
        overlay.classList.add("show");
      } catch (ex) {
        err.textContent = ex.message || "Signup failed";
        err.classList.add("show");
        submitBtn.disabled = false;
        submitBtn.textContent = "Get Free API Token";
      }
    });

    async function copyText(text, button, label) {
      try {
        await navigator.clipboard.writeText(text);
        const prev = button.textContent;
        button.textContent = label || "Copied!";
        setTimeout(() => { button.textContent = prev; }, 1200);
      } catch {
        button.textContent = "Copy failed";
      }
    }

    document.getElementById("copy-id").addEventListener("click", (e) => {
      copyText(workspaceEl.textContent, e.currentTarget, "Copied!");
    });
    document.getElementById("copy-snippet").addEventListener("click", (e) => {
      copyText(snippetEl.textContent, e.currentTarget, "Snippet copied!");
    });
  </script>
</body>
</html>`);
});

export default router;
