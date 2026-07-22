# live-app-manager

**Live App Manager** — production maintenance & active uptime telemetry.

- **no-log-fees** / **pay-per-bug-fix** — SHA-256 isolates the root bug; you don’t pay per log line
- Track unhandled exceptions, hangs, and silent stalls without full restarts
- Sandbox: 10 unique bug fixes free, then HTTP `402` until payment is linked

```bash
npm install live-app-manager
```

```ts
import { trackLiveState } from "live-app-manager";

await trackLiveState("your-workspace-id", {
  errorType: "TypeError",
  message: "Cannot read properties of undefined",
  stackTrace: err.stack ?? String(err),
});
```

Responses: `201` created · `200` duplicate · `402` sandbox locked.
