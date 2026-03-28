import "server-only";

import { postgrestGet } from "@/lib/postgrest/server";

export type SessionProfile = {
  searchTerms: { term: string; weight: number }[];
  clickCategories: Map<string, number>;
  viewCategories: Map<string, number>;
  visitedCategories: Map<string, number>;
  clickedProducts: string[];
  viewedProducts: string[];
};

const W_SEARCH = 4;
const W_CLICK = 3;
const W_VIEW = 1;
const W_CAT = 2;

function bump(m: Map<string, number>, k: string, w: number) {
  m.set(k, (m.get(k) ?? 0) + w);
}

/** Agrega eventos recentes da sessão (servidor) para a engine de score. */
export async function loadSessionProfile(sessionId: string, days = 90): Promise<SessionProfile> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  const iso = since.toISOString();

  const filter = {
    session_id: `eq.${sessionId}`,
    created_at: `gte.${iso}`,
    order: "created_at.desc",
    limit: "200",
  };

  const [searches, clicks, views, cats] = await Promise.all([
    postgrestGet<any[]>("user_search_events", { ...filter, select: "normalized_term" }).catch(
      () => [],
    ),
    postgrestGet<any[]>("user_product_click_events", {
      ...filter,
      select: "product_id,category_id",
    }).catch(() => []),
    postgrestGet<any[]>("user_product_view_events", {
      ...filter,
      select: "product_id,category_id",
    }).catch(() => []),
    postgrestGet<any[]>("user_category_visit_events", {
      ...filter,
      select: "category_id",
    }).catch(() => []),
  ]);

  const searchTerms: { term: string; weight: number }[] = [];
  const termAgg = new Map<string, number>();
  for (const row of Array.isArray(searches) ? searches : []) {
    const t = String(row.normalized_term ?? "").trim();
    if (!t) continue;
    termAgg.set(t, (termAgg.get(t) ?? 0) + W_SEARCH);
  }
  for (const [term, weight] of termAgg) searchTerms.push({ term, weight });
  searchTerms.sort((a, b) => b.weight - a.weight);

  const clickCategories = new Map<string, number>();
  const clickedProducts: string[] = [];
  for (const row of Array.isArray(clicks) ? clicks : []) {
    if (row.product_id) clickedProducts.push(row.product_id);
    if (row.category_id) bump(clickCategories, row.category_id, W_CLICK);
  }

  const viewCategories = new Map<string, number>();
  const viewedProducts: string[] = [];
  for (const row of Array.isArray(views) ? views : []) {
    if (row.product_id) viewedProducts.push(row.product_id);
    if (row.category_id) bump(viewCategories, row.category_id, W_VIEW);
  }

  const visitedCategories = new Map<string, number>();
  for (const row of Array.isArray(cats) ? cats : []) {
    if (row.category_id) bump(visitedCategories, row.category_id, W_CAT);
  }

  return {
    searchTerms,
    clickCategories,
    viewCategories,
    visitedCategories,
    clickedProducts,
    viewedProducts,
  };
}

/** Sem histórico nesta sessão no servidor → não devemos mostrar “para você” genérico igual para todos. */
export function sessionProfileHasServerSignals(p: SessionProfile): boolean {
  if (p.searchTerms.length > 0) return true;
  if (p.clickedProducts.length > 0) return true;
  if (p.viewedProducts.length > 0) return true;
  if (p.visitedCategories.size > 0) return true;
  if (p.clickCategories.size > 0) return true;
  if (p.viewCategories.size > 0) return true;
  return false;
}
