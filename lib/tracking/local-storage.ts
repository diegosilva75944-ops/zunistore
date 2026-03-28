import { ZUNI_LS } from "@/lib/personalization/constants";
import type {
  LocalCategoryRef,
  LocalProductRef,
  LocalSearchEntry,
  RecentProductSnapshot,
} from "@/lib/personalization/types";

const MAX_SEARCH = 100;
const MAX_CLICKS = 100;
const MAX_VIEWS = 100;
const MAX_CATS = 50;
const MAX_RECENT = 12;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

export function normalizeSearchTerm(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .slice(0, 200);
}

function pushLimited<T>(arr: T[], item: T, max: number): T[] {
  const next = [item, ...arr];
  return next.slice(0, max);
}

export function localAppendSearch(term: string) {
  const normalized = normalizeSearchTerm(term);
  if (normalized.length < 2) return;
  const prev = readJson<LocalSearchEntry[]>(ZUNI_LS.searchHistory, []);
  const next = pushLimited(prev, { term: normalized, at: Date.now() }, MAX_SEARCH);
  writeJson(ZUNI_LS.searchHistory, next);
}

export function localAppendClick(productId: string, categoryId: string | null) {
  const prev = readJson<LocalProductRef[]>(ZUNI_LS.productClicks, []);
  writeJson(
    ZUNI_LS.productClicks,
    pushLimited(prev, { productId, categoryId, at: Date.now() }, MAX_CLICKS),
  );
}

export function localAppendView(productId: string, categoryId: string | null) {
  const prev = readJson<LocalProductRef[]>(ZUNI_LS.productViews, []);
  writeJson(
    ZUNI_LS.productViews,
    pushLimited(prev, { productId, categoryId, at: Date.now() }, MAX_VIEWS),
  );
}

export function localAppendCategory(categoryId: string) {
  const prev = readJson<LocalCategoryRef[]>(ZUNI_LS.categoryVisits, []);
  writeJson(
    ZUNI_LS.categoryVisits,
    pushLimited(prev, { categoryId, at: Date.now() }, MAX_CATS),
  );
}

/** Sem duplicar o mesmo produto: remove ocorrências antigas e coloca no topo. */
export function localUpsertRecentProduct(p: Omit<RecentProductSnapshot, "at">) {
  const prev = readJson<RecentProductSnapshot[]>(ZUNI_LS.recentProducts, []);
  const filtered = prev.filter((x) => x.id !== p.id);
  const row: RecentProductSnapshot = { ...p, at: Date.now() };
  writeJson(ZUNI_LS.recentProducts, [row, ...filtered].slice(0, MAX_RECENT));
}

export function localClearAllPersonalizationData() {
  try {
    window.localStorage.removeItem(ZUNI_LS.searchHistory);
    window.localStorage.removeItem(ZUNI_LS.productClicks);
    window.localStorage.removeItem(ZUNI_LS.productViews);
    window.localStorage.removeItem(ZUNI_LS.categoryVisits);
    window.localStorage.removeItem(ZUNI_LS.recentProducts);
  } catch {
    /* ignore */
  }
}

export function localGetSearchHistory(): LocalSearchEntry[] {
  return readJson(ZUNI_LS.searchHistory, []);
}

export function localGetRecentProducts(): RecentProductSnapshot[] {
  return readJson(ZUNI_LS.recentProducts, []);
}
