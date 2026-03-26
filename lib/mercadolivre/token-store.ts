import "server-only";

import { postgrestGet, postgrestPost } from "@/lib/postgrest/server";

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
  await postgrestPost(
    "mercadolivre_tokens",
    {
      user_id: input.user_id,
      access_token: input.access_token,
      refresh_token: input.refresh_token,
      token_type: input.token_type,
      scope: input.scope,
      expires_in: input.expires_in,
      expires_at: input.expires_at,
      updated_at: new Date().toISOString(),
    },
    "service",
    { upsert: true, onConflict: "user_id", returning: false },
  );
}

