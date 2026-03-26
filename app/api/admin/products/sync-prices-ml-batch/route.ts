import { NextResponse } from "next/server";
import { postgrestPatch } from "@/lib/postgrest/server";
import {
  adminListMercadolivreProductsForPriceSync,
  moveProductToDeletedHistoryAndDelete,
  recordProductPriceChange,
} from "@/lib/admin/db";
import { fetchPricesFromUrl } from "@/lib/ml-price";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Sincroniza um lote de produtos Mercado Livre (HTML + Playwright como fetchPricesFromUrl).
 * Autenticação: cookie de admin (middleware).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(50, Math.max(1, parseInt(String(body?.limit ?? "10"), 10) || 10));

    const rows = await adminListMercadolivreProductsForPriceSync({ limit });

    if (!rows.length) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        deleted: 0,
        moreLikely: false,
      });
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
        const priceInfo = await fetchPricesFromUrl(String(url));
        if (!priceInfo) {
          await moveProductToDeletedHistoryAndDelete(String(p.id), "sync_not_found");
          deleted += 1;
          continue;
        }

        const { price, promoPrice: promo } = priceInfo;
        const is_offer = promo != null && promo < price;
        const off_percent = is_offer ? Math.round((1 - promo! / price) * 100) : 0;

        const oldPrice = Number(p.price) || 0;
        const oldPromo = p.promo_price != null ? Number(p.promo_price) : null;

        await recordProductPriceChange({
          productId: String(p.id),
          oldPrice,
          newPrice: price,
          oldPromoPrice: oldPromo,
          newPromoPrice: promo ?? null,
          source: "sync_ml_admin_batch",
        });

        await postgrestPatch(
          "products",
          {
            price,
            promo_price: promo,
            is_offer,
            off_percent,
            last_seen_at: new Date().toISOString(),
          },
          { id: `eq.${p.id}` },
        );

        updated += 1;
      } catch {
        failed += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      processed: rows.length,
      updated,
      skipped,
      failed,
      deleted,
      moreLikely: rows.length >= limit,
    });
  } catch (e) {
    console.error("[sync-prices-ml-batch]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro ao sincronizar lote." },
      { status: 500 },
    );
  }
}
