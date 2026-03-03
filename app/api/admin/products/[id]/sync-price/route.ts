import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { fetchPricesFromUrl } from "@/lib/ml-price";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = getSupabaseServiceRoleClient();

  const { data: row, error } = await supabase
    .from("products")
    .select("id, source_url, affiliate_url")
    .eq("id", id)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json(
      { ok: false, error: "Produto não encontrado." },
      { status: 404 },
    );
  }

  const sourceUrl = (row as any).source_url as string | null;
  const affiliateUrl = (row as any).affiliate_url as string | null;
  const url = sourceUrl || affiliateUrl;

  if (!url) {
    return NextResponse.json(
      { ok: false, error: "Produto sem URL de origem (source_url ou affiliate_url)." },
      { status: 400 },
    );
  }

  const priceInfo = await fetchPricesFromUrl(url);
  if (!priceInfo) {
    return NextResponse.json(
      { ok: false, error: "Não foi possível obter o preço na página do Mercado Livre. Verifique se a URL está acessível." },
      { status: 400 },
    );
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
    .eq("id", id);

  return NextResponse.json({
    ok: true,
    price,
    promo_price: promo,
    is_offer,
    off_percent,
  });
}
