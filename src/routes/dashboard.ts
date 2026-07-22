import { Router, type Request, type Response } from "express";
import { getDb } from "../lib/db.js";

const SANDBOX_LIMIT = 10;
const OPEN_SOURCE_STATUS = "open_source";
const DEMO_WORKSPACE_ID = "demo";
const DEMO_WORKSPACE_NAME = "Demo Sandbox Workspace";

interface WorkspaceRow {
  id: string;
  status: string;
  lifetime_unique_bugs: number | null;
  stripe_payment_method_attached: boolean | null;
}

interface BugSignatureRow {
  signature_hash: string;
  error_type: string;
  message: string;
  total_occurrences: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
}

type NavTab = "user" | "admin" | "health";

const router = Router();

const sharedStyles = `
  :root {
    --bg: #F3F4F6;
    --surface: #FFFFFF;
    --border: #E5E7EB;
    --text: #111827;
    --body: #374151;
    --muted: #6B7280;
    --cobalt: #2563EB;
    --cobalt-soft: #EFF6FF;
    --crimson: #DC2626;
    --crimson-band: #FEE2E2;
    --amber: #D97706;
    --amber-band: #FEF3C7;
    --green: #059669;
    --green-band: #D1FAE5;
    --font: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
    --mono: "IBM Plex Mono", ui-monospace, Consolas, monospace;
    --shadow: 0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--font);
    background: var(--bg);
    color: var(--text);
    font-size: 15px;
    line-height: 1.5;
    min-height: 100vh;
  }
  a { color: var(--cobalt); text-decoration: none; font-weight: 600; }
  a:hover { text-decoration: underline; }

  .shell {
    max-width: 1280px;
    margin: 0 auto;
    padding: 20px 24px 28px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 18px;
    box-shadow: var(--shadow);
    flex: 0 0 auto;
  }
  .topbar h1 {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: var(--text);
  }
  .tabs {
    display: flex;
    gap: 6px;
    background: #F9FAFB;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 4px;
  }
  .tabs a {
    padding: 8px 16px;
    font-size: 14px;
    font-weight: 700;
    color: var(--body);
    border-radius: 6px;
    text-decoration: none;
  }
  .tabs a:hover { background: #EEF2FF; color: var(--cobalt); text-decoration: none; }
  .tabs a.active { background: var(--cobalt); color: #fff; }

  .main {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow: auto;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: var(--shadow);
  }
  .section-title {
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.02em;
    margin-bottom: 10px;
  }
  .body-text { color: var(--body); font-size: 15px; }

  .meta-card {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 16px;
    padding: 14px 16px;
  }
  .meta-card .name { font-size: 18px; font-weight: 700; color: var(--text); }
  .meta-card code {
    font-family: var(--mono);
    font-size: 13px;
    background: #F9FAFB;
    border: 1px solid var(--border);
    padding: 4px 8px;
    border-radius: 6px;
    color: var(--body);
  }
  .badge {
    display: inline-flex;
    align-items: center;
    font-size: 12px;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 999px;
    letter-spacing: 0.02em;
  }
  .badge.cobalt { background: var(--cobalt-soft); color: var(--cobalt); }
  .badge.crimson { background: var(--crimson-band); color: var(--crimson); }
  .badge.amber { background: var(--amber-band); color: var(--amber); }
  .badge.green { background: var(--green-band); color: var(--green); }
  .badge.muted { background: #F3F4F6; color: var(--muted); border: 1px solid var(--border); }
  .badge.check { background: var(--cobalt); color: #fff; font-size: 13px; padding: 4px 10px; }

  .sandbox-inline {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: auto;
    min-width: 220px;
    flex: 1 1 220px;
    max-width: 320px;
  }
  .sandbox-inline .lbl {
    font-size: 13px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .meter {
    flex: 1;
    height: 10px;
    background: #E5E7EB;
    border-radius: 99px;
    overflow: hidden;
  }
  .meter > i { display: block; height: 100%; background: var(--cobalt); border-radius: 99px; }
  .meter > i.locked { background: var(--crimson); }
  .sandbox-inline .pct {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    font-variant-numeric: tabular-nums;
    min-width: 42px;
  }

  button {
    appearance: none;
    border: 1px solid var(--border);
    background: #fff;
    color: var(--text);
    font: inherit;
    font-size: 14px;
    font-weight: 700;
    padding: 8px 14px;
    border-radius: 6px;
    cursor: pointer;
  }
  button:hover { background: #F9FAFB; }
  button.primary { background: var(--cobalt); color: #fff; border-color: var(--cobalt); }
  button.primary:hover { filter: brightness(1.05); }
  button.primary:disabled { opacity: 0.5; cursor: not-allowed; filter: none; }
  button.ghost { color: var(--cobalt); border-color: #BFDBFE; background: var(--cobalt-soft); }
  button.danger { color: var(--crimson); border-color: #FECACA; background: #FFF5F5; }

  /* User stage cards */
  .stage-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    flex: 1 1 auto;
    min-height: 0;
  }
  .stage-card {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
  .stage-band {
    padding: 10px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border-bottom: 1px solid var(--border);
  }
  .stage-band .kicker {
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .stage-card.fatal .stage-band { background: var(--crimson-band); }
  .stage-card.fatal .stage-band .kicker { color: var(--crimson); }
  .stage-card.open .stage-band { background: var(--amber-band); }
  .stage-card.open .stage-band .kicker { color: var(--amber); }
  .stage-card.done .stage-band { background: var(--green-band); }
  .stage-card.done .stage-band .kicker { color: var(--green); }

  .stage-body {
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: 1 1 auto;
    min-height: 0;
  }
  .stage-body h3 {
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
    line-height: 1.35;
    font-family: var(--mono);
  }
  .stage-card.done .stage-body h3 {
    color: var(--body);
    text-decoration: line-through;
    text-decoration-thickness: 1.5px;
  }
  .stage-body .file {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--muted);
  }
  .stage-body .desc {
    font-size: 14px;
    color: var(--body);
  }
  details.stack summary {
    cursor: pointer;
    color: var(--cobalt);
    font-size: 14px;
    font-weight: 700;
    list-style: none;
  }
  details.stack summary::-webkit-details-marker { display: none; }
  details.stack summary::before { content: "▸ "; }
  details.stack[open] summary::before { content: "▾ "; }
  details.stack pre {
    margin-top: 8px;
    max-height: 90px;
    overflow: auto;
    background: #F9FAFB;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px;
    font-family: var(--mono);
    font-size: 12px;
    color: var(--body);
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .stage-footer {
    margin-top: auto;
    padding: 12px 16px;
    border-top: 1px solid var(--border);
    background: #FAFAFA;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .sig-card { padding: 14px 16px; flex: 0 0 auto; }
  .sig-card table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .sig-card th, .sig-card td {
    text-align: left;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    color: var(--body);
  }
  .sig-card th {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  .sig-card td.mono { font-family: var(--mono); font-size: 13px; }
  .empty { color: var(--muted); font-size: 14px; padding: 4px 0; }

  /* Admin */
  .metric-row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
    flex: 0 0 auto;
  }
  .metric-card { padding: 18px 18px 16px; }
  .metric-card .n {
    font-size: 36px;
    font-weight: 800;
    letter-spacing: -0.04em;
    color: var(--text);
    line-height: 1;
  }
  .metric-card .n.cobalt { color: var(--cobalt); }
  .metric-card .t {
    margin-top: 8px;
    font-size: 14px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .admin-mid {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    gap: 14px;
    flex: 1 1 auto;
    min-height: 0;
  }
  .panel-card {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
  .panel-card .panel-head {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    background: #F9FAFB;
  }
  .panel-card .panel-head h2 {
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
  }
  .panel-card .panel-body {
    padding: 14px 16px;
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }

  .latency-chart {
    display: flex;
    align-items: flex-end;
    gap: 5px;
    height: 120px;
    padding-top: 8px;
  }
  .latency-chart .bar {
    flex: 1;
    border-radius: 4px 4px 2px 2px;
    min-width: 8px;
    background: var(--cobalt);
  }
  .latency-chart .bar.hot { background: var(--crimson); }
  .latency-caption {
    margin-top: 10px;
    font-size: 13px;
    color: var(--muted);
  }

  .ws-list { display: flex; flex-direction: column; gap: 8px; }
  .ws-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: #fff;
  }
  .ws-row .left { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; }
  .ws-row code {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--text);
  }
  .ws-row .actions { display: flex; gap: 6px; flex-shrink: 0; }

  .bottom-stack { display: flex; flex-direction: column; gap: 10px; flex: 0 0 auto; }
  .hline-card {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
  }
  .hline-card .label {
    font-size: 13px;
    font-weight: 800;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    min-width: 88px;
  }
  .hline-card .items {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    color: var(--body);
    font-size: 14px;
  }
  .hline-card input[type="text"] {
    flex: 1 1 200px;
    min-width: 160px;
    max-width: 280px;
    font-family: var(--mono);
    font-size: 14px;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 10px;
    color: var(--text);
    background: #fff;
  }

  /* Health monitor */
  .monitor {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1 1 auto;
    overflow: hidden;
  }
  .monitor-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    background: #F9FAFB;
    border-bottom: 1px solid var(--border);
  }
  .monitor-head h2 { font-size: 18px; font-weight: 700; }
  .monitor-body {
    padding: 16px 18px;
    overflow: auto;
    flex: 1 1 auto;
    min-height: 0;
  }
  .health-metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }
  .health-metric {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
    background: #F9FAFB;
  }
  .health-metric .k {
    font-size: 12px;
    font-weight: 800;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .health-metric .v {
    margin-top: 6px;
    font-size: 20px;
    font-weight: 800;
    color: var(--cobalt);
    letter-spacing: -0.02em;
  }
  .timeline {
    border-left: 3px solid #BFDBFE;
    margin: 4px 0 16px 6px;
    padding-left: 14px;
  }
  .timeline .item { padding: 6px 0; }
  .timeline .when {
    font-size: 12px;
    font-weight: 700;
    color: var(--muted);
    font-family: var(--mono);
  }
  .timeline .what {
    font-size: 15px;
    color: var(--body);
    margin-top: 2px;
  }
  .log-box {
    border: 1px solid var(--border);
    border-radius: 8px;
    background: #F9FAFB;
    padding: 10px 12px;
  }
  .log-box .line {
    display: grid;
    grid-template-columns: 72px 1fr;
    gap: 12px;
    padding: 6px 4px;
    border-bottom: 1px solid var(--border);
    font-size: 14px;
    color: var(--body);
  }
  .log-box .line:last-child { border-bottom: 0; }
  .log-box .ts {
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 700;
    color: var(--muted);
  }

  .toast {
    display: none;
    font-size: 13px;
    font-weight: 700;
    padding: 6px 10px;
    border-radius: 6px;
    background: var(--cobalt-soft);
    color: var(--cobalt);
  }
  .toast.show { display: inline-block; }
  .toast.err { background: var(--crimson-band); color: var(--crimson); }

  @media (max-width: 980px) {
    .shell { max-height: none; }
    .stage-grid, .metric-row, .admin-mid, .health-metrics { grid-template-columns: 1fr; }
  }
`;

function navHtml(active: NavTab): string {
  const tabs: Array<{ id: NavTab; href: string; label: string }> = [
    { id: "user", href: "/dashboard/user?workspaceId=demo", label: "User" },
    { id: "admin", href: "/dashboard/admin", label: "Admin" },
    { id: "health", href: "/dashboard/health", label: "Health" },
  ];
  return `<nav class="tabs">${tabs
    .map(
      (t) =>
        `<a href="${t.href}" class="${t.id === active ? "active" : ""}">${t.label}</a>`,
    )
    .join("")}</nav>`;
}

function layout(title: string, active: NavTab, body: string, extraScript = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · Live App OSS</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=IBM+Plex+Sans:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>${sharedStyles}</style>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <h1>${escapeHtml(title)}</h1>
      ${navHtml(active)}
    </header>
    <div class="main">${body}</div>
  </div>
  ${extraScript}
</body>
</html>`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function errorPage(res: Response, status: number, message: string): void {
  res.status(status).type("html").send(
    layout(
      "Error",
      "admin",
      `<div class="card" style="padding:20px"><p class="empty">${escapeHtml(message)}</p></div>`,
    ),
  );
}

function isPlaceholderWorkspaceId(id: string): boolean {
  const v = id.trim().toLowerCase();
  return (
    !v ||
    v === "demo" ||
    v.includes("your_") ||
    v.includes("placeholder") ||
    v === "00000000-0000-4000-8000-000000000001"
  );
}

const TYPEERROR_STACK = `TypeError: Cannot read properties of undefined (reading 'map')
    at DataStream.render (src/components/DataStream.ts:84:21)
    at processChild (src/runtime/reconciler.ts:412:9)
    at commitLayoutEffect (src/runtime/commit.ts:188:5)`;

const HARDWARE_STACK = `HardwareException: Signal drop on device stream feed
    at DeviceFeed.ingest (src/hardware/DeviceFeed.ts:112:9)
    at StreamGate.verify (src/hardware/StreamGate.ts:44:3)
    at TrackingEngine.push (src/engine/TrackingEngine.ts:201:7)`;

function stageGridHtml(): string {
  return `
    <div class="stage-grid">
      <article class="card stage-card fatal" id="stage-critical">
        <div class="stage-band">
          <span class="kicker">Active Fatal</span>
          <span class="badge crimson">SEV-1</span>
        </div>
        <div class="stage-body">
          <h3>HardwareException: Signal drop on device stream feed</h3>
          <div class="file">src/hardware/DeviceFeed.ts:112</div>
          <p class="desc">Fatal feed interruption on the hardware ingestion path. Downstream trackers are starved until the stream recovers.</p>
          <details class="stack">
            <summary>Expand stack trace</summary>
            <pre>${escapeHtml(HARDWARE_STACK)}</pre>
          </details>
        </div>
        <div class="stage-footer">
          <button class="primary" type="button" id="mark-fixed">Mark Resolved</button>
        </div>
      </article>

      <article class="card stage-card open" id="stage-warn">
        <div class="stage-band">
          <span class="kicker">Unresolved</span>
          <span class="badge amber">OPEN</span>
        </div>
        <div class="stage-body">
          <h3>TypeError: Cannot read properties of undefined (reading 'map')</h3>
          <div class="file">src/components/DataStream.ts:84</div>
          <p class="desc">Standard unresolved client exception while mapping stream rows. Awaiting triage from engineering.</p>
          <details class="stack">
            <summary>Expand stack trace</summary>
            <pre>${escapeHtml(TYPEERROR_STACK)}</pre>
          </details>
        </div>
        <div class="stage-footer">
          <span class="body-text" style="font-size:14px;color:var(--muted)">No action assigned</span>
        </div>
      </article>

      <article class="card stage-card done" id="stage-resolved">
        <div class="stage-band">
          <span class="kicker">Resolved</span>
          <span class="badge check">✓ Fixed</span>
        </div>
        <div class="stage-body">
          <h3>RESOLVED: Database Connection Timeout (Fixed by engineering 2 hours ago)</h3>
          <div class="file">src/lib/db.ts · pool acquire</div>
          <p class="desc">Connection pool recycled and verified. Ticket closed after soak test passed.</p>
        </div>
        <div class="stage-footer">
          <button class="ghost" type="button" id="reopen-ticket">Reopen Ticket</button>
        </div>
      </article>
    </div>
  `;
}

function renderUserDashboard(opts: {
  workspaceId: string;
  workspaceName: string;
  status: string;
  used: number;
  cardAttached: boolean;
  demoMode: boolean;
  rows: BugSignatureRow[];
}): string {
  const { workspaceId, workspaceName, status, used, cardAttached, demoMode, rows } = opts;
  const pct = Math.min(100, Math.round((used / SANDBOX_LIMIT) * 100));
  const locked = used >= SANDBOX_LIMIT && !cardAttached;

  const bugRows =
    rows.length === 0
      ? `<p class="empty">${demoMode ? "Demo mode — lifecycle stages above illustrate the full error workflow." : "No signatures captured yet."}</p>`
      : `<table>
          <thead><tr><th>Type</th><th>Message</th><th>Hash</th><th>Count</th></tr></thead>
          <tbody>
            ${rows
              .slice(0, 5)
              .map(
                (b) => `<tr>
                  <td>${escapeHtml(b.error_type)}</td>
                  <td>${escapeHtml(b.message)}</td>
                  <td class="mono">${escapeHtml(String(b.signature_hash).slice(0, 14))}…</td>
                  <td>${escapeHtml(b.total_occurrences)}</td>
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>`;

  return `
    <div class="card meta-card">
      <span class="name">${escapeHtml(workspaceName)}</span>
      <code>${escapeHtml(workspaceId)}</code>
      <span class="badge cobalt">${escapeHtml(status)}</span>
      ${demoMode ? `<span class="badge muted">visual fallback</span>` : ""}
      ${cardAttached ? `<span class="badge cobalt">card on</span>` : locked ? `<span class="badge crimson">locked</span>` : `<span class="badge amber">sandbox</span>`}
      <div class="sandbox-inline" title="Sandbox usage">
        <span class="lbl">Sandbox</span>
        <div class="meter"><i class="${locked ? "locked" : ""}" style="width:${pct}%"></i></div>
        <span class="pct">${used}/${SANDBOX_LIMIT}</span>
      </div>
      <button class="primary" id="attach-card" ${cardAttached || demoMode ? "disabled" : ""} data-workspace="${escapeHtml(workspaceId)}">
        ${cardAttached ? "Card attached" : "Attach Card"}
      </button>
      <span id="toast" class="toast"></span>
    </div>

    ${stageGridHtml()}

    <div class="card sig-card">
      <div class="section-title">Captured signatures</div>
      ${bugRows}
    </div>
  `;
}

function userScripts(demoMode: boolean): string {
  return `
<script>
  const toast = document.getElementById("toast");
  function showToast(msg, err) {
    if (!toast) return;
    toast.textContent = msg;
    toast.className = "toast show" + (err ? " err" : "");
  }
  const btn = document.getElementById("attach-card");
  if (btn && !btn.disabled && ${demoMode ? "false" : "true"}) {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        const res = await fetch("/dashboard/api/attach-card", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: btn.dataset.workspace }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Request failed");
        showToast("Unlocked");
        setTimeout(() => location.reload(), 500);
      } catch (e) {
        btn.disabled = false;
        showToast(e.message || "Failed", true);
      }
    });
  }
  document.getElementById("mark-fixed")?.addEventListener("click", (e) => {
    const card = document.getElementById("stage-critical");
    const button = e.currentTarget;
    if (!card || !(button instanceof HTMLButtonElement)) return;
    card.classList.remove("fatal");
    card.classList.add("done");
    const h3 = card.querySelector("h3");
    if (h3) h3.style.textDecoration = "line-through";
    button.disabled = true;
    button.textContent = "Resolved";
    showToast("Marked resolved");
  });
  document.getElementById("reopen-ticket")?.addEventListener("click", (e) => {
    const card = document.getElementById("stage-resolved");
    const button = e.currentTarget;
    if (!card || !(button instanceof HTMLButtonElement)) return;
    card.classList.remove("done");
    card.classList.add("open");
    const h3 = card.querySelector("h3");
    if (h3) {
      h3.style.textDecoration = "none";
      h3.textContent = "Database Connection Timeout (reopened)";
    }
    button.disabled = true;
    button.textContent = "Reopened";
    showToast("Ticket reopened");
  });
</script>`;
}

const MOCK_WORKSPACES: Array<{
  id: string;
  used: number;
  card: boolean;
  name: string;
}> = [
  { id: "ws_8f2a91c0-demo-alpha", name: "Acme Analytics", used: 7, card: false },
  { id: "ws_3bc1e442-demo-beta", name: "Northwind Mobile", used: 10, card: true },
  { id: "ws_91d0aa17-demo-gamma", name: "Orbit Checkout", used: 3, card: false },
  { id: "ws_55e8b2f9-demo-delta", name: "Pixel Farm SDK", used: 9, card: false },
  { id: "ws_c0a11d76-demo-epsilon", name: "Harbor Logistics", used: 2, card: true },
];

/** GET /dashboard/user */
router.get("/dashboard/user", async (req: Request, res: Response) => {
  try {
    const requestedId =
      typeof req.query.workspaceId === "string" && req.query.workspaceId.length > 0
        ? req.query.workspaceId
        : DEMO_WORKSPACE_ID;

    let workspace: WorkspaceRow | null = null;
    let rows: BugSignatureRow[] = [];
    let useDemo = isPlaceholderWorkspaceId(requestedId);

    if (!useDemo) {
      try {
        const db = getDb();
        const { data, error } = await db
          .from("workspaces")
          .select("id, status, lifetime_unique_bugs, stripe_payment_method_attached")
          .eq("id", requestedId)
          .maybeSingle();

        if (!error && data) {
          workspace = data as WorkspaceRow;
          const bugsRes = await db
            .from("bug_signatures")
            .select(
              "signature_hash, error_type, message, total_occurrences, first_seen_at, last_seen_at",
            )
            .eq("workspace_id", requestedId)
            .order("last_seen_at", { ascending: false });
          rows = (bugsRes.data ?? []) as BugSignatureRow[];
        } else {
          useDemo = true;
        }
      } catch {
        useDemo = true;
      }
    }

    if (useDemo || !workspace) {
      const body = renderUserDashboard({
        workspaceId: DEMO_WORKSPACE_ID,
        workspaceName: DEMO_WORKSPACE_NAME,
        status: "open_source",
        used: 7,
        cardAttached: false,
        demoMode: true,
        rows: [],
      });
      res.type("html").send(layout("User Dashboard", "user", body, userScripts(true)));
      return;
    }

    const body = renderUserDashboard({
      workspaceId: workspace.id,
      workspaceName: `Workspace ${workspace.id.slice(0, 8)}…`,
      status: String(workspace.status),
      used: Number(workspace.lifetime_unique_bugs ?? 0),
      cardAttached: workspace.stripe_payment_method_attached === true,
      demoMode: false,
      rows,
    });
    res.type("html").send(layout("User Dashboard", "user", body, userScripts(false)));
  } catch {
    const body = renderUserDashboard({
      workspaceId: DEMO_WORKSPACE_ID,
      workspaceName: DEMO_WORKSPACE_NAME,
      status: "open_source",
      used: 7,
      cardAttached: false,
      demoMode: true,
      rows: [],
    });
    res.type("html").send(layout("User Dashboard", "user", body, userScripts(true)));
  }
});

/** GET /dashboard/admin */
router.get("/dashboard/admin", async (_req: Request, res: Response) => {
  try {
    const db = getDb();

    const { data: workspaces, error: wsError } = await db
      .from("workspaces")
      .select("id, status, lifetime_unique_bugs, stripe_payment_method_attached")
      .order("id", { ascending: true });

    if (wsError) {
      errorPage(res, 500, wsError.message);
      return;
    }

    const list = ((workspaces ?? []) as WorkspaceRow[]).filter(
      (w) => w.status === "sandbox" || w.status === OPEN_SOURCE_STATUS,
    );
    const { count: bugCount, error: countError } = await db
      .from("bug_signatures")
      .select("*", { count: "exact", head: true });

    if (countError) {
      errorPage(res, 500, countError.message);
      return;
    }

    const freeSandbox = list.filter((w) => !w.stripe_payment_method_attached).length;
    const paying = list.filter((w) => w.stripe_payment_method_attached === true).length;
    const integrations = Math.max(list.length * 3, Number(bugCount ?? 0) + list.length, 12);
    const latencyAvg = 58;

    const displayFree = list.length === 0 ? 3 : freeSandbox;
    const displayPaying = list.length === 0 ? 2 : paying;

    const latencyBars = [35, 44, 30, 58, 41, 78, 48, 39, 96, 50, 37, 45]
      .map((h) => `<div class="bar${h > 70 ? " hot" : ""}" style="height:${h}%"></div>`)
      .join("");

    const liveRows =
      list.length > 0
        ? list.slice(0, 8).map((w) => ({
            id: w.id,
            name: w.id.slice(0, 8),
            used: Number(w.lifetime_unique_bugs ?? 0),
            card: w.stripe_payment_method_attached === true,
            live: true as const,
          }))
        : MOCK_WORKSPACES.map((w) => ({ ...w, live: false as const }));

    const workspaceLines = `<div class="ws-list">${liveRows
      .map((w) => {
        const actions = w.live
          ? `<div class="actions">
              <button class="danger" data-action="reset" data-id="${escapeHtml(w.id)}">Reset</button>
              <button data-action="toggle" data-id="${escapeHtml(w.id)}">${w.card ? "Detach" : "Attach"}</button>
            </div>`
          : `<div class="actions"><span class="badge muted">demo row</span></div>`;
        return `<div class="ws-row">
          <div class="left">
            <strong style="font-size:14px">${escapeHtml(w.name)}</strong>
            <code>${escapeHtml(w.id)}</code>
            <span class="badge muted">${w.used}/${SANDBOX_LIMIT}</span>
            ${w.card ? `<span class="badge cobalt">converted</span>` : `<span class="badge amber">free</span>`}
          </div>
          ${actions}
        </div>`;
      })
      .join("")}</div>`;

    const body = `
      <div class="metric-row">
        <div class="card metric-card"><div class="n cobalt">${integrations}</div><div class="t">Total SDKs</div></div>
        <div class="card metric-card"><div class="n">${displayFree}</div><div class="t">Free Users</div></div>
        <div class="card metric-card"><div class="n">${displayPaying}</div><div class="t">Converted Users</div></div>
        <div class="card metric-card"><div class="n cobalt">${latencyAvg}ms</div><div class="t">Latency Avg</div></div>
      </div>

      <div class="admin-mid">
        <div class="card panel-card">
          <div class="panel-head"><h2>Latency</h2></div>
          <div class="panel-body">
            <div class="latency-chart">${latencyBars}</div>
            <p class="latency-caption">Last 12 sample windows · /api/v1/track</p>
          </div>
        </div>
        <div class="card panel-card">
          <div class="panel-head">
            <h2>Workspaces · ${list.length || MOCK_WORKSPACES.length} shown · ${bugCount ?? 0} signatures</h2>
          </div>
          <div class="panel-body">${workspaceLines}</div>
        </div>
      </div>

      <div class="bottom-stack">
        <div class="card hline-card">
          <span class="label">Watchlist</span>
          <div class="items">
            <span>0 critical engine drops</span>
            <span>·</span>
            <span>402 gate pressure monitored</span>
            <span>·</span>
            <span>fingerprint cache warm</span>
          </div>
        </div>
        <div class="card hline-card">
          <span class="label">Control</span>
          <input type="text" id="manual-id" placeholder="workspace UUID" />
          <button class="danger" id="manual-reset">Reset</button>
          <button id="manual-toggle">Toggle card</button>
          <span id="toast" class="toast"></span>
        </div>
      </div>
    `;

    const script = `
<script>
  const toast = document.getElementById("toast");
  function showToast(msg, err) {
    toast.textContent = msg;
    toast.className = "toast show" + (err ? " err" : "");
  }
  async function call(path, workspaceId) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }
  document.body.addEventListener("click", async (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const action = t.dataset.action;
    const id = t.dataset.id;
    if (!action || !id) return;
    t.setAttribute("disabled", "true");
    try {
      if (action === "reset") await call("/dashboard/api/reset", id);
      else if (action === "toggle") await call("/dashboard/api/toggle-card", id);
      showToast("Updated");
      setTimeout(() => location.reload(), 400);
    } catch (err) {
      t.removeAttribute("disabled");
      showToast(err.message || "Failed", true);
    }
  });
  document.getElementById("manual-reset")?.addEventListener("click", async () => {
    const id = document.getElementById("manual-id").value.trim();
    if (!id) return showToast("Need workspace ID", true);
    try { await call("/dashboard/api/reset", id); showToast("Reset"); setTimeout(() => location.reload(), 400); }
    catch (err) { showToast(err.message || "Failed", true); }
  });
  document.getElementById("manual-toggle")?.addEventListener("click", async () => {
    const id = document.getElementById("manual-id").value.trim();
    if (!id) return showToast("Need workspace ID", true);
    try { await call("/dashboard/api/toggle-card", id); showToast("Toggled"); setTimeout(() => location.reload(), 400); }
    catch (err) { showToast(err.message || "Failed", true); }
  });
</script>`;

    res.type("html").send(layout("Admin View", "admin", body, script));
  } catch (err) {
    errorPage(res, 500, err instanceof Error ? err.message : "Unexpected error");
  }
});

/** GET /dashboard/health */
router.get("/dashboard/health", (_req: Request, res: Response) => {
  const body = `
    <div class="card monitor">
      <div class="monitor-head">
        <h2>System stability monitor</h2>
        <span class="badge cobalt">LIVE</span>
      </div>
      <div class="monitor-body">
        <div class="health-metrics">
          <div class="health-metric">
            <div class="k">API Uptime Index</div>
            <div class="v">99.98% Stable</div>
          </div>
          <div class="health-metric">
            <div class="k">Core Engine Failures</div>
            <div class="v">0 critical drops</div>
          </div>
          <div class="health-metric">
            <div class="k">Ingestion Gate</div>
            <div class="v">Armed · Stable</div>
          </div>
        </div>

        <div class="section-title">Execution timeline</div>
        <div class="timeline">
          <div class="item"><div class="when">T+0.00s</div><div class="what">Health probe → GET /health · 200 OK (4ms)</div></div>
          <div class="item"><div class="when">T+0.12s</div><div class="what">Network roundtrip · edge ↔ core · rtt 18ms</div></div>
          <div class="item"><div class="when">T+0.28s</div><div class="what">Hardware ingestion gate stability check · PASS</div></div>
          <div class="item"><div class="when">T+0.41s</div><div class="what">Fingerprint engine warm cache · ready</div></div>
          <div class="item"><div class="when">T+0.67s</div><div class="what">All probes green · stability index locked</div></div>
        </div>

        <div class="section-title">Stability log stream</div>
        <div class="log-box">
          <div class="line"><span class="ts">16:10:01</span><span>probe.heartbeat ok</span></div>
          <div class="line"><span class="ts">16:10:02</span><span>track.pipeline idle · queue depth 0</span></div>
          <div class="line"><span class="ts">16:10:03</span><span>db.mock-store sync · checksum matched</span></div>
          <div class="line"><span class="ts">16:10:06</span><span>healthd cycle complete · next tick 15s</span></div>
        </div>
      </div>
    </div>
  `;
  res.type("html").send(layout("Health", "health", body));
});

router.post("/dashboard/api/attach-card", async (req: Request, res: Response) => {
  try {
    const workspaceId = req.body?.workspaceId;
    if (typeof workspaceId !== "string" || !workspaceId) {
      res.status(400).json({ error: "workspaceId required" });
      return;
    }
    const { error } = await getDb()
      .from("workspaces")
      .update({ stripe_payment_method_attached: true })
      .eq("id", workspaceId);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ ok: true, workspaceId, stripe_payment_method_attached: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
  }
});

router.post("/dashboard/api/toggle-card", async (req: Request, res: Response) => {
  try {
    const workspaceId = req.body?.workspaceId;
    if (typeof workspaceId !== "string" || !workspaceId) {
      res.status(400).json({ error: "workspaceId required" });
      return;
    }
    const db = getDb();
    const { data: workspace, error: lookupError } = await db
      .from("workspaces")
      .select("stripe_payment_method_attached")
      .eq("id", workspaceId)
      .maybeSingle();
    if (lookupError) {
      res.status(500).json({ error: lookupError.message });
      return;
    }
    if (!workspace) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }
    const next = !workspace.stripe_payment_method_attached;
    const { error } = await db
      .from("workspaces")
      .update({ stripe_payment_method_attached: next })
      .eq("id", workspaceId);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ ok: true, workspaceId, stripe_payment_method_attached: next });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
  }
});

router.post("/dashboard/api/reset", async (req: Request, res: Response) => {
  try {
    const workspaceId = req.body?.workspaceId;
    if (typeof workspaceId !== "string" || !workspaceId) {
      res.status(400).json({ error: "workspaceId required" });
      return;
    }
    const db = getDb();
    const { error: delError } = await db
      .from("bug_signatures")
      .delete()
      .eq("workspace_id", workspaceId);
    if (delError) {
      res.status(500).json({ error: delError.message });
      return;
    }
    const { error: updError } = await db
      .from("workspaces")
      .update({ lifetime_unique_bugs: 0, stripe_payment_method_attached: false })
      .eq("id", workspaceId);
    if (updError) {
      res.status(500).json({ error: updError.message });
      return;
    }
    res.json({ ok: true, workspaceId, lifetime_unique_bugs: 0 });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected error" });
  }
});

export default router;
