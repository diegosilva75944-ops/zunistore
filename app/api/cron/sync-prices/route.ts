import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/admin/auth";
import { fetchPricesFromUrl } from "@/lib/ml-price";
import { moveProductToDeletedHistoryAndDelete } from "@/lib/admin/db";

export const runtime = "nodejs";
export const maxDuration = 60;

async function syncAllProducts() {
  const supabase = getSupabaseServiceRoleClient();

  const { data: products, error } = await supabase
    .from("products")
    .select("id, source_url, affiliate_url")
    .order("updated_at", { ascending: true })
    .limit(50);

  if (error) {
    return { ok: false, error: "Failed to load products.", total: 0, updated: 0, skipped: 0, failed: 0, deleted: 0 };
  }

  const rows = (products ?? []) as { id: string; source_url: string | null; affiliate_url: string | null }[];
  if (!rows.length) {
    return { ok: true, total: 0, updated: 0, skipped: 0, failed: 0, deleted: 0 };
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let deleted = 0;

  for (const p of rows) {
    const url = p.source_url || p.affiliate_url;
    if (!url) {
      skipped += 1;
      continue;
    }

    try {
      const priceInfo = await fetchPricesFromUrl(url);
      if (!priceInfo) {
        await moveProductToDeletedHistoryAndDelete(p.id, "sync_not_found");
        deleted += 1;
        continue;
      }

      const { price, promoPrice: promo } = priceInfo;

      const is_offer = promo != null && promo < price;
      const off_percent = is_offer
        ? Math.round((1 - promo! / price) * 100)
        : 0;

      await supabase
        .from("products")
        .update({
          price,
          promo_price: promo,
          is_offer,
          off_percent,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", p.id);

      updated += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    ok: true,
    total: rows.length,
    updated,
    skipped,
    failed,
    deleted,
  };
}

export async function GET(_req: Request) {
  const result = await syncAllProducts();
  if (!result.ok) {
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(result);
}

export async function POST(_req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const result = await syncAllProducts();
  if (!result.ok) {
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(result);
}
