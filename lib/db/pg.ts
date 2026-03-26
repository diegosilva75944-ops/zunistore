import "server-only";

import { Pool, type PoolClient } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __zuniPgPool: Pool | undefined;
}

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";
  if (!url.trim()) {
    throw new Error("DATABASE_URL (ou POSTGRES_URL) não configurada para persistência SQL direta.");
  }
  return url;
}

function createPool() {
  const connectionString = getDatabaseUrl();
  const ssl =
    process.env.PGSSLMODE === "disable"
      ? false
      : process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false;
  return new Pool({ connectionString, ssl, max: 5 });
}

export function getPgPool(): Pool {
  if (!global.__zuniPgPool) global.__zuniPgPool = createPool();
  return global.__zuniPgPool;
}

export async function withPgClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPgPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

