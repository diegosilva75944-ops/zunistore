import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/slug";

export const runtime = "nodejs";

const schema = z.object({
  title: z.string().min(1),
  description: z.string().optional().default(""),
  images: z.array(z.string().url()).optional().default([]),
  category_id: z.string().uuid(),
  price: z.coerce.number().positive(),
  promo_price: z.coerce.number().nullable().optional(),
  affiliate_url: z.string().url(),
  source_url: z.string().url(),
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
    return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
  }

  const supabase = getSupabaseServiceRoleClient();

  const price = parsed.data.price;
  const promo = parsed.data.promo_price != null ? Number(parsed.data.promo_price) : null;
  const is_offer = promo != null && promo < price;
  const off_percent = is_offer ? Math.round((1 - promo / price) * 100) : 0;

  const { data: current } = await supabase
    .from("products")
    .select("code6")
    .eq("id", id)
    .maybeSingle();
  const code6 = (current as any)?.code6 as string | undefined;

  const slug = code6 ? `${slugify(parsed.data.title)}-${code6}` : slugify(parsed.data.title);

  await supabase
    .from("products")
    .update({
      title: parsed.data.title,
      description: parsed.data.description ?? "",
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
    })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}

