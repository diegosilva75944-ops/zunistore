import { NextResponse } from "next/server";
import { z } from "zod";
import { postgrestGet, postgrestPatch } from "@/lib/postgrest/server";
import { recordProductPriceChange } from "@/lib/admin/db";
import { assertMobileAppAuthorized, MobileAppAuthError } from "@/lib/mobile-app/auth";

export const runtime = "nodejs";

const itemSchema = z.object({
  product_id: z.string().min(8),
  ok: z.boolean(),
  price: z.number().positive().optional().nullable(),
  promo_price: z.number().nonnegative().optional().nullable(),
  error: z.string().optional().nullable(),
});

const bodySchema = z.object({
  items: z.array(itemSchema).min(1).max(50),
});

export async function POST(req: Request) {
  try {
    assertMobileAppAuthorized(req);
    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Body inválido. Envie { items: [...] }." },
        { status: 400 },
      );
    }

    const results: { product_id: string; updated: boolean; error?: string }[] = [];

    for (const r of parsed.data.items) {
      if (!r.ok) {
        results.push({ product_id: r.product_id, updated: false, error: r.error ?? "sync_failed" });
        continue;
      }
      if (r.price == null || !Number.isFinite(r.price)) {
        results.push({ product_id: r.product_id, updated: false, error: "price_missing" });
        continue;
      }

      try {
        const rows = await postgrestGet<any[]>("products", {
          select: "id,price,promo_price",
          id: `eq.${r.product_id}`,
          limit: "1",
        });
        const row = Array.isArray(rows) ? rows[0] : null;
        if (!row) {
          results.push({ product_id: r.product_id, updated: false, error: "product_not_found" });
          continue;
        }

        const oldPrice = Number(row.price ?? 0);
        const oldPromo = row.promo_price != null ? Number(row.promo_price) : null;
        const newPrice = Number(r.price);
        const newPromo = r.promo_price != null && Number.isFinite(r.promo_price) ? Number(r.promo_price) : null;

        await recordProductPriceChange({
          productId: r.product_id,
          oldPrice,
          newPrice,
          oldPromoPrice: oldPromo,
          newPromoPrice: newPromo,
          source: "mobile_worker",
        });

        await postgrestPatch(
          "products",
          {
            price: newPrice,
            promo_price: newPromo,
            last_seen_at: new Date().toISOString(),
          },
          { id: `eq.${r.product_id}` },
        );

        results.push({ product_id: r.product_id, updated: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ product_id: r.product_id, updated: false, error: msg });
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    if (e instanceof MobileAppAuthError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    console.error("[mobile/v1/sync/report]", e);
    return NextResponse.json({ ok: false, error: "Erro interno." }, { status: 500 });
  }
}
