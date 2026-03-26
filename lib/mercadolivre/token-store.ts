import "server-only";

import { postgrestGet, postgrestPost } from "@/lib/postgrest/server";
import { getPostgrestBaseUrl } from "@/lib/postgrest/server";
import { getPostgrestServiceKeyForWrites } from "@/lib/postgrest/config";
import { PostgrestError } from "@/lib/postgrest/fetch";

export type MercadoLivreTokenRow = {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  token_type: string;
  scope: string | null;
  expires_in: number;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export async function getMlTokenByUserId(userId: string): Promise<MercadoLivreTokenRow | null> {
  const rows = await postgrestGet<any[]>("mercadolivre_tokens", {
    select: "id,user_id,access_token,refresh_token,token_type,scope,expires_in,expires_at,created_at,updated_at",
    user_id: `eq.${encodeURIComponent(userId)}`,
    limit: "1",
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ? (row as MercadoLivreTokenRow) : null;
}

export async function upsertMlToken(input: {
  user_id: string;
  access_token: string;
  refresh_token: string;
  token_type: string;
  scope: string | null;
  expires_in: number;
  expires_at: string;
}): Promise<void> {
  const table = "mercadolivre_tokens";
  const debug = process.env.NODE_ENV !== "production";
  const payload = {
    user_id: input.user_id,
    access_token: input.access_token,
    refresh_token: input.refresh_token,
    token_type: input.token_type,
    scope: input.scope,
    expires_in: input.expires_in,
    expires_at: input.expires_at,
    updated_at: new Date().toISOString(),
  };

  if (debug) {
    let hasWriteKey = false;
    try {
      hasWriteKey = Boolean(getPostgrestServiceKeyForWrites());
    } catch {
      hasWriteKey = false;
    }
    console.log("[ml-oauth][token-store] upsert:start", {
      table,
      baseUrl: getPostgrestBaseUrl(),
      client: "postgrest",
      role: "service",
      hasServiceRoleKeyForWrites: hasWriteKey,
      userId: input.user_id,
      token_type: input.token_type,
      expires_at: input.expires_at,
      has_access_token: Boolean(input.access_token),
      has_refresh_token: Boolean(input.refresh_token),
    });
  }

  try {
    await postgrestPost(table, payload, "service", { upsert: true, onConflict: "user_id", returning: false });
  } catch (e) {
    console.error("[ml-oauth][token-store] upsert:failed", {
      table,
      baseUrl: getPostgrestBaseUrl(),
      error: e,
    });
    if (e instanceof PostgrestError && e.status === 404) {
      // Ex.: "Could not find the table 'public.mercadolivre_tokens' in the schema cache"
      console.error("[ml-oauth][token-store] hint", {
        hint:
          "Tabela não encontrada no PostgREST (schema cache). Verifique se a migration `mercadolivre_tokens` foi aplicada no banco de produção e recarregue o schema cache da API, se necessário.",
        details: e.details,
      });
    }
    throw e;
  } finally {
    if (debug) console.log("[ml-oauth][token-store] upsert:done", { table, userId: input.user_id });
  }
}

