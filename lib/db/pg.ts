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

function resolveSslOption(): false | { rejectUnauthorized: boolean } | undefined {
  const mode = String(process.env.PGSSLMODE ?? "").trim().toLowerCase();
  if (mode === "disable") return false;
  if (mode === "require" || mode === "verify-ca" || mode === "verify-full") {
    return { rejectUnauthorized: false };
  }
  // undefined => deixa o driver usar o que vier da connection string (sslmode)
  return undefined;
}

function createPool() {
  const connectionString = getDatabaseUrl();
  const ssl = resolveSslOption();
  return new Pool({ connectionString, ssl, max: 5 });
}

export function getPgPool(): Pool {
  if (!global.__zuniPgPool) global.__zuniPgPool = createPool();
  return global.__zuniPgPool;
}

export async function withPgClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  let client: PoolClient | null = null;
  try {
    client = await getPgPool().connect();
    return await fn(client);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err ?? "");
    // Fallback de compatibilidade: alguns bancos locais/managed recusam SSL.
    if (/does not support ssl connections/i.test(msg)) {
      global.__zuniPgPool = new Pool({
        connectionString: getDatabaseUrl(),
        ssl: false,
        max: 5,
      });
      const retryClient = await getPgPool().connect();
      try {
        return await fn(retryClient);
      } finally {
        retryClient.release();
      }
    }
    throw err;
  } finally {
    client?.release();
  }
}

