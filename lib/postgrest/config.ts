/**
 * PostgREST config - resolve env vars for API base URL and keys.
 * Compatible with SUPABASE_* and DB_* aliases.
 */

export function getPostgrestBaseUrl(): string {
  const base =
    process.env.DB_API_URL ??
    process.env.SUPABASE_URL ??
    "";
  return String(base).replace(/\/+$/, "");
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
