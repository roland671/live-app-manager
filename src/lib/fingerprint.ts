import { createHash } from "node:crypto";

/**
 * Extract the top (first) stack frame from a raw stack trace string.
 * Handles V8-style frames such as:
 *   at functionName (/path/to/file.ts:10:5)
 *   at /path/to/file.ts:10:5
 */
function extractTopFrame(stackTrace: string): string {
  const lines = stackTrace.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("at ")) {
      continue;
    }

    return cleanFrame(trimmed.slice(3));
  }

  // Fallback when no "at " frames are present: use the first non-empty line
  const fallback = lines.map((l) => l.trim()).find((l) => l.length > 0);
  return fallback ? cleanFrame(fallback) : "";
}

/**
 * Normalize a stack frame for stable fingerprinting across platforms.
 * - Collapses whitespace
 * - Strips Windows drive letters and leading separators
 * - Normalizes path separators to `/`
 * - Strips `file://` URL prefixes
 */
function cleanFrame(frame: string): string {
  let cleaned = frame.trim().replace(/\s+/g, " ");

  // Normalize file:// URLs: file:///C:/path or file:///path
  cleaned = cleaned.replace(/file:\/\/\/?/gi, "");

  // Normalize path separators
  cleaned = cleaned.replace(/\\/g, "/");

  // Strip Windows drive letter (e.g. C:/ or C:)
  cleaned = cleaned.replace(/\b[A-Za-z]:\//g, "/");

  // Collapse duplicate slashes (but keep protocol-style none expected after cleanup)
  cleaned = cleaned.replace(/\/{2,}/g, "/");

  return cleaned.trim();
}

/**
 * Generate a stable SHA-256 fingerprint for an error from its type and
 * the top stack frame (file, function, and line of origin).
 */
export function generateFingerprint(
  errorType: string,
  stackTrace: string,
): string {
  const topFrame = extractTopFrame(stackTrace);
  const payload = `${errorType.trim()}${topFrame}`;

  return createHash("sha256").update(payload, "utf8").digest("hex");
}
