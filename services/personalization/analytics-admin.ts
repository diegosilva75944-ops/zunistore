import "server-only";

import { postgrestGet } from "@/lib/postgrest/server";

function countBy<T extends string | number>(rows: any[], key: string, limit: number): { id: T; count: number }[] {
  const m = new Map<T, number>();
  for (const r of rows) {
    const id = r[key] as T;
    if (id == null || id === "") continue;
    m.set(id, (m.get(id) ?? 0) + 1);
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, count]) => ({ id, count }));
}

export async function adminTopSearches(limit: number) {
  const rows = await postgrestGet<any[]>("user_search_events", {
    select: "normalized_term",
    order: "created_at.desc",
    limit: "8000",
  });
  const list = Array.isArray(rows) ? rows : [];
  const m = new Map<string, number>();
  for (const r of list) {
    const t = String(r.normalized_term ?? "").trim();
    if (!t) continue;
    m.set(t, (m.get(t) ?? 0) + 1);
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

export async function adminTopClickedProducts(limit: number) {
  const rows = await postgrestGet<any[]>("user_product_click_events", {
    select: "product_id",
    order: "created_at.desc",
    limit: "8000",
  });
  return countBy(Array.isArray(rows) ? rows : [], "product_id", limit);
}

export async function adminTopViewedProducts(limit: number) {
  const rows = await postgrestGet<any[]>("user_product_view_events", {
    select: "product_id",
    order: "created_at.desc",
    limit: "8000",
  });
  return countBy(Array.isArray(rows) ? rows : [], "product_id", limit);
}

export async function adminTopCategories(limit: number) {
  const rows = await postgrestGet<any[]>("user_category_visit_events", {
    select: "category_id",
    order: "created_at.desc",
    limit: "8000",
  });
  return countBy(Array.isArray(rows) ? rows : [], "category_id", limit);
}
