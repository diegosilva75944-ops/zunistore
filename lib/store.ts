import "server-only";

import { postgrestGet, postgrestGetWithCount } from "@/lib/postgrest/server";

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
    const rows = await postgrestGet<any[]>("site_settings", {
      select: "id,logo_url,colors",
      limit: "1",
    }, "anon");
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

export async function getContactSettings(): Promise<ContactSettings | null> {
  try {
    const rows = await postgrestGet<any[]>("contact_settings", {
      select: "id,address,city,state,phone,email",
      limit: "1",
    }, "anon");
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

export async function getSocialLinks(): Promise<SocialLink[]> {
  try {
    const data = await postgrestGet<any[]>("social_links", {
      select: "id,icon,url,color,sort_order",
      order: "sort_order.asc",
    }, "anon");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function getSeoQueryBySlug(slug: string): Promise<SeoQuery | null> {
  try {
    const rows = await postgrestGet<any[]>("seo_queries", {
      select: "id,slug,title,description,query_terms,category_id,is_indexable,min_results",
      slug: `eq.${encodeURIComponent(slug)}`,
      limit: "1",
    }, "anon");
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
  perPage?: 10 | 20 | 50;
  sort?: ProductSort;
}) {
  const { terms, categoryId, page = 1, perPage = 20, sort = "recentes" } = opts;
  try {
    const from = (page - 1) * perPage;
    const params: Record<string, string> = {
      select: "id,code6,slug,title,description,images,category_id,price,promo_price,is_offer,off_percent,rating,reviews_count,affiliate_code,affiliate_url,source_url,created_at,updated_at,effective_price",
      order: sortToOrder(sort),
      offset: String(from),
      limit: String(perPage),
    };
    if (categoryId) params.category_id = `eq.${categoryId}`;
    if (terms.length) params.search_tsv = `wfts.portuguese.${encodeURIComponent(terms.join(" "))}`;

    const { data, count } = await postgrestGetWithCount<any[]>("products", params, "anon");
    return { items: (Array.isArray(data) ? data : []).map(normalizeProduct), total: count ?? 0 };
  } catch {
    return { items: [], total: 0 };
  }
}

export async function listSeedCategories(): Promise<Category[]> {
  try {
    const data = await postgrestGet<any[]>("categories", {
      select: "id,name,slug,parent_id",
      parent_id: "is.null",
      order: "name.asc",
    }, "anon");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  try {
    const rows = await postgrestGet<any[]>("categories", {
      select: "id,name,slug,parent_id",
      slug: `eq.${encodeURIComponent(slug)}`,
      limit: "1",
    }, "anon");
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

export async function getCategoryById(id: string): Promise<Category | null> {
  try {
    const rows = await postgrestGet<any[]>("categories", {
      select: "id,name,slug,parent_id",
      id: `eq.${id}`,
      limit: "1",
    }, "anon");
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
  perPage?: 10 | 20 | 50;
  onlyOffers?: boolean;
}) {
  const { categoryId, q, min, max, sort = "recentes", page = 1, perPage = 20, onlyOffers } = opts;
  try {
    const from = (page - 1) * perPage;
    const params: Record<string, string> = {
      select: "id,code6,slug,title,description,images,category_id,price,promo_price,is_offer,off_percent,rating,reviews_count,affiliate_code,affiliate_url,source_url,created_at,updated_at",
      order: sortToOrder(sort),
      offset: String(from),
      limit: String(perPage),
    };
    if (categoryId) params.category_id = `eq.${categoryId}`;
    if (onlyOffers) params.is_offer = "eq.true";
    if (typeof min === "number" && typeof max === "number") {
      params.and = `(effective_price.gte.${min},effective_price.lte.${max})`;
    } else if (typeof min === "number") {
      params.effective_price = `gte.${min}`;
    } else if (typeof max === "number") {
      params.effective_price = `lte.${max}`;
    }
    if (q?.trim()) {
      const pat = encodeURIComponent("%" + q.trim() + "%");
      params.or = `(title.ilike.${pat},description.ilike.${pat})`;
    }

    const { data, count } = await postgrestGetWithCount<any[]>("products", params, "anon");
    return { items: (Array.isArray(data) ? data : []).map(normalizeProduct), total: count ?? 0 };
  } catch {
    return { items: [], total: 0 };
  }
}

export async function getProductByCode6(code6: string): Promise<Product | null> {
  try {
    const rows = await postgrestGet<any[]>("products", {
      select: "id,code6,slug,title,description,images,category_id,price,promo_price,is_offer,off_percent,rating,reviews_count,affiliate_code,affiliate_url,source_url,created_at,updated_at",
      code6: `eq.${encodeURIComponent(code6)}`,
      limit: "1",
    }, "anon");
    const data = Array.isArray(rows) ? rows[0] : null;
    return data ? normalizeProduct(data) : null;
  } catch {
    return null;
  }
}

export async function listCarouselProducts() {
  try {
    const data = await postgrestGet<any[]>("carousel_items", {
      select: "id,product_id,sort_order,size,products:product_id(code6,slug,title,images,price,promo_price,is_offer,off_percent,affiliate_url)",
      order: "sort_order.asc",
    }, "anon");
    const items = Array.isArray(data) ? data : [];
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
    const { limit = 12 } = opts;
    const tokens = opts.title
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 4)
      .slice(0, 6);

    const params: Record<string, string> = {
      select: "id,code6,slug,title,images,price,promo_price,is_offer,off_percent,affiliate_url,rating,reviews_count,category_id",
      category_id: `eq.${opts.categoryId}`,
      code6: `neq.${encodeURIComponent(opts.excludeCode6)}`,
      limit: String(limit),
    };
    if (tokens.length) {
      params.or = `(${tokens.map((t) => `title.ilike.${encodeURIComponent("%" + t + "%")}`).join(",")})`;
    }

    const data = await postgrestGet<any[]>("products", params, "anon");
    return (Array.isArray(data) ? data : []).map(normalizeProduct);
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
