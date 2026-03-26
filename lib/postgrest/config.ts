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

/** Leituras (GET): aceita fallback para anon se a service não estiver definida. */
export function getPostgrestServiceKey(): string {
  const s =
    process.env.DB_SERVICE_ROLE_KEY ??
    process.env.DB_SERVICE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "";
  const trimmed = String(s).trim();
  if (trimmed) return trimmed;
  return getPostgrestAnonKey();
}

/**
 * Escritas (POST/PATCH/DELETE/RPC): **não** usa anon como fallback.
 * No Supabase, a anon só tem SELECT nas tabelas públicas; sem a service role o PATCH/INSERT falha (403/permission denied).
 */
export function getPostgrestServiceKeyForWrites(): string {
  const s =
    process.env.DB_SERVICE_ROLE_KEY ??
    process.env.DB_SERVICE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "";
  const trimmed = String(s).trim();
  if (!trimmed) {
    throw new Error(
      "Configure SUPABASE_SERVICE_ROLE_KEY (ou DB_SERVICE_ROLE_KEY / DB_SERVICE_KEY) no servidor. A chave anon não permite atualizar produtos nem gravar histórico de preços.",
    );
  }
  return trimmed;
}
