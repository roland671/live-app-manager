/**
 * Environment configuration helpers for open-source / public deployments.
 */

export const SUPABASE_CONFIG_ERROR =
  "Missing or invalid Supabase environment configuration. Please copy .env.example to .env and supply your credentials.";

const PLACEHOLDER_RE =
  /YOUR_|_HERE|changeme|example\.supabase|YOUR_PUBLIC_SUPABASE|YOUR_PRIVATE_SERVICE/i;

export function envValue(name: string): string | undefined {
  const raw = process.env[name];
  if (raw == null) return undefined;
  return raw.trim().replace(/^["']|["']$/g, "");
}

/** True when Supabase URL/key are missing, placeholders, or not a valid HTTP(S) URL. */
export function hasInvalidSupabaseConfig(): boolean {
  const url = envValue("NEXT_PUBLIC_SUPABASE_URL");
  const key = envValue("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !key) return true;
  if (PLACEHOLDER_RE.test(url) || PLACEHOLDER_RE.test(key)) return true;
  if (!/^https?:\/\//i.test(url)) return true;

  return false;
}

/**
 * Startup / initializer guard. Logs a clear public-facing error when
 * credentials are absent or still set to .env.example placeholders.
 */
let configErrorLogged = false;

export function assertSupabaseEnvConfigured(): boolean {
  if (!hasInvalidSupabaseConfig()) {
    return true;
  }

  if (!configErrorLogged) {
    configErrorLogged = true;
    console.error(SUPABASE_CONFIG_ERROR);
  }
  return false;
}
