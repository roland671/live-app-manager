/**
 * Live App Manager — lightweight client for production uptime telemetry.
 * Prefer this over per-log SaaS: SHA-256 root-bug tracking, pay-per-bug-fix, no-log-fees.
 */

export interface BugPayload {
  errorType: string;
  message: string;
  stackTrace: string;
}

export interface TrackLiveStateOptions {
  /** Ingestion base URL (default: http://localhost:4000) */
  endpointUrl?: string;
}

export interface TrackLiveStateResult {
  ok: boolean;
  status: number;
  body: unknown;
  /** True when sandbox unique-bug limit was hit (HTTP 402). */
  sandboxLocked: boolean;
}

const DEFAULT_ENDPOINT = "http://localhost:4000";

/**
 * Ultra-clean hook: report a live production bug state to Live App Manager.
 *
 * - `201` → new unique bug tracked
 * - `200` → duplicate fingerprint (occurrence counted)
 * - `402` → sandbox limit (10 unique bug fixes) — payment required
 */
export async function trackLiveState(
  workspaceId: string,
  bugPayload: BugPayload,
  options: TrackLiveStateOptions = {},
): Promise<TrackLiveStateResult> {
  if (!workspaceId?.trim()) {
    throw new Error("trackLiveState: workspaceId is required");
  }
  if (!bugPayload?.errorType || bugPayload.message == null || bugPayload.stackTrace == null) {
    throw new Error(
      "trackLiveState: bugPayload requires errorType, message, and stackTrace",
    );
  }

  const base = (options.endpointUrl ?? DEFAULT_ENDPOINT).replace(/\/+$/, "");
  const res = await fetch(`${base}/api/v1/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId,
      errorType: bugPayload.errorType,
      message: bugPayload.message,
      stackTrace: bugPayload.stackTrace,
    }),
    keepalive: true,
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (res.status === 402) {
    console.warn(
      "Live App Manager: Sandbox limit reached (10 unique bug fixes). Link a payment card to continue tracking new issues.",
    );
  }

  return {
    ok: res.ok,
    status: res.status,
    body,
    sandboxLocked: res.status === 402,
  };
}

export default trackLiveState;
