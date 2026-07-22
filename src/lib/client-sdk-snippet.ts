export interface LiveAppMonitorConfig {
  workspaceId: string;
  /** Base URL of the Live App backend (e.g. https://api.example.com) */
  endpointUrl: string;
}

const SANDBOX_WARNING =
  "Live App Manager: Sandbox limit reached (10 bugs). Please link a payment card in your dashboard to continue tracking new issues.";

function trackUrl(endpointUrl: string): string {
  return `${endpointUrl.replace(/\/+$/, "")}/api/v1/track`;
}

function reportError(
  config: LiveAppMonitorConfig,
  errorType: string,
  message: string,
  stackTrace: string,
): void {
  // Fire-and-forget: never block the host app
  void fetch(trackUrl(config.endpointUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: config.workspaceId,
      errorType,
      message,
      stackTrace,
    }),
    keepalive: true,
  })
    .then((res) => {
      if (res.status === 402) {
        console.warn(SANDBOX_WARNING);
      }
    })
    .catch(() => {
      // Swallow network failures — monitoring must never impact the host
    });
}

function fromUnknown(err: unknown): {
  errorType: string;
  message: string;
  stackTrace: string;
} {
  if (err instanceof Error) {
    return {
      errorType: err.name || "Error",
      message: err.message || String(err),
      stackTrace: err.stack || `${err.name}: ${err.message}`,
    };
  }

  const message = typeof err === "string" ? err : JSON.stringify(err);
  return {
    errorType: "Error",
    message,
    stackTrace: message,
  };
}

/**
 * Drop-in client SDK: captures uncaught errors and reports them to Live App.
 * Safe for browser and Node. Non-blocking; never throws into the host app.
 */
export function initLiveAppMonitor(config: LiveAppMonitorConfig): void {
  if (!config.workspaceId || !config.endpointUrl) {
    console.warn("Live App Manager: initLiveAppMonitor requires workspaceId and endpointUrl.");
    return;
  }

  // Browser (typed structurally so this reference snippet compiles in Node builds)
  const g = globalThis as typeof globalThis & {
    addEventListener?: (
      type: string,
      listener: (event: {
        error?: unknown;
        message?: string;
        reason?: unknown;
      }) => void,
    ) => void;
  };

  if (typeof g.addEventListener === "function") {
    g.addEventListener("error", (event) => {
      const error = event.error instanceof Error ? event.error : null;
      reportError(
        config,
        error?.name || "Error",
        error?.message || event.message || "Unknown error",
        error?.stack || event.message || "Unknown error",
      );
    });

    g.addEventListener("unhandledrejection", (event) => {
      const { errorType, message, stackTrace } = fromUnknown(event.reason);
      reportError(config, errorType, message, stackTrace);
    });
  }

  // Node.js
  if (typeof process !== "undefined" && typeof process.on === "function") {
    process.on("uncaughtException", (err) => {
      const { errorType, message, stackTrace } = fromUnknown(err);
      reportError(config, errorType, message, stackTrace);
    });

    process.on("unhandledRejection", (reason) => {
      const { errorType, message, stackTrace } = fromUnknown(reason);
      reportError(config, errorType, message, stackTrace);
    });
  }
}
