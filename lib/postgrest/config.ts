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

/**
 * PostgREST valida o header `Authorization: Bearer <jwt>` como JWT de **3 segmentos** (header.payload.signature).
 * PGRST301 "Expected 3 parts in JWT; got 5" costuma vir de:
 * - prefixo `Bearer ` colado dentro do .env
 * - aspas ou quebra de linha no meio do token
 * - dois JWTs colados (ou lixo após o primeiro token)
 * - chaves novas `sb_publishable_*` / `sb_secret_*` (não são JWT — alguns PostgRESTs não aceitam)
 */
export function normalizePostgrestApiKey(raw: string | undefined): string {
  if (raw == null) return "";
  let s = String(raw).trim();
  if (!s) return "";
  if (/^bearer\s+/i.test(s)) {
    s = s.replace(/^bearer\s+/i, "").trim();
  }
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }

  const looksLikeJwtHeader = (first: string) => first.startsWith("eyJ");

  /** Vários tokens separados por espaço — usa o primeiro JWT válido. */
  const byWhitespace = s.split(/\s+/).filter(Boolean);
  if (byWhitespace.length > 1) {
    for (const t of byWhitespace) {
      const parts = t.split(".");
      if (parts.length === 3 && looksLikeJwtHeader(parts[0])) {
        return t;
      }
    }
  }

  const parts = s.split(".");
  if (parts.length !== 3 && looksLikeJwtHeader(parts[0] ?? "")) {
    if (parts.length > 3) {
      return parts.slice(0, 3).join(".");
    }
  }

  return s;
}

function warnIfNonJwtSupabaseKey(key: string, label: string) {
  if (!key || key === "local-dev-key") return;
  if (key.startsWith("sb_publishable_") || key.startsWith("sb_secret_")) {
    console.warn(
      `[postgrest] ${label}: chave no formato sb_publishable_/sb_secret_ não é um JWT. PostgREST costuma exigir o JWT anon (anon public) em Settings → API. Se o erro PGRST301 continuar, copie a chave "anon" / "public" em formato eyJ... com três partes separadas por ponto.`,
    );
  }
}

export function getPostgrestAnonKey(): string {
  const raw =
    [process.env.DB_ANON_KEY, process.env.SUPABASE_ANON_KEY, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY].find(
      (x) => typeof x === "string" && x.trim() !== "",
    ) ?? "local-dev-key";
  const key = normalizePostgrestApiKey(raw);
  if (!key || key === "local-dev-key") {
    return "local-dev-key";
  }
  warnIfNonJwtSupabaseKey(key, "SUPABASE_ANON_KEY");
  return key;
}

/** Leituras (GET): aceita fallback para anon se a service não estiver definida. */
export function getPostgrestServiceKey(): string {
  const raw =
    [process.env.DB_SERVICE_ROLE_KEY, process.env.DB_SERVICE_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY].find(
      (x) => typeof x === "string" && x.trim() !== "",
    ) ?? "";
  const trimmed = normalizePostgrestApiKey(raw);
  if (trimmed) {
    warnIfNonJwtSupabaseKey(trimmed, "SUPABASE_SERVICE_ROLE_KEY");
    return trimmed;
  }
  return getPostgrestAnonKey();
}

/**
 * Escritas (POST/PATCH/DELETE/RPC): **não** usa anon como fallback.
 * No Supabase, a anon só tem SELECT nas tabelas públicas; sem a service role o PATCH/INSERT falha (403/permission denied).
 */
export function getPostgrestServiceKeyForWrites(): string {
  const raw =
    [process.env.DB_SERVICE_ROLE_KEY, process.env.DB_SERVICE_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY].find(
      (x) => typeof x === "string" && x.trim() !== "",
    ) ?? "";
  const trimmed = normalizePostgrestApiKey(raw);
  if (!trimmed) {
    throw new Error(
      "Configure SUPABASE_SERVICE_ROLE_KEY (ou DB_SERVICE_ROLE_KEY / DB_SERVICE_KEY) no servidor. A chave anon não permite atualizar produtos nem gravar histórico de preços.",
    );
  }
  warnIfNonJwtSupabaseKey(trimmed, "SUPABASE_SERVICE_ROLE_KEY");
  return trimmed;
}
