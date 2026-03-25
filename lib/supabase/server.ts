import "server-only";

import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

/**
 * O @supabase/supabase-js faz `new URL("rest/v1", baseUrl)` para o PostgREST.
 * Qualquer sufixo após o host (incl. /rest/v1 ou paths errados) duplica ou quebra o path.
 * Para projetos Supabase hospedados usamos só a origin (https://ref.supabase.co).
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

