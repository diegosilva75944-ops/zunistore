import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/admin/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

function parseBRL(text: string): number | null {
  const m = String(text || "").match(/R\$\s*([\d\.]+,\d{2})/);
  if (!m) return null;
  const raw = m[1].replace(/\./g, "").replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function extractPricesFromHtml(html: string): { price: number | null; promoPrice: number | null } {
  let originalPrice: number | null = null;
  let promoPrice: number | null = null;

  const ariaLabelMatch = html.match(/aria-label="Antes:\s*(\d+)\s*reais?\s*(?:com\s*)?(\d+)?\s*centavos?"/i);
  if (ariaLabelMatch) {
    const reais = parseInt(ariaLabelMatch[1], 10);
    const centavos = ariaLabelMatch[2] ? parseInt(ariaLabelMatch[2], 10) : 0;
    originalPrice = reais + centavos / 100;
  }

  const metaPriceMatch = html.match(/<meta\s+itemprop="price"\s+content="([\d.]+)"/i);
  if (metaPriceMatch) {
    promoPrice = parseFloat(metaPriceMatch[1]);
  }

  if (originalPrice != null && promoPrice != null && promoPrice < originalPrice) {
    return { price: originalPrice, promoPrice };
  }

  const snippet = html.slice(0, 30000);
  const re = /(de\s*)?(R\$\s*[\d\.]+,\d{2})/gi;
  const found: { n: number; isOld: boolean }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(snippet))) {
    const isOld = !!m[1];
    const n = parseBRL(m[2]);
    if (n != null) found.push({ n, isOld });
    if (found.length >= 10) break;
  }

  const olds = found.filter((x) => x.isOld).map((x) => x.n);
  const news = found.filter((x) => !x.isOld).map((x) => x.n);

  if (olds.length && news.length) {
    const price = Math.max(...olds);
    const promo = Math.min(...news);
    if (promo < price) return { price, promoPrice: promo };
  }

  const nums = found.map((x) => x.n);
  if (nums.length >= 2) {
    const sorted = [...new Set(nums)].sort((a, b) => b - a);
    const price = sorted[0];
    const promo = sorted[1];
    if (promo < price) return { price, promoPrice: promo };
    return { price, promoPrice: null };
  }

  if (nums.length === 1) return { price: nums[0], promoPrice: null };

  return { price: originalPrice ?? promoPrice, promoPrice: originalPrice ? promoPrice : null };
}

async function fetchPricesFromUrl(url: string): Promise<{ price: number; promoPrice: number | null } | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });
    if (!res.ok) return null;

    const html = await res.text();
    const { price, promoPrice } = extractPricesFromHtml(html);

    if (!price || !Number.isFinite(price) || price <= 0) return null;

    return { price, promoPrice };
  } catch {
    return null;
  }
}

async function syncAllProducts() {
  const supabase = getSupabaseServiceRoleClient();

  const { data: products, error } = await supabase
    .from("products")
    .select("id, source_url, affiliate_url")
    .order("updated_at", { ascending: true })
    .limit(50);

  if (error) {
    return { ok: false, error: "Failed to load products.", total: 0, updated: 0, skipped: 0, failed: 0 };
  }

  const rows = (products ?? []) as { id: string; source_url: string | null; affiliate_url: string | null }[];
  if (!rows.length) {
    return { ok: true, total: 0, updated: 0, skipped: 0, failed: 0 };
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const p of rows) {
    const url = p.source_url || p.affiliate_url;
    if (!url) {
      skipped += 1;
      continue;
    }

    try {
      const priceInfo = await fetchPricesFromUrl(url);
      if (!priceInfo) {
        skipped += 1;
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
