import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
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

  const supabase = getSupabaseServiceRoleClient();
  const tokenHash = sha256Hex(rawToken);

  const { data: tokenRow } = await supabase
    .from("admin_tokens")
    .select("id, active")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!tokenRow || !(tokenRow as any).active) {
    return withCors(NextResponse.json({ ok: false, error: "Token inválido ou revogado." }, { status: 401 }));
  }

  await supabase
    .from("admin_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", (tokenRow as any).id);

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return withCors(NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 }));
  }

  const p = parsed.data;

  // Gera code6 sequencial (RPC)
  const { data: code6 } = await supabase.rpc("next_product_code6");
  if (typeof code6 !== "string" || code6.length !== 6) {
    return withCors(NextResponse.json({ ok: false, error: "Falha ao gerar code6." }, { status: 500 }));
  }

  const slug = `${slugify(p.title)}-${code6}`;

  const promo = p.promoPrice != null ? Number(p.promoPrice) : null;
  const is_offer = promo != null && promo < p.price;
  const off_percent = is_offer ? Math.round((1 - promo / p.price) * 100) : 0;

  const categoryId = await upsertCategoryFromBreadcrumb(supabase, p.categoryPath, p.categoryName);

  const { data: inserted, error } = await supabase
    .from("products")
    .insert({
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
    })
    .select("code6, slug")
    .maybeSingle();

  if (error || !inserted) {
    return withCors(NextResponse.json({ ok: false, error: "Falha ao salvar produto." }, { status: 500 }));
  }

  const productUrl = `/produto/${inserted.code6}/${inserted.slug}`;
  return withCors(NextResponse.json({ ok: true, code6: inserted.code6, productUrl }));
}

async function upsertCategoryFromBreadcrumb(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  categoryPath: string[],
  categoryName: string,
) {
  const { data: seeds } = await supabase
    .from("categories")
    .select("id, name, slug")
    .eq("is_seed", true)
    .is("parent_id", null);

  const seedList = (seeds ?? []) as any[];
  const path = (categoryPath ?? []).map((s) => String(s || "").trim()).filter(Boolean);
  const last = String(categoryName || path[path.length - 1] || "").trim();

  const chosenSeed = pickClosestSeed(seedList, path.concat(last));
  const seedId = chosenSeed?.id ?? seedList[0]?.id;

  if (!last) return seedId;

  // Se o último item casar com o seed, usa o seed; senão cria subcategoria
  const sameAsSeed = chosenSeed && normalize(last) === normalize(chosenSeed.name);
  if (sameAsSeed) return seedId;

  const subSlug = slugify(last);
  const { data: existing } = await supabase
    .from("categories")
    .select("id")
    .eq("slug", subSlug)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: created } = await supabase
    .from("categories")
    .insert({ name: last, slug: subSlug, parent_id: seedId, is_seed: false })
    .select("id")
    .maybeSingle();

  return (created?.id as string) ?? seedId;
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
      best = s as any;
    }
  }
  return bestScore >= 1 ? (best as any) : (seeds[0] as any);
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

