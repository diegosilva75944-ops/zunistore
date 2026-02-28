import "server-only";

import { getSupabaseAnonServerClient } from "@/lib/supabase/server";

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

export async function getSiteSettings(): Promise<SiteSettings | null> {
  try {
    const supabase = getSupabaseAnonServerClient();
    const { data, error } = await supabase
      .from("site_settings")
      .select("id, logo_url, colors")
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return data as SiteSettings | null;
  } catch {
    return null;
  }
}

export async function getContactSettings(): Promise<ContactSettings | null> {
  try {
    const supabase = getSupabaseAnonServerClient();
    const { data, error } = await supabase
      .from("contact_settings")
      .select("id, address, city, state, phone, email")
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return data as ContactSettings | null;
  } catch {
    return null;
  }
}

export async function getSocialLinks(): Promise<SocialLink[]> {
  try {
    const supabase = getSupabaseAnonServerClient();
    const { data } = await supabase
      .from("social_links")
      .select("id, icon, url, color, sort_order")
      .order("sort_order", { ascending: true });
    return (data ?? []) as SocialLink[];
  } catch {
    return [];
  }
}

export async function getSeoQueryBySlug(slug: string): Promise<SeoQuery | null> {
  try {
    const supabase = getSupabaseAnonServerClient();
    const { data } = await supabase
      .from("seo_queries")
      .select("id, slug, title, description, query_terms, category_id, is_indexable, min_results")
      .eq("slug", slug)
      .maybeSingle();
    if (!data) return null;
    return {
      ...(data as any),
      query_terms: Array.isArray((data as any).query_terms) ? (data as any).query_terms : [],
    } as SeoQuery;
  } catch {
    return null;
  }
}

export async function searchProductsByTerms(opts: {
  terms: string[];
  categoryId?: string | null;
  page?: number;
  perPage?: 10 | 20 | 50;
  sort?: ProductSort;
}) {
  const { terms, categoryId, page = 1, perPage = 20, sort = "recentes" } = opts;
  let supabase: ReturnType<typeof getSupabaseAnonServerClient>;
  try {
    supabase = getSupabaseAnonServerClient();
  } catch {
    return { items: [], total: 0 };
  }

  let query = supabase
    .from("products")
    .select(
      "id, code6, slug, title, description, images, category_id, price, promo_price, is_offer, off_percent, rating, reviews_count, affiliate_code, affiliate_url, source_url, created_at, updated_at, effective_price",
      { count: "exact" },
    );

  if (categoryId) query = query.eq("category_id", categoryId);

  if (terms.length) {
    query = query.textSearch("search_tsv", terms.join(" "), {
      type: "websearch",
      config: "portuguese",
    });
  }

  if (sort === "recentes") query = query.order("created_at", { ascending: false });
  if (sort === "menor-preco") query = query.order("effective_price", { ascending: true });
  if (sort === "maior-preco") query = query.order("effective_price", { ascending: false });
  if (sort === "maior-desconto") query = query.order("off_percent", { ascending: false });
  if (sort === "mais-avaliados") query = query.order("rating", { ascending: false, nullsFirst: false }).order("reviews_count", { ascending: false, nullsFirst: false });

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  query = query.range(from, to);

  const { data, count } = await query;
  return { items: ((data ?? []) as any[]).map(normalizeProduct), total: count ?? 0 };
}

export async function listSeedCategories(): Promise<Category[]> {
  try {
    const supabase = getSupabaseAnonServerClient();
    const { data } = await supabase
      .from("categories")
      .select("id, name, slug, parent_id")
      .is("parent_id", null)
      .order("name", { ascending: true });
    return (data ?? []) as Category[];
  } catch {
    return [];
  }
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  try {
    const supabase = getSupabaseAnonServerClient();
    const { data } = await supabase
      .from("categories")
      .select("id, name, slug, parent_id")
      .eq("slug", slug)
      .maybeSingle();
    return (data ?? null) as Category | null;
  } catch {
    return null;
  }
}

export async function getCategoryById(id: string): Promise<Category | null> {
  try {
    const supabase = getSupabaseAnonServerClient();
    const { data } = await supabase
      .from("categories")
      .select("id, name, slug, parent_id")
      .eq("id", id)
      .maybeSingle();
    return (data ?? null) as Category | null;
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

export async function listProducts(opts: {
  categoryId?: string | null;
  q?: string | null;
  min?: number | null;
  max?: number | null;
  sort?: ProductSort;
  page?: number;
  perPage?: 10 | 20 | 50;
  onlyOffers?: boolean;
}) {
  const {
    categoryId,
    q,
    min,
    max,
    sort = "recentes",
    page = 1,
    perPage = 20,
    onlyOffers,
  } = opts;

  let supabase: ReturnType<typeof getSupabaseAnonServerClient>;
  try {
    supabase = getSupabaseAnonServerClient();
  } catch {
    return { items: [], total: 0 };
  }
  let query = supabase
    .from("products")
    .select(
      "id, code6, slug, title, description, images, category_id, price, promo_price, is_offer, off_percent, rating, reviews_count, affiliate_code, affiliate_url, source_url, created_at, updated_at",
      { count: "exact" },
    );

  if (categoryId) query = query.eq("category_id", categoryId);
  if (onlyOffers) query = query.eq("is_offer", true);
  if (typeof min === "number") query = query.gte("effective_price", min);
  if (typeof max === "number") query = query.lte("effective_price", max);

  if (q && q.trim()) {
    const term = q.trim();
    query = query.or(
      `title.ilike.%${term}%,description.ilike.%${term}%`,
    );
  }

  if (sort === "recentes") query = query.order("created_at", { ascending: false });
  if (sort === "menor-preco") query = query.order("effective_price", { ascending: true });
  if (sort === "maior-preco") query = query.order("effective_price", { ascending: false });
  if (sort === "maior-desconto") query = query.order("off_percent", { ascending: false });
  if (sort === "mais-avaliados") query = query.order("rating", { ascending: false, nullsFirst: false }).order("reviews_count", { ascending: false, nullsFirst: false });

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  query = query.range(from, to);

  const { data, count } = await query;
  return { items: ((data ?? []) as any[]).map(normalizeProduct), total: count ?? 0 };
}

export async function getProductByCode6(code6: string): Promise<Product | null> {
  try {
    const supabase = getSupabaseAnonServerClient();
    const { data } = await supabase
      .from("products")
      .select(
        "id, code6, slug, title, description, images, category_id, price, promo_price, is_offer, off_percent, rating, reviews_count, affiliate_code, affiliate_url, source_url, created_at, updated_at",
      )
      .eq("code6", code6)
      .maybeSingle();
    return data ? normalizeProduct(data as any) : null;
  } catch {
    return null;
  }
}

export async function listCarouselProducts() {
  try {
    const supabase = getSupabaseAnonServerClient();
    const { data } = await supabase
      .from("carousel_items")
      .select("id, product_id, sort_order, size, products:product_id (code6, slug, title, images, price, promo_price, is_offer, off_percent, affiliate_url)")
      .order("sort_order", { ascending: true });

    const items = (data ?? []) as any[];
    return items
      .filter((x) => x.products)
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
        },
      }));
  } catch {
    return [];
  }
}

export async function listRelatedProducts(opts: {
  categoryId: string;
  title: string;
  excludeCode6: string;
  limit?: number;
}) {
  try {
    const supabase = getSupabaseAnonServerClient();
    const { limit = 12 } = opts;
    const tokens = opts.title
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 4)
      .slice(0, 6);

    let query = supabase
      .from("products")
      .select("id, code6, slug, title, images, price, promo_price, is_offer, off_percent, affiliate_url, rating, reviews_count, category_id")
      .eq("category_id", opts.categoryId)
      .neq("code6", opts.excludeCode6)
      .limit(limit);

    if (tokens.length) {
      const or = tokens.map((t) => `title.ilike.%${t}%`).join(",");
      query = query.or(or);
    }

    const { data } = await query;
    return ((data ?? []) as any[]).map(normalizeProduct);
  } catch {
    return [];
  }
}

function normalizeProduct(row: any): Product {
  return {
    id: row.id,
    code6: row.code6,
    slug: row.slug,
    title: row.title,
    description: row.description ?? "",
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

