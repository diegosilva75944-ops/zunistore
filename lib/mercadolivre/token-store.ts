import "server-only";

import { withPgClient } from "@/lib/db/pg";

export class TokenStorePersistenceError extends Error {
  constructor(
    message: string,
    public reason: string,
    public status: number,
    public sqlState?: string,
    public detail?: string,
    public original?: unknown,
  ) {
    super(message);
    this.name = "TokenStorePersistenceError";
  }
}

function classifySqlPersistenceError(err: unknown): TokenStorePersistenceError {
  if (err instanceof Error && /DATABASE_URL|POSTGRES_URL/.test(err.message)) {
    return new TokenStorePersistenceError(
      "DATABASE_URL/POSTGRES_URL não configurada no servidor.",
      "database_url_missing",
      500,
      undefined,
      err.message,
      err,
    );
  }

  const e = err as { code?: string; message?: string; detail?: string };
  if (typeof e?.code === "string") {
    if (e.code === "28P01") return new TokenStorePersistenceError("Falha de autenticação no banco.", "db_auth_failed", 500, e.code, e.message, err);
    if (e.code === "3D000") return new TokenStorePersistenceError("Banco não encontrado.", "db_not_found", 500, e.code, e.message, err);
    if (e.code === "42P01") return new TokenStorePersistenceError("Tabela de tokens não encontrada.", "db_table_not_found", 500, e.code, e.message, err);
    if (e.code === "42501") return new TokenStorePersistenceError("Permissão negada no banco.", "db_permission_denied", 500, e.code, e.message, err);
    if (e.code === "23505") return new TokenStorePersistenceError("Violação de unicidade no upsert.", "db_unique_violation", 409, e.code, e.message, err);
    return new TokenStorePersistenceError("Erro SQL ao salvar tokens.", "db_sql_error", 500, e.code, e.message ?? e.detail, err);
  }

  if (err instanceof Error) {
    const msg = err.message || "Erro desconhecido ao persistir token.";
    if (/timeout|timed out|ETIMEDOUT/i.test(msg)) {
      return new TokenStorePersistenceError("Timeout na conexão com banco.", "db_timeout", 500, undefined, msg, err);
    }
    if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ECONNRESET/i.test(msg)) {
      return new TokenStorePersistenceError("Falha de conectividade com banco.", "db_network_error", 500, undefined, msg, err);
    }
    return new TokenStorePersistenceError("Erro desconhecido ao persistir token.", "db_unknown_error", 500, undefined, msg, err);
  }

  return new TokenStorePersistenceError(
    "Erro desconhecido ao persistir token.",
    "db_unknown_error",
    500,
    undefined,
    "Erro sem mensagem estruturada.",
    err,
  );
}

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
    const classified = classifySqlPersistenceError(e);
    console.error("[ml-oauth][token-store] upsert:failed", {
      table,
      client: "postgres",
      path: "sql-direct",
      reason: classified.reason,
      status: classified.status,
      sqlState: classified.sqlState,
      detail: classified.detail,
      payload: {
        ...payload,
        access_token: typeof input.access_token === "string" ? `${input.access_token.slice(0, 6)}…${input.access_token.slice(-4)}` : null,
        refresh_token:
          typeof input.refresh_token === "string" ? `${input.refresh_token.slice(0, 6)}…${input.refresh_token.slice(-4)}` : null,
      },
      error: classified.original ?? e,
    });
    throw classified;
  } finally {
    if (debug) console.log("[ml-oauth][token-store] upsert:done", { table, userId: input.user_id });
  }
}

