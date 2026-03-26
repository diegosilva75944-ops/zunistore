import "server-only";

import { withPgClient } from "@/lib/db/pg";

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
  const debug = process.env.NODE_ENV !== "production";
  if (debug) {
    console.log("[ml-oauth][token-store] read:sql", {
      table: "public.mercadolivre_tokens",
      path: "sql-direct",
      userId: userId,
    });
  }
  const row = await withPgClient(async (client) => {
    const res = await client.query<MercadoLivreTokenRow>(
      `select id, user_id, access_token, refresh_token, token_type, scope, expires_in, expires_at, created_at, updated_at
       from public.mercadolivre_tokens
       where user_id = $1
       limit 1`,
      [userId],
    );
    return res.rows[0] ?? null;
  });
  return row;
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
  const table = "public.mercadolivre_tokens";
  const debug = process.env.NODE_ENV !== "production";
  const payload: Record<string, unknown> = {
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
    console.log("[ml-oauth][token-store] upsert:start", {
      table,
      client: "postgres",
      path: "sql-direct",
      userId: input.user_id,
      token_type: input.token_type,
      expires_at: input.expires_at,
      has_access_token: Boolean(input.access_token),
      has_refresh_token: Boolean(input.refresh_token),
    });
  }

  try {
    await withPgClient(async (client) => {
      await client.query(
        `insert into public.mercadolivre_tokens
          (user_id, access_token, refresh_token, token_type, scope, expires_in, expires_at, updated_at)
         values
          ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (user_id) do update set
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          token_type = excluded.token_type,
          scope = excluded.scope,
          expires_in = excluded.expires_in,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at`,
        [
          input.user_id,
          input.access_token,
          input.refresh_token,
          input.token_type,
          input.scope,
          input.expires_in,
          input.expires_at,
          payload.updated_at,
        ],
      );
    });
  } catch (e) {
    console.error("[ml-oauth][token-store] upsert:failed", {
      table,
      client: "postgres",
      path: "sql-direct",
      payload: {
        ...payload,
        access_token: typeof input.access_token === "string" ? `${input.access_token.slice(0, 6)}…${input.access_token.slice(-4)}` : null,
        refresh_token:
          typeof input.refresh_token === "string" ? `${input.refresh_token.slice(0, 6)}…${input.refresh_token.slice(-4)}` : null,
      },
      error: e,
    });
    throw e;
  } finally {
    if (debug) console.log("[ml-oauth][token-store] upsert:done", { table, userId: input.user_id });
  }
}

