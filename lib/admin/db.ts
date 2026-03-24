import "server-only";

import {
  postgrestGet,
  postgrestPost,
  postgrestPatch,
  postgrestDelete,
  postgrestGetWithCount,
  inVal,
} from "@/lib/postgrest/server";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { slugify } from "@/lib/slug";
import { checkAffiliatePageContainsProduct } from "@/lib/affiliate-validate";

function enc(v: string | number | boolean): string {
  return encodeURIComponent(String(v));
}

export async function adminListCategories() {
  const data = await postgrestGet<any[]>("categories", {
    select: "id,name,slug,parent_id,is_seed,created_at",
    order: "name.asc",
  });
  return Array.isArray(data) ? data : [];
}

export async function adminCreateCategory(input: {
  name: string;
  slug?: string | null;
  parent_id?: string | null;
}) {
  const slug = (input.slug?.trim() ? slugify(input.slug) : slugify(input.name)) || "categoria";
  const existing = await postgrestGet<any[]>("categories", {
    select: "id",
    slug: `eq.${enc(slug)}`,
    limit: "1",
  });
  if (Array.isArray(existing) && existing.length > 0) {
    throw new Error("Já existe uma categoria com este slug.");
  }
  const inserted = await postgrestPost<any[]>(
    "categories",
    {
      name: input.name.trim(),
      slug,
      parent_id: input.parent_id ?? null,
      is_seed: false,
    },
    "service",
    { select: "id,name,slug,parent_id,is_seed", returning: true },
  );
  const arr = Array.isArray(inserted) ? inserted : [];
  if (!arr[0]) throw new Error("Falha ao criar categoria.");
  return arr[0];
}

export async function adminUpdateCategory(
  id: string,
  input: { name?: string; slug?: string },
) {
  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.slug !== undefined) {
    const slug = input.slug.trim() || slugify((input.name as string) || "");
    if (slug) updates.slug = slug;
  }
  if (Object.keys(updates).length === 0) return;
  await postgrestPatch("categories", updates, { id: `eq.${id}` });
}

export async function adminDeleteCategory(id: string) {
  const { count } = await postgrestGetWithCount<unknown[]>("products", {
    select: "id",
    category_id: `eq.${id}`,
    limit: "1",
  });
  if (count > 0) {
    throw new Error("Não é possível excluir: existem produtos nesta categoria.");
  }
  await postgrestDelete("categories", { id: `eq.${id}` });
}

export const AFFILIATE_VALID_PARAM = "matt_tool=40141155";

export async function adminCountExpiredAffiliateProducts(): Promise<number> {
  try {
    const { count } = await postgrestGetWithCount<unknown[]>("products", {
      select: "id",
      affiliate_valid: "eq.false",
      limit: "1",
    });
    return count ?? 0;
  } catch {
    return 0;
  }
}

const PRODUCTS_SELECT_FULL =
  "id,code6,slug,title,images,price,promo_price,is_offer,off_percent,needs_update,affiliate_url,affiliate_valid,affiliate_valid_checked_at,created_at,categories:category_id(id,name,slug)";
const PRODUCTS_SELECT_FALLBACK =
  "id,code6,slug,title,images,price,promo_price,is_offer,off_percent,needs_update,affiliate_url,created_at,categories:category_id(id,name,slug)";

function buildProductsParams(opts: {
  page: number;
  perPage: number;
  needsUpdate?: boolean | null;
  q?: string | null;
  code6?: string | null;
  categoryId?: string | null;
  affiliateExpired?: boolean | null;
  includeAffiliateExpired: boolean;
  select: string;
}) {
  const { page, perPage, needsUpdate, q, code6, categoryId, affiliateExpired, includeAffiliateExpired, select } = opts;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  const params: Record<string, string> = {
    select,
    order: "created_at.desc",
    offset: String(from),
    limit: String(perPage),
  };
  if (needsUpdate === true) params.needs_update = "eq.true";
  if (needsUpdate === false) params.needs_update = "eq.false";
  if (categoryId) params.category_id = `eq.${categoryId}`;
  if (code6?.trim()) params.code6 = `ilike.${encodeURIComponent("%" + code6.trim() + "%")}`;
  const searchTerm = q?.trim() ?? "";
  if (searchTerm) {
    const pat = encodeURIComponent("%" + searchTerm + "%");
    params.or = `(title.ilike.${pat},description.ilike.${pat})`;
  }
  if (includeAffiliateExpired && affiliateExpired === true) params.affiliate_valid = "eq.false";
  return params;
}

export async function adminListProducts(opts: {
  page?: number;
  perPage?: number;
  needsUpdate?: boolean | null;
  q?: string | null;
  code6?: string | null;
  categoryId?: string | null;
  affiliateExpired?: boolean | null;
}) {
  const { page = 1, perPage = 20, needsUpdate = null, q, code6, categoryId, affiliateExpired } = opts;
  const from = (page - 1) * perPage;

  const params = buildProductsParams({
    page,
    perPage,
    needsUpdate,
    q,
    code6,
    categoryId,
    affiliateExpired,
    includeAffiliateExpired: true,
    select: PRODUCTS_SELECT_FULL,
  });

  try {
    const { data, count } = await postgrestGetWithCount<any[]>("products", params);
    return { items: Array.isArray(data) ? data : [], total: count ?? 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const columnMissing = /42703|affiliate_valid|does not exist|column/i.test(msg);
    if (!columnMissing) throw err;

    const fallbackParams = buildProductsParams({
      page,
      perPage,
      needsUpdate,
      q,
      code6,
      categoryId,
      affiliateExpired,
      includeAffiliateExpired: false,
      select: PRODUCTS_SELECT_FALLBACK,
    });
    const { data: fallbackData, count: fallbackCount } = await postgrestGetWithCount<any[]>("products", fallbackParams);
    const items = (Array.isArray(fallbackData) ? fallbackData : []).map((row) => ({
      ...row,
      affiliate_valid: null,
      affiliate_valid_checked_at: null,
    }));
    return { items, total: fallbackCount ?? 0 };
  }
}

export async function adminValidateProductAffiliateLink(productId: string): Promise<{
  valid: boolean;
  error?: string;
}> {
  const rows = await postgrestGet<any[]>("products", {
    select: "id,affiliate_url,title",
    id: `eq.${productId}`,
    limit: "1",
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.affiliate_url) {
    return { valid: false, error: "Produto ou URL não encontrado." };
  }
  const title = row.title ? String(row.title).trim() : "";
  const { valid } = await checkAffiliatePageContainsProduct(
    row.affiliate_url,
    title || "Produto",
  );
  const now = new Date().toISOString();
  await postgrestPatch(
    "products",
    { affiliate_valid: valid, affiliate_valid_checked_at: now },
    { id: `eq.${productId}` },
  );
  return { valid };
}

export async function adminValidateAffiliateLinksBatch(productIds: string[]): Promise<{
  checked: number;
  valid: number;
  invalid: number;
}> {
  let valid = 0;
  let invalid = 0;
  for (const id of productIds) {
    const result = await adminValidateProductAffiliateLink(id);
    if (result.valid) valid += 1;
    else invalid += 1;
    await new Promise((r) => setTimeout(r, 400));
  }
  return { checked: productIds.length, valid, invalid };
}

export async function adminBulkUpdateCategory(productIds: string[], categoryId: string) {
  if (!productIds.length) return;
  await postgrestPatch("products", { category_id: categoryId }, { id: inVal(productIds) });
}

export async function adminBulkMarkNeedsUpdate(productIds: string[], needsUpdate: boolean) {
  if (!productIds.length) return;
  await postgrestPatch("products", { needs_update: needsUpdate }, { id: inVal(productIds) });
}

export async function adminBulkDeleteProducts(productIds: string[]) {
  if (!productIds.length) return;
  await postgrestDelete("products", { id: inVal(productIds) });
}

export async function moveProductToDeletedHistoryAndDelete(
  productId: string,
  reason: string = "sync_not_found",
): Promise<void> {
  const rows = await postgrestGet<any[]>("products", {
    select: "id,code6,slug,title,description,images,category_id,price,promo_price,is_offer,off_percent,affiliate_url,source_url,categories:category_id(name)",
    id: `eq.${productId}`,
    limit: "1",
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return;

  const categoryName = row.categories?.name ?? null;
  const categoryId = row.category_id ?? null;

  await postgrestPost("deleted_products_history", {
    product_id: row.id,
    code6: row.code6,
    slug: row.slug,
    title: row.title,
    description: row.description ?? "",
    images: row.images ?? [],
    category_id: categoryId,
    category_name: categoryName,
    price: row.price,
    promo_price: row.promo_price,
    is_offer: row.is_offer ?? false,
    off_percent: row.off_percent ?? 0,
    affiliate_url: row.affiliate_url,
    source_url: row.source_url ?? null,
    reason,
  });

  await postgrestDelete("products", { id: `eq.${productId}` });
}

export async function adminListDeletedProductsHistory(opts: { page?: number; perPage?: number }) {
  const { page = 1, perPage = 20 } = opts;
  const from = (page - 1) * perPage;
  const { data, count } = await postgrestGetWithCount<any[]>("deleted_products_history", {
    select: "id,product_id,code6,title,images,price,promo_price,category_name,affiliate_url,deleted_at,reason",
    order: "deleted_at.desc",
    offset: String(from),
    limit: String(perPage),
  });
  return { items: Array.isArray(data) ? data : [], total: count ?? 0 };
}

export async function recordProductPriceChange(opts: {
  productId: string;
  oldPrice: number;
  newPrice: number;
  oldPromoPrice: number | null;
  newPromoPrice: number | null;
  source?: string;
}): Promise<void> {
  const { productId, oldPrice, newPrice, oldPromoPrice, newPromoPrice, source = "sync" } = opts;
  const priceChanged = oldPrice !== newPrice || (oldPromoPrice ?? 0) !== (newPromoPrice ?? 0);
  if (!priceChanged) return;
  await postgrestPost("product_price_history", {
    product_id: productId,
    old_price: oldPrice,
    new_price: newPrice,
    old_promo_price: oldPromoPrice,
    new_promo_price: newPromoPrice,
    source,
  });
}

export async function adminListPriceHistory(opts: { page?: number; perPage?: number }) {
  const { page = 1, perPage = 20 } = opts;
  const from = (page - 1) * perPage;
  const { data, count } = await postgrestGetWithCount<any[]>("product_price_history", {
    select: "id,product_id,old_price,new_price,old_promo_price,new_promo_price,changed_at,source,products:product_id(code6,title)",
    order: "changed_at.desc",
    offset: String(from),
    limit: String(perPage),
  });
  return { items: Array.isArray(data) ? data : [], total: count ?? 0 };
}

export async function adminUpdateSiteColors(colors: Record<string, string>) {
  const rows = await postgrestGet<any[]>("site_settings", { select: "id", limit: "1" });
  const data = Array.isArray(rows) ? rows[0] : null;
  if (!data) {
    await postgrestPost("site_settings", { colors });
    return;
  }
  await postgrestPatch("site_settings", { colors }, { id: `eq.${data.id}` });
}

export async function adminUpdateLogoUrl(logoUrl: string | null) {
  const rows = await postgrestGet<any[]>("site_settings", { select: "id", limit: "1" });
  const data = Array.isArray(rows) ? rows[0] : null;
  if (!data) {
    await postgrestPost("site_settings", { logo_url: logoUrl });
    return;
  }
  await postgrestPatch("site_settings", { logo_url: logoUrl }, { id: `eq.${data.id}` });
}

export async function adminGetSiteSettings() {
  const rows = await postgrestGet<any[]>("site_settings", {
    select: "id,logo_url,colors",
    limit: "1",
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

export async function adminGetContactSettings() {
  const rows = await postgrestGet<any[]>("contact_settings", {
    select: "id,address,city,state,phone,email",
    limit: "1",
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

export async function adminUpdateContactSettings(patch: Record<string, any>) {
  const current = await adminGetContactSettings();
  if (!current) {
    await postgrestPost("contact_settings", patch);
    return;
  }
  await postgrestPatch("contact_settings", patch, { id: `eq.${current.id}` });
}

export async function adminListSocialLinks() {
  const data = await postgrestGet<any[]>("social_links", {
    select: "id,icon,url,color,sort_order",
    order: "sort_order.asc",
  });
  return Array.isArray(data) ? data : [];
}

export async function adminUpsertSocialLink(input: {
  id?: string;
  icon: string;
  url: string;
  color?: string | null;
  sort_order?: number;
}) {
  if (input.id) {
    await postgrestPatch(
      "social_links",
      {
        icon: input.icon,
        url: input.url,
        color: input.color ?? null,
        sort_order: input.sort_order ?? 0,
      },
      { id: `eq.${input.id}` },
    );
    return;
  }
  await postgrestPost("social_links", {
    icon: input.icon,
    url: input.url,
    color: input.color ?? null,
    sort_order: input.sort_order ?? 0,
  });
}

export async function adminDeleteSocialLink(id: string) {
  await postgrestDelete("social_links", { id: `eq.${id}` });
}

export async function adminListTokens() {
  const data = await postgrestGet<any[]>("admin_tokens", {
    select: "id,name,active,last_used_at,created_at",
    order: "created_at.desc",
  });
  return Array.isArray(data) ? data : [];
}

export async function adminCreateToken(name: string) {
  const raw = randomToken(32);
  const token_hash = sha256Hex(raw);
  const inserted = await postgrestPost<any[]>(
    "admin_tokens",
    { name, token_hash, active: true },
    "service",
    { select: "id", returning: true },
  );
  const arr = Array.isArray(inserted) ? inserted : [];
  const id = arr[0]?.id;
  if (!id) throw new Error("Falha ao criar token.");
  return { id, token: raw };
}

export async function adminRevokeToken(id: string) {
  await postgrestPatch("admin_tokens", { active: false }, { id: `eq.${id}` });
}

export async function adminListCarousel() {
  const data = await postgrestGet<any[]>("carousel_items", {
    select: "id,product_id,sort_order,size,products:product_id(code6,slug,title,images)",
    order: "sort_order.asc",
  });
  return Array.isArray(data) ? data : [];
}

export async function adminSetCarousel(items: { product_id: string; sort_order: number; size: "S" | "M" | "G" }[]) {
  await postgrestDelete("carousel_items", { id: `neq.00000000-0000-0000-0000-000000000000` });
  if (!items.length) return;
  await postgrestPost("carousel_items", items);
}

export async function buildProductSlug(title: string, code6: string) {
  const base = slugify(title);
  return `${base}-${code6}`;
}
