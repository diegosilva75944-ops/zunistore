import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function extractMlItemIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const decoded = decodeURIComponent(url);
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
  const url = `https://api.mercadolibre.com/items/${itemId}/sale_price?context=channel_marketplace,buyer_loyalty_3`;
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

function parseBRLFromText(text: string): number | null {
  const m = String(text || "").match(/R\$\s*([\d\.]+,\d{2})/);
  if (!m) return null;
  const raw = m[1].replace(/\./g, "").replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function findPromoAndPriceInHtml(html: string): {
  price: number | null;
  promoPrice: number | null;
} {
  const snippet = String(html || "").slice(0, 20000);
  const re = /(de\s*)?(R\$\s*[\d\.]+,\d{2})/gi;
  const found: { n: number; isOld: boolean }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(snippet))) {
    const isOld = !!m[1];
    const n = parseBRLFromText(m[2]);
    if (n != null) found.push({ n, isOld });
    if (found.length >= 20) break;
  }
  const olds = found.filter((x) => x.isOld).map((x) => x.n);
  const news = found.filter((x) => !x.isOld).map((x) => x.n);
  if (olds.length && news.length) {
    const price = Math.max(...olds);
    const promoPrice = Math.min(...news);
    if (promoPrice < price) return { price, promoPrice };
  }
  const nums = found.map((x) => x.n);
  if (nums.length >= 2) {
    const sorted = [...new Set(nums)].sort((a, b) => b - a);
    const price = sorted[0];
    const promoPrice = sorted[1];
    if (promoPrice < price) return { price, promoPrice };
  }
  if (nums.length === 1) return { price: nums[0], promoPrice: null };
  return { price: null, promoPrice: null };
}

async function fetchPriceFromMainPage(url: string): Promise<{
  price: number;
  promoPrice: number | null;
} | null> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const html = await res.text().catch(() => null);
  if (!html) return null;

  const { price, promoPrice } = findPromoAndPriceInHtml(html);
  if (!price || !Number.isFinite(price) || price <= 0) return null;

  const promo = promoPrice != null && promoPrice < price ? promoPrice : null;
  return { price, promoPrice: promo };
}

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

  let finalPrice: number | null = null;
  let finalPromo: number | null = null;

  const sourceUrl = (row as any).source_url as string | null;
  const affiliateUrl = (row as any).affiliate_url as string | null;

  // 1) Tenta via URL principal (source_url)
  if (sourceUrl) {
    const itemIdFromSource = extractMlItemIdFromUrl(sourceUrl);
    if (itemIdFromSource) {
      const apiPrice = await fetchMlSalePrice(itemIdFromSource);
      if (apiPrice) {
        const basePrice = apiPrice.regular_amount ?? apiPrice.amount;
        const promoPrice =
          apiPrice.regular_amount != null &&
          apiPrice.regular_amount > apiPrice.amount
            ? apiPrice.amount
            : null;
        finalPrice = Number(basePrice);
        finalPromo = promoPrice == null ? null : Number(promoPrice);
      }
    }

    if (!finalPrice || !Number.isFinite(finalPrice) || finalPrice <= 0) {
      const htmlPrice = await fetchPriceFromMainPage(sourceUrl);
      if (htmlPrice) {
        finalPrice = htmlPrice.price;
        finalPromo =
          htmlPrice.promoPrice != null ? htmlPrice.promoPrice : null;
      }
    }
  }

  // 2) Fallback: affiliate_url
  if (
    (!finalPrice || !Number.isFinite(finalPrice) || finalPrice <= 0) &&
    affiliateUrl
  ) {
    const itemIdFromAffiliate = extractMlItemIdFromUrl(affiliateUrl);
    if (itemIdFromAffiliate) {
      const apiPrice = await fetchMlSalePrice(itemIdFromAffiliate);
      if (apiPrice) {
        const basePrice = apiPrice.regular_amount ?? apiPrice.amount;
        const promoPrice =
          apiPrice.regular_amount != null &&
          apiPrice.regular_amount > apiPrice.amount
            ? apiPrice.amount
            : null;
        finalPrice = Number(basePrice);
        finalPromo = promoPrice == null ? null : Number(promoPrice);
      }
    }
  }

  if (!finalPrice || !Number.isFinite(finalPrice) || finalPrice <= 0) {
    return NextResponse.json(
      { ok: false, error: "Não foi possível obter o preço atual." },
      { status: 400 },
    );
  }

  const price = finalPrice;
  const promo = finalPromo != null && finalPromo < price ? finalPromo : null;
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

