import "server-only";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { slugify } from "@/lib/slug";
import { checkAffiliatePageContainsProduct } from "@/lib/affiliate-validate";

export async function adminListCategories() {
  const supabase = getSupabaseServiceRoleClient();
  const { data } = await supabase
    .from("categories")
    .select("id, name, slug, parent_id, is_seed, created_at")
    .order("name", { ascending: true });
  return (data ?? []) as any[];
}

export async function adminCreateCategory(input: {
  name: string;
  slug?: string | null;
  parent_id?: string | null;
}) {
  const supabase = getSupabaseServiceRoleClient();
  const slug = (input.slug?.trim() ? slugify(input.slug) : slugify(input.name)) || "categoria";
  const { data: existing } = await supabase
    .from("categories")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existing) throw new Error("Já existe uma categoria com este slug.");
  const { data: inserted, error } = await supabase
    .from("categories")
    .insert({
      name: input.name.trim(),
      slug,
      parent_id: input.parent_id ?? null,
      is_seed: false,
    })
    .select("id, name, slug, parent_id, is_seed")
    .single();
  if (error) throw error;
  return inserted as any;
}

export async function adminUpdateCategory(
  id: string,
  input: { name?: string; slug?: string }
) {
  const supabase = getSupabaseServiceRoleClient();
  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.slug !== undefined) {
    const slug = input.slug.trim() || slugify((input.name as string) || "");
    if (slug) updates.slug = slug;
  }
  if (Object.keys(updates).length === 0) return;
  const { error } = await supabase.from("categories").update(updates).eq("id", id);
  if (error) throw error;
}

export async function adminDeleteCategory(id: string) {
  const supabase = getSupabaseServiceRoleClient();
  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);
  if (count && count > 0) throw new Error("Não é possível excluir: existem produtos nesta categoria.");
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}

/** Parâmetro obrigatório na URL final (após redirect) para o link de afiliado ser considerado válido. */
export const AFFILIATE_VALID_PARAM = "matt_tool=40141155";

/** Conta produtos cujo link de afiliado foi validado e a URL final não contém o param (expirado). */
export async function adminCountExpiredAffiliateProducts(): Promise<number> {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { count } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("affiliate_valid", false);
    return count ?? 0;
  } catch {
    return 0;
  }
}

const PRODUCTS_SELECT_FULL =
  "id, code6, slug, title, images, price, promo_price, is_offer, off_percent, needs_update, affiliate_url, affiliate_valid, affiliate_valid_checked_at, created_at, categories:category_id (id, name, slug)";
const PRODUCTS_SELECT_FALLBACK =
  "id, code6, slug, title, images, price, promo_price, is_offer, off_percent, needs_update, affiliate_url, created_at, categories:category_id (id, name, slug)";

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
  const supabase = getSupabaseServiceRoleClient();
  const range = [(page - 1) * perPage, (page - 1) * perPage + perPage - 1] as [number, number];

  const searchTerm = q?.trim() ?? "";
  const applyFilters = (qb: any, includeAffiliateExpired: boolean) => {
    if (needsUpdate === true) qb = qb.eq("needs_update", true);
    if (needsUpdate === false) qb = qb.eq("needs_update", false);
    if (categoryId) qb = qb.eq("category_id", categoryId);
    if (code6?.trim()) qb = qb.ilike("code6", `%${code6.trim()}%`);
    if (searchTerm) qb = qb.or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
    if (includeAffiliateExpired && affiliateExpired === true) qb = qb.eq("affiliate_valid", false);
    return qb;
  };

  let query = supabase
    .from("products")
    .select(PRODUCTS_SELECT_FULL, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(...range);
  query = applyFilters(query, true);

  const { data, error, count } = await query;

  const columnMissing =
    error &&
    (String((error as any).code) === "42703" ||
      /affiliate_valid|does not exist|column/i.test(String((error as any).message ?? "")));

  if (columnMissing) {
    let fallbackQuery = supabase
      .from("products")
      .select(PRODUCTS_SELECT_FALLBACK, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(...range);
    fallbackQuery = applyFilters(fallbackQuery, false);
    const { data: fallbackData, count: fallbackCount } = await fallbackQuery;
    const items = ((fallbackData ?? []) as any[]).map((row) => ({
      ...row,
      affiliate_valid: null,
      affiliate_valid_checked_at: null,
    }));
    return { items, total: fallbackCount ?? 0 };
  }

  if (error) throw error;
  return { items: (data ?? []) as any[], total: count ?? 0 };
}

/** Valida o link de afiliado: abre a página e verifica se o nome do produto aparece nela. Se não aparecer, marca como expirado. */
export async function adminValidateProductAffiliateLink(productId: string): Promise<{
  valid: boolean;
  error?: string;
}> {
  const supabase = getSupabaseServiceRoleClient();
  const { data: row, error: fetchError } = await supabase
    .from("products")
    .select("id, affiliate_url, title")
    .eq("id", productId)
    .maybeSingle();

  if (fetchError || !row?.affiliate_url) {
    return { valid: false, error: "Produto ou URL não encontrado." };
  }

  const title = (row as any).title ? String((row as any).title).trim() : "";
  const { valid } = await checkAffiliatePageContainsProduct(
    row.affiliate_url as string,
    title || "Produto",
  );
  const now = new Date().toISOString();

  await supabase
    .from("products")
    .update({ affiliate_valid: valid, affiliate_valid_checked_at: now })
    .eq("id", productId);

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
  const supabase = getSupabaseServiceRoleClient();
  await supabase.from("products").update({ category_id: categoryId }).in("id", productIds);
}

export async function adminBulkMarkNeedsUpdate(productIds: string[], needsUpdate: boolean) {
  const supabase = getSupabaseServiceRoleClient();
  await supabase.from("products").update({ needs_update: needsUpdate }).in("id", productIds);
}

export async function adminBulkDeleteProducts(productIds: string[]) {
  const supabase = getSupabaseServiceRoleClient();
  await supabase.from("products").delete().in("id", productIds);
}

/** Copia o produto para deleted_products_history e remove da listagem (e do site). Usado quando o sync não encontra mais o produto na URL. */
export async function moveProductToDeletedHistoryAndDelete(
  productId: string,
  reason: string = "sync_not_found",
): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();

  const { data: row, error: fetchError } = await supabase
    .from("products")
    .select(
      "id, code6, slug, title, description, images, category_id, price, promo_price, is_offer, off_percent, affiliate_url, source_url, categories:category_id (name)",
    )
    .eq("id", productId)
    .maybeSingle();

  if (fetchError || !row) return;

  const categoryName = (row as any).categories?.name ?? null;
  const categoryId = (row as any).category_id ?? null;

  await supabase.from("deleted_products_history").insert({
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

  await supabase.from("products").delete().eq("id", productId);
}

export async function adminListDeletedProductsHistory(opts: {
  page?: number;
  perPage?: number;
}) {
  const { page = 1, perPage = 20 } = opts;
  const supabase = getSupabaseServiceRoleClient();

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const { data, count } = await supabase
    .from("deleted_products_history")
    .select("id, product_id, code6, title, images, price, promo_price, category_name, affiliate_url, deleted_at, reason", {
      count: "exact",
    })
    .order("deleted_at", { ascending: false })
    .range(from, to);

  return { items: (data ?? []) as any[], total: count ?? 0 };
}

/** Registra alteração de preço no histórico (só insere se preço ou promo mudou). */
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
  const supabase = getSupabaseServiceRoleClient();
  await supabase.from("product_price_history").insert({
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
  const supabase = getSupabaseServiceRoleClient();
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  const { data, count } = await supabase
    .from("product_price_history")
    .select(
      "id, product_id, old_price, new_price, old_promo_price, new_promo_price, changed_at, source, products:product_id (code6, title)",
      { count: "exact" },
    )
    .order("changed_at", { ascending: false })
    .range(from, to);
  return { items: (data ?? []) as any[], total: count ?? 0 };
}

export async function adminUpdateSiteColors(colors: Record<string, string>) {
  const supabase = getSupabaseServiceRoleClient();
  const { data } = await supabase.from("site_settings").select("id").limit(1).maybeSingle();
  if (!data) {
    await supabase.from("site_settings").insert({ colors });
    return;
  }
  await supabase.from("site_settings").update({ colors }).eq("id", data.id);
}

export async function adminUpdateLogoUrl(logoUrl: string | null) {
  const supabase = getSupabaseServiceRoleClient();
  const { data } = await supabase.from("site_settings").select("id").limit(1).maybeSingle();
  if (!data) {
    await supabase.from("site_settings").insert({ logo_url: logoUrl });
    return;
  }
  await supabase.from("site_settings").update({ logo_url: logoUrl }).eq("id", data.id);
}

export async function adminGetSiteSettings() {
  const supabase = getSupabaseServiceRoleClient();
  const { data } = await supabase.from("site_settings").select("id, logo_url, colors").limit(1).maybeSingle();
  return data as any | null;
}

export async function adminGetContactSettings() {
  const supabase = getSupabaseServiceRoleClient();
  const { data } = await supabase
    .from("contact_settings")
    .select("id, address, city, state, phone, email")
    .limit(1)
    .maybeSingle();
  return data as any | null;
}

export async function adminUpdateContactSettings(patch: Record<string, any>) {
  const supabase = getSupabaseServiceRoleClient();
  const current = await adminGetContactSettings();
  if (!current) {
    await supabase.from("contact_settings").insert(patch);
    return;
  }
  await supabase.from("contact_settings").update(patch).eq("id", current.id);
}

export async function adminListSocialLinks() {
  const supabase = getSupabaseServiceRoleClient();
  const { data } = await supabase
    .from("social_links")
    .select("id, icon, url, color, sort_order")
    .order("sort_order", { ascending: true });
  return (data ?? []) as any[];
}

export async function adminUpsertSocialLink(input: {
  id?: string;
  icon: string;
  url: string;
  color?: string | null;
  sort_order?: number;
}) {
  const supabase = getSupabaseServiceRoleClient();
  if (input.id) {
    await supabase
      .from("social_links")
      .update({
        icon: input.icon,
        url: input.url,
        color: input.color ?? null,
        sort_order: input.sort_order ?? 0,
      })
      .eq("id", input.id);
    return;
  }
  await supabase.from("social_links").insert({
    icon: input.icon,
    url: input.url,
    color: input.color ?? null,
    sort_order: input.sort_order ?? 0,
  });
}

export async function adminDeleteSocialLink(id: string) {
  const supabase = getSupabaseServiceRoleClient();
  await supabase.from("social_links").delete().eq("id", id);
}

export async function adminListTokens() {
  const supabase = getSupabaseServiceRoleClient();
  const { data } = await supabase
    .from("admin_tokens")
    .select("id, name, active, last_used_at, created_at")
    .order("created_at", { ascending: false });
  return (data ?? []) as any[];
}

export async function adminCreateToken(name: string) {
  const supabase = getSupabaseServiceRoleClient();
  const raw = randomToken(32);
  const token_hash = sha256Hex(raw);
  const { data, error } = await supabase
    .from("admin_tokens")
    .insert({ name, token_hash, active: true })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return { id: data?.id as string, token: raw };
}

export async function adminRevokeToken(id: string) {
  const supabase = getSupabaseServiceRoleClient();
  await supabase.from("admin_tokens").update({ active: false }).eq("id", id);
}

export async function adminListCarousel() {
  const supabase = getSupabaseServiceRoleClient();
  const { data } = await supabase
    .from("carousel_items")
    .select("id, product_id, sort_order, size, products:product_id (code6, slug, title, images)")
    .order("sort_order", { ascending: true });
  return (data ?? []) as any[];
}

export async function adminSetCarousel(items: { product_id: string; sort_order: number; size: "S" | "M" | "G" }[]) {
  const supabase = getSupabaseServiceRoleClient();
  await supabase.from("carousel_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (!items.length) return;
  await supabase.from("carousel_items").insert(items);
}

export async function buildProductSlug(title: string, code6: string) {
  const base = slugify(title);
  return `${base}-${code6}`;
}

