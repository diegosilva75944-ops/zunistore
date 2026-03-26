/**
 * PostgREST HTTP helpers - fetch direto para API compatível com PostgREST.
 * URLs: `{base}/{table}` e `{base}/rpc/{function}` (base vem de getPostgrestBaseUrl:
 * PostgREST na raiz, ou …/rest/v1 se o proxy / Supabase Cloud assim expuser).
 */

import {
  getPostgrestBaseUrl,
  getPostgrestAnonKey,
  getPostgrestServiceKey,
  getPostgrestServiceKeyForWrites,
} from "./config";

export type PostgrestRole = "anon" | "service";

function getKey(role: PostgrestRole, forWrite: boolean): string {
  if (role === "service") {
    return forWrite ? getPostgrestServiceKeyForWrites() : getPostgrestServiceKey();
  }
  return getPostgrestAnonKey();
}

function buildUrl(tableOrRpc: string, params?: Record<string, string>): string {
  const base = getPostgrestBaseUrl();
  if (!base) throw new Error("POSTGREST_URL, DB_API_URL ou SUPABASE_URL não configurado.");
  const baseNorm = base.replace(/\/+$/, "");
  const path = tableOrRpc.startsWith("rpc/") ? tableOrRpc : tableOrRpc;
  const url = new URL(path, baseNorm + "/");
  if (params && Object.keys(params).length > 0) {
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== "") url.searchParams.set(k, String(v));
    });
  }
  return url.toString();
}

function getHeaders(role: PostgrestRole, contentType?: string, forWrite = false): Record<string, string> {
  const key = getKey(role, forWrite);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    apikey: key,
  };
  if (contentType) headers["Content-Type"] = contentType;
  return headers;
}

export class PostgrestError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "PostgrestError";
  }
}

async function handleResponse<T>(res: Response, parseJson = true): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let details: unknown;
    try {
      details = text ? JSON.parse(text) : undefined;
    } catch {
      details = text || undefined;
    }
    throw new PostgrestError(
      `PostgREST error ${res.status}: ${text.slice(0, 200)}`,
      res.status,
      details,
    );
  }
  if (!parseJson || !text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined as T;
  }
}

/** Query params para GET. Ex: { select: "id,name", id: "eq.123", limit: "1" } */
export async function postgrestGet<T = unknown>(
  table: string,
  params: Record<string, string> = {},
  role: PostgrestRole = "service",
): Promise<T> {
  const url = buildUrl(table, params);
  const res = await fetch(url, {
    method: "GET",
    headers: getHeaders(role, undefined, false),
    cache: "no-store",
  });
  return handleResponse<T>(res);
}

/** POST para insert. Retorna dados se body enviar Prefer: return=representation (opcional). */
export async function postgrestPost<T = unknown>(
  table: string,
  body: unknown,
  role: PostgrestRole = "service",
  opts?: { select?: string; returning?: boolean; upsert?: boolean; onConflict?: string },
): Promise<T> {
  const base = getPostgrestBaseUrl();
  if (!base) throw new Error("POSTGREST_URL, DB_API_URL ou SUPABASE_URL não configurado.");
  const baseNorm = base.replace(/\/+$/, "");
  const path = table.startsWith("rpc/") ? table : table;
  const url = new URL(path, baseNorm + "/");
  const headers = getHeaders(role, "application/json", true);
  const prefers: string[] = [];
  if (opts?.returning !== false && opts?.select) {
    prefers.push("return=representation");
    url.searchParams.set("select", opts.select);
  }
  if (opts?.upsert) {
    prefers.push("resolution=merge-duplicates");
    if (opts.onConflict) url.searchParams.set("on_conflict", opts.onConflict);
  }
  if (prefers.length) headers["Prefer"] = prefers.join(", ");
  const res = await fetch(url.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return handleResponse<T>(res);
}

/** PATCH com filtro. params ex: { id: "eq.123" } */
export async function postgrestPatch(
  table: string,
  body: unknown,
  params: Record<string, string>,
  role: PostgrestRole = "service",
): Promise<void> {
  const url = buildUrl(table, params);
  const res = await fetch(url, {
    method: "PATCH",
    headers: getHeaders(role, "application/json", true),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  await handleResponse(res);
}

/** DELETE com filtro. params ex: { id: "eq.123" } ou { id: "in.(id1,id2)" } */
export async function postgrestDelete(
  table: string,
  params: Record<string, string>,
  role: PostgrestRole = "service",
): Promise<void> {
  const url = buildUrl(table, params);
  const res = await fetch(url, {
    method: "DELETE",
    headers: getHeaders(role, undefined, true),
    cache: "no-store",
  });
  await handleResponse(res);
}

/** RPC: POST /rpc/{function} */
export async function postgrestRpc<T = unknown>(
  fn: string,
  args: Record<string, unknown> = {},
  role: PostgrestRole = "service",
): Promise<T> {
  return postgrestPost<T>(`rpc/${fn}`, args, role, { returning: false });
}
