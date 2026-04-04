import { NextResponse } from "next/server";
import { z } from "zod";
import { postgrestGet, postgrestPatch } from "@/lib/postgrest/server";
import { slugify } from "@/lib/slug";

export const runtime = "nodejs";

const httpUrl = z.string().trim().refine((s) => {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}, "Informe uma URL http(s) válida.");

const schema = z.object({
  title: z.string().min(1),
  description: z.string().optional().default(""),
  description_detail: z.string().optional().default(""),
  /** ML/Supabase às vezes enviam query longa; `z.url()` falha em edge cases. */
  images: z.array(z.string().trim().min(1)).optional().default([]),
  category_id: z.string().uuid(),
  price: z.coerce.number().positive(),
  promo_price: z.coerce.number().nullable().optional(),
  affiliate_url: httpUrl,
  source_url: httpUrl,
  rating: z.coerce.number().nullable().optional(),
  reviews_count: z.coerce.number().int().nullable().optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Payload inválido.",
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const price = parsed.data.price;
  const promo = parsed.data.promo_price != null ? Number(parsed.data.promo_price) : null;
  const is_offer = promo != null && promo < price;
  const off_percent = is_offer ? Math.round((1 - promo / price) * 100) : 0;

  const rows = await postgrestGet<any[]>("products", { select: "code6", id: `eq.${id}`, limit: "1" });
  const code6 = Array.isArray(rows) && rows[0] ? rows[0].code6 : undefined;
  const slug = code6 ? `${slugify(parsed.data.title)}-${code6}` : slugify(parsed.data.title);

  await postgrestPatch("products", {
    title: parsed.data.title,
    description: parsed.data.description ?? "",
    description_detail: parsed.data.description_detail ?? "",
    images: parsed.data.images ?? [],
    category_id: parsed.data.category_id,
    price,
    promo_price: promo,
    is_offer,
    off_percent,
    affiliate_url: parsed.data.affiliate_url,
    source_url: parsed.data.source_url,
    rating: parsed.data.rating ?? null,
    reviews_count: parsed.data.reviews_count ?? null,
    slug,
  }, { id: `eq.${id}` });

  return NextResponse.json({ ok: true });
}

