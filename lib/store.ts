import "server-only";

import { cache } from "react";
import { postgrestGet, postgrestGetWithCount, inVal } from "@/lib/postgrest/server";
import { ilikeContainsPattern } from "@/lib/postgrest/ilike";
import {
  collectDescendantCategoryIds,
  filterFlatToCategoriesWithCatalogBranches,
} from "@/lib/categories-tree";

export type Category = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
};

export type Product = {
  id: string;
  code6: string;
  slug: string;
  title: string;
  description: string;
  /** Bloco longo ML (#description .ui-pdp-description__content), além da description curta. */
  description_detail: string;
  images: string[];
  category_id: string;
  price: number;
  promo_price: number | null;
  is_offer: boolean;
  off_percent: number;
  rating: number | null;
  reviews_count: number | null;
  affiliate_code: string;
  affiliate_url: string;
  source_url: string;
  created_at: string;
  updated_at: string;
};

export type CarouselItem = {
  id: string;
  product_id: string;
  sort_order: number;
  size: "S" | "M" | "G";
};

export type SiteSettings = {
  id: string;
  logo_url: string | null;
  colors: Record<string, string> | null;
  /** after_hero | before_hero */
  offers_section_position?: string | null;
};

export type ContactSettings = {
  id: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
};

export type SocialLink = {
  id: string;
  icon: string;
  url: string;
  color: string | null;
  sort_order: number;
};

export type SeoQuery = {
  id: string;
  slug: string;
  title: string;
  description: string;
  query_terms: string[];
  category_id: string | null;
  is_indexable: boolean;
  min_results: number;
};

async function getWithPublicFallback<T>(
  table: string,
  params: Record<string, string>,
): Promise<T> {
  try {
    return await postgrestGet<T>(table, params, "anon");
  } catch (anonErr) {
    // Self-hosted installs often miss anon grants/RLS policies.
    console.error(`[store] anon read failed for ${table}; retrying with service role`, anonErr);
    return postgrestGet<T>(table, params, "service");
  }
}

async function getWithCountPublicFallback<T>(
  table: string,
  params: Record<string, string>,
): Promise<{ data: T; count: number }> {
  try {
    return await postgrestGetWithCount<T>(table, params, "anon");
  } catch (anonErr) {
    // Fallback keeps storefront working while server permissions are fixed.
    console.error(`[store] anon read with count failed for ${table}; retrying with service role`, anonErr);
    return postgrestGetWithCount<T>(table, params, "service");
  }
}

export async function getSiteSettings(): Promise<SiteSettings | null> {
  try {
    const rows = await getWithPublicFallback<any[]>("site_settings", {
      select: "id,logo_url,colors,offers_section_position",
      limit: "1",
    });
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

export async function getContactSettings(): Promise<ContactSettings | null> {
  try {
    const rows = await getWithPublicFallback<any[]>("contact_settings", {
      select: "id,address,city,state,phone,email",
      limit: "1",
    });
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

export async function getSocialLinks(): Promise<SocialLink[]> {
  try {
    const data = await getWithPublicFallback<any[]>("social_links", {
      select: "id,icon,url,color,sort_order",
      order: "sort_order.asc",
    });
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function getSeoQueryBySlug(slug: string): Promise<SeoQuery | null> {
  try {
    const rows = await getWithPublicFallback<any[]>("seo_queries", {
      select: "id,slug,title,description,query_terms,category_id,is_indexable,min_results",
      slug: `eq.${encodeURIComponent(slug)}`,
      limit: "1",
    });
    const data = Array.isArray(rows) ? rows[0] : null;
    if (!data) return null;
    return {
      ...data,
      query_terms: Array.isArray(data.query_terms) ? data.query_terms : [],
    } as SeoQuery;
  } catch {
    return null;
  }
}

export type ProductSort =
  | "recentes"
  | "menor-preco"
  | "maior-preco"
  | "maior-desconto"
  | "mais-avaliados";

/**
 * Catálogo: mostrar `affiliate_valid` null (não verificado) ou true.
 * Não usar `not.eq.false`: em SQL, `NOT (NULL = false)` é NULL e a linha some do resultado.
 */
const AFFILIATE_VISIBLE_OR = "or(affiliate_valid.is.null,affiliate_valid.eq.true)";

export function applyAffiliateVisibleToProductParams(params: Record<string, string>) {
  const aff = AFFILIATE_VISIBLE_OR;
  if (params.or && params.and) {
    const searchOr = params.or.startsWith("(") ? `or${params.or}` : `or(${params.or})`;
    const priceInner = params.and.startsWith("(") ? params.and.slice(1, -1) : params.and;
    params.and = `(${searchOr},${priceInner},${aff})`;
    delete params.or;
  } else if (params.or) {
    const searchOr = params.or.startsWith("(") ? `or${params.or}` : `or(${params.or})`;
    params.and = `(${searchOr},${aff})`;
    delete params.or;
  } else if (params.and) {
    const inner = params.and.startsWith("(") ? params.and.slice(1, -1) : params.and;
    params.and = `(${inner},${aff})`;
  } else {
    params.or = "(affiliate_valid.is.null,affiliate_valid.eq.true)";
  }
}

function isStoreAffiliateColumnError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /42703|affiliate_valid|PGRST204|does not exist|column/i.test(msg);
}

function sortToOrder(sort: ProductSort): string {
  switch (sort) {
    case "recentes": return "created_at.desc";
    case "menor-preco": return "effective_price.asc";
    case "maior-preco": return "effective_price.desc";
    case "maior-desconto": return "off_percent.desc";
    case "mais-avaliados": return "rating.desc.nullslast,reviews_count.desc.nullslast";
    default: return "created_at.desc";
  }
}

export async function searchProductsByTerms(opts: {
  terms: string[];
  categoryId?: string | null;
  page?: number;
  perPage?: 10 | 12 | 15 | 20 | 24 | 36 | 50;
  sort?: ProductSort;
}) {
  const { terms, categoryId, page = 1, perPage = 20, sort = "recentes" } = opts;
  try {
    const from = (page - 1) * perPage;
    const params: Record<string, string> = {
      select: "id,code6,slug,title,description,description_detail,images,category_id,price,promo_price,is_offer,off_percent,rating,reviews_count,affiliate_code,affiliate_url,source_url,created_at,updated_at,effective_price",
      order: sortToOrder(sort),
      offset: String(from),
      limit: String(perPage),
    };
    // Só exibir itens ativos no site.
    params.is_active = "eq.true";
    if (categoryId) await applyCategorySubtreeToParams(params, categoryId);
    if (terms.length) params.search_tsv = `wfts.portuguese.${encodeURIComponent(terms.join(" "))}`;

    let data: any[];
    let count: number;
    try {
      const p = { ...params };
      applyAffiliateVisibleToProductParams(p);
      const r = await getWithCountPublicFallback<any[]>("products", p);
      data = r.data;
      count = r.count ?? 0;
    } catch (e) {
      if (!isStoreAffiliateColumnError(e)) throw e;
      const r = await getWithCountPublicFallback<any[]>("products", params);
      data = r.data;
      count = r.count ?? 0;
    }
    return { items: (Array.isArray(data) ? data : []).map(normalizeProduct), total: count ?? 0 };
  } catch {
    return { items: [], total: 0 };
  }
}

/** Categorias com chip no cabeçalho (admin: “mostrar no cabeçalho”). */
export async function listHeaderCategories(): Promise<Category[]> {
  try {
    const data = await getWithPublicFallback<any[]>("categories", {
      select: "id,name,slug,parent_id",
      show_in_header: "eq.true",
      order: "name.asc",
    });
    return Array.isArray(data) ? data : [];
  } catch {
    try {
      // Sem coluna show_in_header (migração não aplicada): só categorias raiz.
      const data = await getWithPublicFallback<any[]>("categories", {
        select: "id,name,slug,parent_id",
        parent_id: "is.null",
        order: "name.asc",
      });
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }
}

/** Todas as categorias (seeds + importadas) — lista completa para `applyCategorySubtreeToParams` e listagens. */
export async function listSiteCategoriesFlat(): Promise<Category[]> {
  try {
    const data = await getWithPublicFallback<any[]>("categories", {
      select: "id,name,slug,parent_id",
      order: "name.asc",
    });
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Deduplica chamadas à listagem plana na mesma requisição (árvore / subcategorias). */
export const getSiteCategoriesFlatCached = cache(listSiteCategoriesFlat);

/** IDs de categoria com ≥1 produto no catálogo (mesmos filtros que `listProducts`: ativo, oferta, afiliado visível). */
async function fetchDistinctCategoryIdsWithCatalogProducts(): Promise<Set<string>> {
  const ids = new Set<string>();
  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    const base: Record<string, string> = {
      select: "category_id",
      is_active: "eq.true",
      is_offer: "eq.true",
      limit: String(pageSize),
      offset: String(offset),
    };
    let rows: any[];
    try {
      const p = { ...base };
      applyAffiliateVisibleToProductParams(p);
      rows = await getWithPublicFallback<any[]>("products", p);
    } catch (e) {
      if (!isStoreAffiliateColumnError(e)) throw e;
      rows = await getWithPublicFallback<any[]>("products", base);
    }
    const list = Array.isArray(rows) ? rows : [];
    for (const r of list) {
      if (r?.category_id) ids.add(String(r.category_id));
    }
    if (list.length < pageSize) break;
    offset += pageSize;
  }
  return ids;
}

const getDistinctCatalogCategoryIdsCached = cache(fetchDistinctCategoryIdsWithCatalogProducts);

/**
 * Categorias para /categorias, filtros da home e cabeçalho: só ramos com produtos no catálogo (critério alinhado a `listProducts`).
 * A lista completa `getSiteCategoriesFlatCached` continua a ser usada nas consultas de produtos por subárvore.
 */
export async function listSiteCategoriesFlatForNavigation(): Promise<Category[]> {
  const full = await getSiteCategoriesFlatCached();
  const leafIds = await getDistinctCatalogCategoryIdsCached();
  if (full.length === 0 || leafIds.size === 0) return [];
  return filterFlatToCategoriesWithCatalogBranches(full, leafIds);
}

export const getSiteCategoriesFlatForNavigationCached = cache(listSiteCategoriesFlatForNavigation);

async function applyCategorySubtreeToParams(params: Record<string, string>, categoryId: string) {
  const flat = await getSiteCategoriesFlatCached();
  const ids = collectDescendantCategoryIds(categoryId, flat);
  const valid = ids.filter(Boolean);
  if (valid.length === 0) {
    params.category_id = `eq.${categoryId}`;
  } else if (valid.length === 1) {
    params.category_id = `eq.${valid[0]}`;
  } else {
    params.category_id = inVal(valid);
  }
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  try {
    const rows = await getWithPublicFallback<any[]>("categories", {
      select: "id,name,slug,parent_id",
      slug: `eq.${encodeURIComponent(slug)}`,
      limit: "1",
    });
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

export async function getCategoryById(id: string): Promise<Category | null> {
  try {
    const rows = await getWithPublicFallback<any[]>("categories", {
      select: "id,name,slug,parent_id",
      id: `eq.${id}`,
      limit: "1",
    });
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

export async function listProducts(opts: {
  categoryId?: string | null;
  q?: string | null;
  min?: number | null;
  max?: number | null;
  sort?: ProductSort;
  page?: number;
  perPage?: 10 | 12 | 15 | 20 | 24 | 36 | 50;
}) {
  const { categoryId, q, min, max, sort = "recentes", page = 1, perPage = 20 } = opts;
  try {
    const from = (page - 1) * perPage;
    const params: Record<string, string> = {
      select: "id,code6,slug,title,description,images,category_id,price,promo_price,is_offer,off_percent,rating,reviews_count,affiliate_code,affiliate_url,source_url,created_at,updated_at",
      order: sortToOrder(sort),
      offset: String(from),
      limit: String(perPage),
    };
    // Só exibir itens ativos no site; vitrine só com preço promocional ativo (is_offer).
    params.is_active = "eq.true";
    params.is_offer = "eq.true";
    if (categoryId) await applyCategorySubtreeToParams(params, categoryId);
    if (typeof min === "number" && typeof max === "number") {
      params.and = `(effective_price.gte.${min},effective_price.lte.${max})`;
    } else if (typeof min === "number") {
      params.effective_price = `gte.${min}`;
    } else if (typeof max === "number") {
      params.effective_price = `lte.${max}`;
    }
    if (q?.trim()) {
      const pat = ilikeContainsPattern(q.trim());
      const orParts = [
        `title.ilike.${pat}`,
        `description.ilike.${pat}`,
        `description_detail.ilike.${pat}`,
      ];
      try {
        const catRows = await getWithPublicFallback<any[]>("categories", {
          select: "id",
          or: `(name.ilike.${pat},slug.ilike.${pat})`,
          limit: "50",
        });
        const catIds = (Array.isArray(catRows) ? catRows : []).map((c) => c.id);
        if (catIds.length > 0) {
          const flat = await getSiteCategoriesFlatCached();
          const expanded = new Set<string>();
          for (const cid of catIds) {
            for (const x of collectDescendantCategoryIds(cid, flat)) expanded.add(x);
          }
          orParts.push(`category_id.${inVal([...expanded])}`);
        }
      } catch {
        /* categorias indisponíveis: segue só texto */
      }
      params.or = `(${orParts.join(",")})`;
    }

    let data: any[];
    let count: number;
    try {
      const p = { ...params };
      applyAffiliateVisibleToProductParams(p);
      const r = await getWithCountPublicFallback<any[]>("products", p);
      data = r.data;
      count = r.count ?? 0;
    } catch (e) {
      if (!isStoreAffiliateColumnError(e)) throw e;
      const r = await getWithCountPublicFallback<any[]>("products", params);
      data = r.data;
      count = r.count ?? 0;
    }
    return { items: (Array.isArray(data) ? data : []).map(normalizeProduct), total: count ?? 0 };
  } catch {
    return { items: [], total: 0 };
  }
}

/** Produtos ativos por IDs (recomendações / vitrine personalizada). */
export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return [];
  try {
    let rows: any[];
    try {
      const p: Record<string, string> = {
        select:
          "id,code6,slug,title,description,description_detail,images,category_id,price,promo_price,is_offer,off_percent,rating,reviews_count,affiliate_code,affiliate_url,source_url,created_at,updated_at",
        id: inVal(uniq),
        is_active: "eq.true",
        is_offer: "eq.true",
        limit: String(uniq.length),
      };
      applyAffiliateVisibleToProductParams(p);
      rows = await getWithPublicFallback<any[]>("products", p);
    } catch (e) {
      if (!isStoreAffiliateColumnError(e)) throw e;
      rows = await getWithPublicFallback<any[]>("products", {
        select: "id,code6,slug,title,description,description_detail,images,category_id,price,promo_price,is_offer,off_percent,rating,reviews_count,affiliate_code,affiliate_url,source_url,created_at,updated_at",
        id: inVal(uniq),
        is_active: "eq.true",
        is_offer: "eq.true",
        limit: String(uniq.length),
      });
    }
    const list = (Array.isArray(rows) ? rows : []).map(normalizeProduct);
    const order = new Map(uniq.map((id, i) => [id, i]));
    list.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return list;
  } catch {
    return [];
  }
}

export async function getProductByCode6(code6: string): Promise<Product | null> {
  try {
    let rows: any[];
    try {
      const p: Record<string, string> = {
        select:
          "id,code6,slug,title,description,description_detail,images,category_id,price,promo_price,is_offer,off_percent,rating,reviews_count,affiliate_code,affiliate_url,source_url,created_at,updated_at",
        code6: `eq.${encodeURIComponent(code6)}`,
        is_active: "eq.true",
        is_offer: "eq.true",
        limit: "1",
      };
      applyAffiliateVisibleToProductParams(p);
      rows = await getWithPublicFallback<any[]>("products", p);
    } catch (e) {
      if (!isStoreAffiliateColumnError(e)) throw e;
      rows = await getWithPublicFallback<any[]>("products", {
        select: "id,code6,slug,title,description,description_detail,images,category_id,price,promo_price,is_offer,off_percent,rating,reviews_count,affiliate_code,affiliate_url,source_url,created_at,updated_at",
        code6: `eq.${encodeURIComponent(code6)}`,
        is_active: "eq.true",
        is_offer: "eq.true",
        limit: "1",
      });
    }
    const data = Array.isArray(rows) ? rows[0] : null;
    return data ? normalizeProduct(data) : null;
  } catch {
    return null;
  }
}

export async function listCarouselProducts() {
  try {
    const data = await getWithPublicFallback<any[]>("carousel_items", {
      select: "id,product_id,sort_order,size,products:product_id(code6,slug,title,images,price,promo_price,is_offer,off_percent,affiliate_url,rating,reviews_count,affiliate_valid)",
      "products.is_active": "eq.true",
      "products.is_offer": "eq.true",
      order: "sort_order.asc",
    });
    const items = Array.isArray(data) ? data : [];
    return items
      .filter((x) => x.products && x.products.affiliate_valid !== false)
      .map((x) => ({
        id: x.id as string,
        sort_order: x.sort_order as number,
        size: x.size as "S" | "M" | "G",
        product: {
          code6: x.products.code6 as string,
          slug: x.products.slug as string,
          title: x.products.title as string,
          images: (x.products.images ?? []) as string[],
          price: Number(x.products.price),
          promo_price: x.products.promo_price == null ? null : Number(x.products.promo_price),
          is_offer: Boolean(x.products.is_offer),
          off_percent: Number(x.products.off_percent ?? 0),
          affiliate_url: x.products.affiliate_url as string,
          rating: x.products.rating == null ? null : Number(x.products.rating),
          reviews_count: x.products.reviews_count == null ? null : Number(x.products.reviews_count),
        },
      }));
  } catch {
    return [];
  }
}

export async function listRelatedProducts(opts: {
  categoryId: string | null;
  title: string;
  excludeCode6: string;
  limit?: number;
}) {
  const { limit = 8, categoryId, excludeCode6, title } = opts;
  try {
    const { items } = await listProducts({
      categoryId: categoryId ?? undefined,
      page: 1,
      perPage: 50,
      sort: "recentes",
    });
    const others = items.filter((p) => p.code6 !== excludeCode6);
    if (!others.length) return [];

    const tokens = title
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^\wÀ-ÿ]/gi, ""))
      .filter((t) => t.length >= 3)
      .slice(0, 8);

    const scored = others.map((p) => {
      const low = p.title.toLowerCase();
      const score = tokens.reduce((acc, t) => acc + (low.includes(t) ? 1 : 0), 0);
      return { p, score };
    });
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const br = (b.p.rating ?? 0) - (a.p.rating ?? 0);
      if (br !== 0) return br;
      return (b.p.reviews_count ?? 0) - (a.p.reviews_count ?? 0);
    });
    return scored.slice(0, limit).map((x) => x.p);
  } catch {
    return [];
  }
}

export function normalizeProduct(row: any): Product {
  return {
    id: row.id,
    code6: row.code6,
    slug: row.slug,
    title: row.title,
    description: row.description ?? "",
    description_detail: row.description_detail ?? "",
    images: Array.isArray(row.images) ? row.images : [],
    category_id: row.category_id,
    price: Number(row.price),
    promo_price: row.promo_price == null ? null : Number(row.promo_price),
    is_offer: Boolean(row.is_offer),
    off_percent: Number(row.off_percent ?? 0),
    rating: row.rating == null ? null : Number(row.rating),
    reviews_count: row.reviews_count == null ? null : Number(row.reviews_count),
    affiliate_code: row.affiliate_code,
    affiliate_url: row.affiliate_url,
    source_url: row.source_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
