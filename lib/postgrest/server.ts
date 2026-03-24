/**
 * PostgREST server helpers - interface de alto nível para uso em server components e API routes.
 * Re-exporta config e fetch, e adiciona builders para params de query.
 */

import "server-only";

import {
  postgrestGet,
  postgrestPost,
  postgrestPatch,
  postgrestDelete,
  postgrestRpc,
  type PostgrestRole,
} from "./fetch";
import { getPostgrestBaseUrl, getPostgrestAnonKey, getPostgrestServiceKey } from "./config";

export { getPostgrestBaseUrl, getPostgrestAnonKey, getPostgrestServiceKey };
export { postgrestGet, postgrestPost, postgrestPatch, postgrestDelete, postgrestRpc, PostgrestError } from "./fetch";

/** Monta query params PostgREST a partir de filtros amigáveis */
export function buildParams(opts: {
  select?: string;
  filters?: Record<string, string>;
  order?: string;
  ascending?: boolean;
  limit?: number;
  offset?: number;
  count?: boolean;
}): Record<string, string> {
  const { select, filters, order, ascending, limit, offset, count } = opts;
  const params: Record<string, string> = {};
  if (select) params.select = select;
  if (filters) Object.assign(params, filters);
  if (order) params.order = ascending ? `${order}.asc` : `${order}.desc`;
  if (limit != null) params.limit = String(limit);
  if (offset != null) params.offset = String(offset);
  return params;
}

/** Helper: eq filter */
export function eq(col: string, val: string | number | boolean | null): string {
  if (val === null) return `${col}=is.null`;
  const v = String(val);
  return `${col}=eq.${encodeURIComponent(v)}`;
}

/** Helper: in filter - retorna valor para usar em params, ex: params.id = inVal(ids) */
export function inVal(vals: (string | number)[]): string {
  return `in.(${vals.map((v) => String(v)).join(",")})`;
}

/** Helper: in filter (legado, retorna col=in.(...)) */
export function inFilter(col: string, vals: (string | number)[]): string {
  return `${col}=${inVal(vals)}`;
}

/** Helper: neq filter */
export function neq(col: string, val: string | number): string {
  return `${col}=neq.${encodeURIComponent(String(val))}`;
}

/** Helper: ilike filter (padrão %value%) */
export function ilike(col: string, pattern: string): string {
  return `${col}=ilike.${encodeURIComponent(pattern)}`;
}

/** Helper: or - ex: orFilter(["title.ilike.%x%", "description.ilike.%x%"]) */
export function orFilter(conditions: string[]): string {
  return `or=(${conditions.join(",")})`;
}

/** Helper: gte filter */
export function gte(col: string, val: number): string {
  return `${col}=gte.${val}`;
}

/** Helper: lte filter */
export function lte(col: string, val: number): string {
  return `${col}=lte.${val}`;
}

/** GET com count - retorna { data, count } via Prefer: count=exact */
export async function postgrestGetWithCount<T = unknown>(
  table: string,
  params: Record<string, string>,
  role: PostgrestRole = "service",
): Promise<{ data: T; count: number }> {
  const base = getPostgrestBaseUrl();
  if (!base) throw new Error("DB_API_URL ou SUPABASE_URL não configurado.");
  const baseNorm = base.replace(/\/+$/, "");
  const path = table.startsWith("rpc/") ? table : table;
  const url = new URL(path, baseNorm + "/");
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  });

  const key = role === "service" ? getPostgrestServiceKey() : getPostgrestAnonKey();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    apikey: key,
    Prefer: "count=exact",
  };

  const res = await fetch(url.toString(), { method: "GET", headers, cache: "no-store" });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`PostgREST error ${res.status}: ${text.slice(0, 200)}`);
  }
  const contentRange = res.headers.get("content-range");
  let count = 0;
  if (contentRange) {
    const m = contentRange.match(/\/(\d+)$/);
    if (m) count = parseInt(m[1], 10);
  }
  const data = text ? (JSON.parse(text) as T) : (undefined as T);
  return { data, count };
}
