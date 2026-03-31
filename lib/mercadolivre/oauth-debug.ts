import "server-only";

import { PostgrestError } from "@/lib/postgrest/server";

function pick(obj: any, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (obj?.[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

export function serializeError(e: unknown): Record<string, unknown> {
  if (e instanceof PostgrestError) {
    return {
      name: e.name,
      message: e.message,
      status: e.status,
      details: e.details,
    };
  }
  // MercadoLivreApiError (lib/mercadolivre/client.ts) e TokenStorePersistenceError (token-store.ts)
  if (e && typeof e === "object") {
    const o = e as any;
    const base: Record<string, unknown> = {
      name: typeof o.name === "string" ? o.name : "ErrorLike",
      message: typeof o.message === "string" ? o.message : String(e),
    };
    const extra = pick(o, [
      "code",
      "reason",
      "status",
      "externalStatus",
      "url",
      "detail",
      "sqlState",
      "details",
      "cause",
    ]);
    return {
      ...base,
      ...extra,
      stack: process.env.NODE_ENV !== "production" && typeof o.stack === "string" ? o.stack : undefined,
    };
  }
  if (e instanceof Error) {
    return {
      name: e.name,
      message: e.message,
      stack: process.env.NODE_ENV !== "production" ? e.stack : undefined,
    };
  }
  return { message: String(e) };
}

