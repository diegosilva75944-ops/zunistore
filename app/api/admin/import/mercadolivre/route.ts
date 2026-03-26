import { NextResponse } from "next/server";
import { z } from "zod";
import { postgrestGet, postgrestPost, postgrestPatch, postgrestRpc } from "@/lib/postgrest/server";
import { sha256Hex } from "@/lib/crypto";
import { slugify } from "@/lib/slug";
import { adminUpsertCategoryFromBreadcrumb } from "@/lib/admin/categories";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function withCors(res: NextResponse) {
  Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

const schema = z.object({
  title: z.string().min(3),
  description: z.string().optional().default(""),
  descriptionDetail: z.string().optional().default(""),
  images: z.array(z.string().url()).optional().default([]),
  price: z.coerce.number().positive(),
  promoPrice: z.coerce.number().positive().optional().nullable(),
  rating: z.coerce.number().optional().nullable(),
  reviewsCount: z.coerce.number().int().optional().nullable(),
  categoryPath: z.array(z.string()).optional().default([]),
  categoryName: z.string().optional().default(""),
  affiliateCode: z.string().min(1).optional().default("manual"),
  affiliateUrl: z.string().url(),
  sourceUrl: z.string().url(),
});

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) {
      return withCors(NextResponse.json({ ok: false, error: "Token ausente." }, { status: 401 }));
    }
    const rawToken = m[1].trim();
    if (!rawToken) {
      return withCors(NextResponse.json({ ok: false, error: "Token ausente." }, { status: 401 }));
    }

    const tokenHash = sha256Hex(rawToken);

    const tokenRows = await postgrestGet<any[]>("admin_tokens", {
      select: "id,active",
      token_hash: `eq.${tokenHash}`,
      limit: "1",
    });
    const tokenRow = Array.isArray(tokenRows) ? tokenRows[0] : null;

    if (!tokenRow || !tokenRow.active) {
      return withCors(NextResponse.json({ ok: false, error: "Token inválido ou revogado." }, { status: 401 }));
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

    const p = parsed.data;

    const code6 = await postgrestRpc<string>("next_product_code6", {});
    if (typeof code6 !== "string" || code6.length !== 6) {
      return withCors(NextResponse.json({ ok: false, error: "Falha ao gerar code6." }, { status: 500 }));
    }

    const slug = `${slugify(p.title)}-${code6}`;

    const promo = p.promoPrice != null ? Number(p.promoPrice) : null;
    const is_offer = promo != null && promo < p.price;
    const off_percent = is_offer ? Math.round((1 - promo / p.price) * 100) : 0;

    const categoryId = await adminUpsertCategoryFromBreadcrumb(p.categoryPath, p.categoryName);

    const inserted = await postgrestPost<any[]>(
      "products",
      {
        code6,
        slug,
        title: p.title,
        description: p.description ?? "",
        description_detail: p.descriptionDetail ?? "",
        images: p.images ?? [],
        category_id: categoryId,
        price: p.price,
        promo_price: promo,
        is_offer,
        off_percent,
        rating: p.rating ?? null,
        reviews_count: p.reviewsCount ?? null,
        affiliate_code: p.affiliateCode,
        affiliate_url: p.affiliateUrl,
        source_url: p.sourceUrl,
        last_seen_at: new Date().toISOString(),
      },
      "service",
      { select: "code6,slug", returning: true },
    );

    const row = Array.isArray(inserted) ? inserted[0] : null;
    if (!row) {
      return withCors(NextResponse.json({ ok: false, error: "Falha ao salvar produto." }, { status: 500 }));
    }

    const productUrl = `/produto/${row.code6}/${row.slug}`;
    return withCors(NextResponse.json({ ok: true, code6: row.code6, productUrl }));
  } catch (e) {
    console.error("[import/mercadolivre]", e);
    return withCors(
      NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "Erro interno ao importar." },
        { status: 500 },
      ),
    );
  }
}

