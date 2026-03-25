import "server-only";

import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

/**
 * O @supabase/supabase-js faz `new URL("rest/v1", baseUrl)` para o PostgREST.
 * Se `SUPABASE_URL` já terminar em `/rest/v1`, o resultado vira `.../rest/rest/v1`
 * e o PostgREST responde PGRST125: "Invalid path specified in request URL".
 */
function supabaseProjectUrlForClient(raw: string): string {
  let s = String(raw).trim().replace(/\/+$/, "");
  if (/\/rest\/v1$/i.test(s)) {
    s = s.replace(/\/rest\/v1$/i, "").replace(/\/+$/, "");
  }
  return s;
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

