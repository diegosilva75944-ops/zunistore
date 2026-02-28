import "server-only";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { slugify } from "@/lib/slug";

export async function adminListCategories() {
  const supabase = getSupabaseServiceRoleClient();
  const { data } = await supabase
    .from("categories")
    .select("id, name, slug, parent_id")
    .order("name", { ascending: true });
  return (data ?? []) as any[];
}

export async function adminListProducts(opts: {
  page?: number;
  perPage?: number;
  needsUpdate?: boolean | null;
}) {
  const { page = 1, perPage = 20, needsUpdate = null } = opts;
  const supabase = getSupabaseServiceRoleClient();

  let q = supabase
    .from("products")
    .select(
      "id, code6, slug, title, images, price, promo_price, is_offer, off_percent, needs_update, affiliate_url, created_at, categories:category_id (id, name, slug)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * perPage, (page - 1) * perPage + perPage - 1);

  if (needsUpdate === true) q = q.eq("needs_update", true);
  if (needsUpdate === false) q = q.eq("needs_update", false);

  const { data, count } = await q;
  return { items: (data ?? []) as any[], total: count ?? 0 };
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

