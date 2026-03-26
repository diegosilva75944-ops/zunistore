import { NextResponse } from "next/server";
import { postgrestGet, postgrestPatch } from "@/lib/postgrest/server";
import { getAdminSession } from "@/lib/admin/auth";
import { fetchPricesFromUrl } from "@/lib/ml-price";
import { moveProductToDeletedHistoryAndDelete, recordProductPriceChange } from "@/lib/admin/db";

export const runtime = "nodejs";
export const maxDuration = 60;

async function syncAllProducts() {
  let rows: { id: string; source_url: string | null; affiliate_url: string | null; price: number; promo_price: number | null }[];
  try {
    const products = await postgrestGet<any[]>("products", {
      select: "id,source_url,affiliate_url,price,promo_price",
      order: "updated_at.asc",
      limit: "50",
    });
    rows = Array.isArray(products) ? products : [];
  } catch {
    return { ok: false, error: "Failed to load products.", total: 0, updated: 0, skipped: 0, failed: 0, deleted: 0 };
  }

  if (!rows.length) {
    return { ok: true, total: 0, updated: 0, skipped: 0, failed: 0, deleted: 0 };
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let deleted = 0;

  for (const p of rows) {
    if (!p.source_url && !p.affiliate_url) {
      skipped += 1;
      continue;
    }

    try {
      const ml = await fetchPricesFromUrl({
        sourceUrl: p.source_url,
        affiliateUrl: p.affiliate_url,
      });
      if (ml.kind === "listing_gone") {
        await moveProductToDeletedHistoryAndDelete(p.id, "sync_not_found");
        deleted += 1;
        continue;
      }
      if (ml.kind === "unreadable" || ml.kind === "http_error" || ml.kind === "blocked") {
        failed += 1;
        continue;
      }

      const { price, promoPrice: promo } = ml;

      const is_offer = promo != null && promo < price;
      const off_percent = is_offer
        ? Math.round((1 - promo! / price) * 100)
        : 0;

      const oldPrice = Number(p.price) || 0;
      const oldPromo = p.promo_price != null ? Number(p.promo_price) : null;
      await recordProductPriceChange({
        productId: p.id,
        oldPrice,
        newPrice: price,
        oldPromoPrice: oldPromo,
        newPromoPrice: promo ?? null,
        source: "sync_batch",
      });

      await postgrestPatch("products", {
        price,
        promo_price: promo,
        is_offer,
        off_percent,
        last_seen_at: new Date().toISOString(),
      }, { id: `eq.${p.id}` });

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
