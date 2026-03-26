import { NextResponse } from "next/server";
import { z } from "zod";
import { postgrestGet, postgrestPatch } from "@/lib/postgrest/server";
import { sha256Hex } from "@/lib/crypto";
import { recordProductPriceChange } from "@/lib/admin/db";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

function withCors(res: NextResponse) {
  Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

const schema = z.object({
  productId: z.string().uuid(),
  price: z.coerce.number().positive(),
  promoPrice: z.coerce.number().positive().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m?.[1]?.trim()) {
      return withCors(NextResponse.json({ ok: false, error: "Token ausente." }, { status: 401 }));
    }
    const rawToken = m[1].trim();
    const tokenHash = sha256Hex(rawToken);

    const tokenRows = await postgrestGet<any[]>("admin_tokens", {
      select: "id,active",
      token_hash: `eq.${tokenHash}`,
      limit: "1",
    });
    const tokenRow = Array.isArray(tokenRows) ? tokenRows[0] : null;

    if (!tokenRow || !tokenRow.active) {
      return withCors(
        NextResponse.json({ ok: false, error: "Token inválido ou revogado." }, { status: 401 }),
      );
    }

    await postgrestPatch(
      "admin_tokens",
      { last_used_at: new Date().toISOString() },
      { id: `eq.${tokenRow.id}` },
    );

    const json = await req.json().catch(() => null);
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return withCors(NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 }));
    }

    let price = parsed.data.price;
    let promo =
      parsed.data.promoPrice != null && Number.isFinite(Number(parsed.data.promoPrice))
        ? Number(parsed.data.promoPrice)
        : null;
    if (promo != null && promo >= price) promo = null;

    const is_offer = promo != null && promo < price;
    const off_percent =
      promo != null && is_offer ? Math.round((1 - promo / price) * 100) : 0;

    const rows = await postgrestGet<any[]>("products", {
      select: "id,price,promo_price",
      id: `eq.${parsed.data.productId}`,
      limit: "1",
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) {
      return withCors(NextResponse.json({ ok: false, error: "Produto não encontrado." }, { status: 404 }));
    }

    const oldPrice = Number(row.price) || 0;
    const oldPromo = row.promo_price != null ? Number(row.promo_price) : null;

    await recordProductPriceChange({
      productId: parsed.data.productId,
      oldPrice,
      newPrice: price,
      oldPromoPrice: oldPromo,
      newPromoPrice: promo,
      source: "extension_sync",
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
      { id: `eq.${parsed.data.productId}` },
    );

    return withCors(
      NextResponse.json({
        ok: true,
        price,
        promo_price: promo,
        is_offer,
        off_percent,
      }),
    );
  } catch (e) {
    console.error("[import/mercadolivre/sync-product-prices]", e);
    return withCors(
      NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "Erro interno." },
        { status: 500 },
      ),
    );
  }
}
