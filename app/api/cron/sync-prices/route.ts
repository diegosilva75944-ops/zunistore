import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function extractMlItemId(sourceUrl: string | null | undefined): string | null {
  if (!sourceUrl) return null;
  try {
    const decoded = decodeURIComponent(sourceUrl);
    const m = decoded.match(/(MLB\d{5,})/i);
    return m ? m[1].toUpperCase() : null;
  } catch {
    return null;
  }
}

type MlSalePrice = {
  amount: number;
  regular_amount: number | null;
  currency_id: string;
};

async function fetchMlSalePrice(itemId: string): Promise<MlSalePrice | null> {
  // Usa endpoint de preço atual recomendado pela API do Mercado Livre
  const url = `https://api.mercadolibre.com/items/${itemId}/sale_price?context=channel_marketplace`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data || typeof data.amount !== "number") return null;
  return {
    amount: data.amount,
    regular_amount:
      typeof data.regular_amount === "number" ? data.regular_amount : null,
    currency_id: String(data.currency_id || "BRL"),
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  const secret = process.env.CRON_SECRET;

  if (!secret || key !== secret) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const supabase = getSupabaseServiceRoleClient();

  const { data: products, error } = await supabase
    .from("products")
    .select("id, source_url")
    .limit(100);

  if (error) {
    return NextResponse.json(
      { ok: false, error: "Failed to load products." },
      { status: 500 },
    );
  }

  const rows = (products ?? []) as { id: string; source_url: string | null }[];
  if (!rows.length) {
    return NextResponse.json({ ok: true, total: 0, updated: 0, skipped: 0 });
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const p of rows) {
    const itemId = extractMlItemId(p.source_url);
    if (!itemId) {
      skipped += 1;
      continue;
    }

    try {
      const priceInfo = await fetchMlSalePrice(itemId);
      if (!priceInfo) {
        skipped += 1;
        continue;
      }

      const basePrice = priceInfo.regular_amount ?? priceInfo.amount;
      const promoPrice =
        priceInfo.regular_amount != null &&
        priceInfo.regular_amount > priceInfo.amount
          ? priceInfo.amount
          : null;

      const price = Number(basePrice);
      const promo = promoPrice == null ? null : Number(promoPrice);

      if (!Number.isFinite(price) || price <= 0) {
        skipped += 1;
        continue;
      }

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

  return NextResponse.json({
    ok: true,
    total: rows.length,
    updated,
    skipped,
    failed,
  });
}

