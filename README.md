# Live App OSS Backend

## Project Overview

An isolated, lightweight **Ingestion API & Visual Dashboard** for error tracking. Drop it into your stack to capture, fingerprint, and review runtime failures — with an Open Source sandbox gate that keeps usage predictable while you evaluate the system.

## Features

- **Automated SHA-256 error deduplication** — fingerprints errors from type + top stack frame so repeats collapse into a single signature
- **Built-in open-source sandbox billing gates** — free tier allows **10 unique bugs** per workspace; further new signatures return HTTP `402` until a payment method is attached
- **Dual-mode database layers** — local JSON mock store for offline demos, or live Supabase cloud when real credentials are configured
- **Studio Day dashboards** — User / Admin / Health views at `/dashboard/*` for visual triage and ops overview

## Quick Start

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd liveapp-oss-backend

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env and replace placeholder Supabase values (optional for local mock mode)

# 4. Start the development server
npm run dev
```

The API listens on **http://localhost:4000** by default (`PORT` in `.env`).

Useful endpoints:

| Route | Description |
|-------|-------------|
| `GET /health` | Liveness check |
| `POST /api/v1/track` | Error ingestion |
| `GET /dashboard/user?workspaceId=demo` | User dashboard |
| `GET /dashboard/admin` | Admin overview |
| `GET /dashboard/health` | Stability monitor |

## Client Integration Snippet

Send errors from any external app with a simple `fetch()` to the track endpoint:

```ts
async function reportError(error: Error, workspaceId: string) {
  const res = await fetch("http://localhost:4000/api/v1/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId,
      errorType: error.name || "Error",
      message: error.message,
      stackTrace: error.stack || `${error.name}: ${error.message}`,
    }),
  });

  if (res.status === 201 || res.status === 200) {
    // Issue tracked (created or duplicate occurrence logged)
    const data = await res.json();
    console.log("Tracked:", data);
    return;
  }

  if (res.status === 402) {
    // Sandbox limit reached (10 unique bugs) — attach a payment method to continue
    console.warn("Sandbox limit breached — payment required for new signatures");
    return;
  }

  console.error("Track failed:", res.status, await res.text());
}

// Example
try {
  throw new TypeError("Cannot read properties of undefined (reading 'map')");
} catch (err) {
  void reportError(err as Error, "your-workspace-id");
}
```

**Response codes**

- **`201`** — new unique signature created and tracked  
- **`200`** — existing signature; occurrence count incremented  
- **`402`** — sandbox limit breached (10 unique bugs); no new signature written  

For a drop-in global handler, see also `src/lib/client-sdk-snippet.ts` (`initLiveAppMonitor`).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server with live reload (`tsx watch`) |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run production build |
| `npm run test:live-sandbox` | Isolated gate integration test (temp workspace + cleanup) |

## Client package (`live-app-manager`)

```bash
npm install live-app-manager
```

```ts
import { trackLiveState } from "live-app-manager";

await trackLiveState(workspaceId, {
  errorType: error.name,
  message: error.message,
  stackTrace: error.stack ?? String(error),
});
```

See `packages/client`, `llms.txt`, and `RELEASE.md` for AI distribution context and publish steps.

## License

MIT © 2026 Studio / Open Source Telemetry Team
