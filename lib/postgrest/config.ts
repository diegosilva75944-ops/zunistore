/**
 * PostgREST config - resolve env vars for API base URL and keys.
 * Compatible with SUPABASE_* and DB_* aliases.
 *
 * Supabase Cloud / CLI local expõem a REST API em .../rest/v1, mas SUPABASE_URL
 * costuma vir sem esse sufixo (igual ao createClient). Ajustamos aqui para os
 * fetches HTTP em lib/postgrest/fetch.ts baterem no endpoint certo.
 */
function normalizePostgrestBaseUrl(raw: string): string {
  const s = String(raw).trim().replace(/\/+$/, "");
  if (!s) return "";
  try {
    const u = new URL(s);
    const host = u.hostname;
    const supabaseCloud =
      host.endsWith(".supabase.co") || host.endsWith(".supabase.in");
    const supabaseLocalCli = u.port === "54321";
    if (supabaseCloud || supabaseLocalCli) {
      // Sempre origin + /rest/v1 (ignora paths extras tipo .../rest/v1/foo que quebram o PostgREST)
      return `${u.origin}/rest/v1`;
    }
  } catch {
    return s;
  }
  return s;
}

export function getPostgrestBaseUrl(): string {
  const base =
    process.env.DB_API_URL ??
    process.env.SUPABASE_URL ??
    "";
  return normalizePostgrestBaseUrl(base);
}

export function getPostgrestAnonKey(): string {
  return (
    process.env.DB_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    "local-dev-key"
  );
}

export function getPostgrestServiceKey(): string {
  return (
    process.env.DB_SERVICE_ROLE_KEY ??
    process.env.DB_SERVICE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    getPostgrestAnonKey()
  );
}
