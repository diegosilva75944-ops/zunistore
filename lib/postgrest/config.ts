/**
 * URL base da API PostgREST (lib/postgrest/fetch.ts).
 *
 * O projeto usa **PostgREST** direto (PostgreSQL + PostgREST), não o produto
 * “Supabase” obrigatoriamente. Os nomes SUPABASE_* no .env são só aliases
 * históricos / compatíveis com o cliente @supabase/supabase-js, que fala HTTP
 * com a mesma API PostgREST.
 *
 * Prioridade: POSTGREST_URL → DB_API_URL → SUPABASE_URL
 *
 * PostgREST “puro” costuma expor em `{base}/tabela` e `{base}/rpc/fn` (base na
 * raiz ou atrás de proxy). **Se** o host for o projeto hospedado em
 * *.supabase.co (ou CLI local na porta 54321), normalizamos para `{origin}/rest/v1`.
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
      return `${u.origin}/rest/v1`;
    }
  } catch {
    return s;
  }
  return s;
}

export function getPostgrestBaseUrl(): string {
  const base =
    process.env.POSTGREST_URL ??
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
