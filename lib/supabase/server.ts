import "server-only";

import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

/**
 * @supabase/supabase-js é um cliente HTTP PostgREST; aqui usamos o mesmo backend
 * que lib/postgrest/fetch (PostgreSQL + PostgREST), não “o banco Supabase” como produto.
 * O SDK faz `new URL("rest/v1", baseUrl)`; paths extras quebram a URL. Em *.supabase.co
 * usamos só origin; em outros hosts removemos sufixo /rest/v1 se existir.
 */
function supabaseProjectUrlForClient(raw: string): string {
  const s = String(raw).trim();
  if (!s) return s;
  try {
    const u = new URL(s);
    if (u.hostname.endsWith(".supabase.co") || u.hostname.endsWith(".supabase.in")) {
      return u.origin;
    }
    if (u.port === "54321") {
      return u.origin;
    }
  } catch {
    return s.replace(/\/+$/, "");
  }
  let out = s.replace(/\/+$/, "");
  if (/\/rest\/v1$/i.test(out)) {
    out = out.replace(/\/rest\/v1$/i, "").replace(/\/+$/, "");
  }
  return out;
}

export function getSupabaseAnonServerClient() {
  const env = requireEnv();
  const url = supabaseProjectUrlForClient(env.SUPABASE_URL);
  return createClient(url, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getSupabaseServiceRoleClient() {
  const env = requireEnv();
  const url = supabaseProjectUrlForClient(env.SUPABASE_URL);
  return createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

