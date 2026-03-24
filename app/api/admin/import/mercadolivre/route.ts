import { NextResponse } from "next/server";
import { z } from "zod";
import { postgrestGet, postgrestPost, postgrestPatch, postgrestRpc } from "@/lib/postgrest/server";
import { sha256Hex } from "@/lib/crypto";
import { slugify } from "@/lib/slug";

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

  const categoryId = await upsertCategoryFromBreadcrumb(p.categoryPath, p.categoryName);

  const inserted = await postgrestPost<any[]>(
    "products",
    {
      code6,
      slug,
      title: p.title,
      description: p.description ?? "",
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
}

async function upsertCategoryFromBreadcrumb(categoryPath: string[], categoryName: string): Promise<string | undefined> {
  const seeds = await postgrestGet<any[]>("categories", {
    select: "id,name,slug",
    is_seed: "eq.true",
    parent_id: "is.null",
  });
  const seedList = Array.isArray(seeds) ? seeds : [];
  const path = (categoryPath ?? []).map((s) => String(s || "").trim()).filter(Boolean);
  const last = String(categoryName || path[path.length - 1] || "").trim();

  const chosenSeed = pickClosestSeed(seedList, path.concat(last));
  const seedId = chosenSeed?.id ?? seedList[0]?.id;

  if (!last) return seedId;

  const sameAsSeed = chosenSeed && normalize(last) === normalize(chosenSeed.name);
  if (sameAsSeed) return seedId;

  const subSlug = slugify(last);
  const existing = await postgrestGet<any[]>("categories", {
    select: "id",
    slug: `eq.${encodeURIComponent(subSlug)}`,
    limit: "1",
  });
  if (Array.isArray(existing) && existing[0]?.id) return existing[0].id;

  const created = await postgrestPost<any[]>(
    "categories",
    { name: last, slug: subSlug, parent_id: seedId, is_seed: false },
    "service",
    { select: "id", returning: true },
  );
  const createdRow = Array.isArray(created) ? created[0] : null;
  return createdRow?.id ?? seedId;
}

function pickClosestSeed(seeds: { id: string; name: string }[], crumbs: string[]) {
  if (!seeds.length) return null;
  const hay = normalize(crumbs.join(" "));
  const hayTokens = new Set(hay.split(/\s+/).filter(Boolean));

  let best = seeds[0];
  let bestScore = -1;
  for (const s of seeds) {
    const needle = normalize(s.name);
    const tokens = needle.split(/\s+/).filter(Boolean);
    let score = 0;
    for (const t of tokens) if (hayTokens.has(t)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return bestScore >= 1 ? best : seeds[0];
}

function normalize(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
