import "server-only";

import { getProductsByIds, listProducts, type Product } from "@/lib/store";
import { loadSessionProfile, sessionProfileHasServerSignals } from "@/services/personalization/load-session-profile";
import { getPopularProductIds } from "@/services/personalization/popular-products";

function validAffiliate(p: Product) {
  const u = String(p.affiliate_url ?? "").trim();
  return u.startsWith("http://") || u.startsWith("https://");
}

function mergeCategoryWeights(profile: Awaited<ReturnType<typeof loadSessionProfile>>) {
  const m = new Map<string, number>();
  for (const [k, v] of profile.visitedCategories) m.set(k, (m.get(k) ?? 0) + v);
  for (const [k, v] of profile.clickCategories) m.set(k, (m.get(k) ?? 0) + v);
  for (const [k, v] of profile.viewCategories) m.set(k, (m.get(k) ?? 0) + v);
  return m;
}

async function collectCandidateIds(profile: Awaited<ReturnType<typeof loadSessionProfile>>): Promise<string[]> {
  const ids = new Set<string>();
  const topTerms = profile.searchTerms.slice(0, 4).map((x) => x.term);
  for (const term of topTerms) {
    const { items } = await listProducts({ q: term, perPage: 20, page: 1, sort: "mais-avaliados" });
    for (const p of items) ids.add(p.id);
  }
  const catWeights = mergeCategoryWeights(profile);
  const topCats = [...catWeights.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map((x) => x[0]);
  for (const cid of topCats) {
    const { items } = await listProducts({ categoryId: cid, perPage: 20, page: 1, sort: "recentes" });
    for (const p of items) ids.add(p.id);
  }
  for (const pid of profile.clickedProducts) ids.add(pid);
  for (const pid of profile.viewedProducts) ids.add(pid);
  return [...ids];
}

function scorePersonalized(
  p: Product,
  topTerms: string[],
  favoriteCats: Set<string>,
  clickCats: Set<string>,
  popular: Set<string>,
): number {
  let s = 0;
  const title = p.title.toLowerCase();
  const desc = `${p.description} ${p.description_detail}`.toLowerCase();
  for (const term of topTerms) {
    if (!term) continue;
    if (title.includes(term)) s += 4;
    else if (desc.includes(term)) s += 2;
  }
  if (favoriteCats.has(p.category_id)) s += 3;
  if (clickCats.has(p.category_id)) s += 2;
  if (popular.has(p.id)) s += 1;
  return s;
}

function scoreSearchOnly(p: Product, topTerms: string[], popular: Set<string>): number {
  let s = 0;
  const title = p.title.toLowerCase();
  const desc = `${p.description} ${p.description_detail}`.toLowerCase();
  for (const term of topTerms) {
    if (!term) continue;
    if (title.includes(term)) s += 8;
    else if (desc.includes(term)) s += 4;
  }
  if (popular.has(p.id)) s += 1;
  return s;
}

async function fallbackRecent(exclude: Set<string>, limit: number): Promise<Product[]> {
  const { items } = await listProducts({ perPage: 20, page: 1, sort: "recentes" });
  return items.filter((p) => !exclude.has(p.id) && validAffiliate(p)).slice(0, limit);
}

async function fallbackTopRated(exclude: Set<string>, limit: number): Promise<Product[]> {
  const { items } = await listProducts({ perPage: 50, page: 1, sort: "mais-avaliados" });
  return items.filter((p) => !exclude.has(p.id) && validAffiliate(p)).slice(0, limit);
}

/** “Mais procurados por você” — sinais combinados. */
export async function recommendPersonalizedForSession(
  sessionId: string,
  opts?: { excludeIds?: string[]; limit?: number },
): Promise<Product[]> {
  const limit = opts?.limit ?? 12;
  const exclude = new Set(opts?.excludeIds ?? []);
  const profile = await loadSessionProfile(sessionId);
  if (!sessionProfileHasServerSignals(profile)) {
    return [];
  }
  const topTerms = profile.searchTerms.slice(0, 6).map((x) => x.term);
  const catMerged = mergeCategoryWeights(profile);
  const favoriteCats = new Set(
    [...catMerged.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map((x) => x[0]),
  );
  const clickCats = new Set(
    [...profile.clickCategories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]),
  );
  const popularList = await getPopularProductIds(60);
  const popular = new Set(popularList);

  const candidateIds = await collectCandidateIds(profile);
  if (!candidateIds.length) {
    return [];
  }
  let products = await getProductsByIds(candidateIds.filter((id) => !exclude.has(id)));
  products = products.filter(validAffiliate);
  if (!products.length) {
    return [];
  }
  const scored = products
    .map((p) => ({
      p,
      s: scorePersonalized(p, topTerms, favoriteCats, clickCats, popular),
    }))
    .sort((a, b) => b.s - a.s);
  const minScore = topTerms.length || favoriteCats.size ? 1 : 0;
  const picked = scored.filter((x) => x.s >= minScore).map((x) => x.p);
  const out = picked.length ? picked : scored.map((x) => x.p);
  return out.slice(0, limit);
}

/** “Baseado nas suas buscas” — texto primeiro. */
export async function recommendSearchBasedForSession(
  sessionId: string,
  opts?: { excludeIds?: string[]; limit?: number },
): Promise<Product[]> {
  const limit = opts?.limit ?? 12;
  const exclude = new Set(opts?.excludeIds ?? []);
  const profile = await loadSessionProfile(sessionId);
  const topTerms = profile.searchTerms.slice(0, 5).map((x) => x.term);
  if (!topTerms.length) {
    return [];
  }
  const popularList = await getPopularProductIds(40);
  const popular = new Set(popularList);
  const ids = new Set<string>();
  for (const term of topTerms) {
    const { items } = await listProducts({ q: term, perPage: 20, page: 1 });
    for (const p of items) ids.add(p.id);
  }
  let products = await getProductsByIds([...ids].filter((id) => !exclude.has(id)));
  products = products.filter(validAffiliate);
  if (!products.length) return [];
  const scored = products
    .map((p) => ({ p, s: scoreSearchOnly(p, topTerms, popular) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  if (!scored.length) return [];
  return scored.map((x) => x.p).slice(0, limit);
}

export async function recommendPopularGlobal(opts?: { excludeIds?: string[]; limit?: number }): Promise<Product[]> {
  const limit = opts?.limit ?? 12;
  const exclude = new Set(opts?.excludeIds ?? []);
  const ids = (await getPopularProductIds(limit + exclude.size + 8)).filter((id) => !exclude.has(id));
  let products = (await getProductsByIds(ids)).filter(validAffiliate);
  if (products.length >= limit) return products.slice(0, limit);
  const seen = new Set(products.map((p) => p.id));
  for (const p of await fallbackRecent(exclude, limit)) {
    if (products.length >= limit) break;
    if (!seen.has(p.id)) {
      products.push(p);
      seen.add(p.id);
    }
  }
  if (products.length < limit) {
    for (const p of await fallbackTopRated(exclude, limit)) {
      if (products.length >= limit) break;
      if (!seen.has(p.id)) {
        products.push(p);
        seen.add(p.id);
      }
    }
  }
  return products.slice(0, limit);
}

/** Ordem dos IDs vem do localStorage (mais recente primeiro). */
export async function recommendRecentFromIds(
  orderedIds: string[],
  opts?: { excludeIds?: string[]; limit?: number },
): Promise<Product[]> {
  const limit = opts?.limit ?? 12;
  const exclude = new Set(opts?.excludeIds ?? []);
  const seenOrder = new Set<string>();
  const uniq: string[] = [];
  for (const id of orderedIds) {
    if (!id || exclude.has(id) || seenOrder.has(id)) continue;
    seenOrder.add(id);
    uniq.push(id);
    if (uniq.length >= 24) break;
  }
  if (!uniq.length) return [];
  let products = await getProductsByIds(uniq);
  products = products.filter(validAffiliate);
  const order = new Map(uniq.map((id, i) => [id, i]));
  products.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return products.slice(0, limit);
}
