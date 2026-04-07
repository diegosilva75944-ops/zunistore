import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin/auth";
import { postgrestPatch } from "@/lib/postgrest/server";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    code6: z.string().min(1).optional(),
    slug: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    description_detail: z.string().optional(),
    images: z.array(z.string()).optional(),
    category_id: z.string().uuid().optional(),
    price: z.coerce.number().nonnegative().optional(),
    promo_price: z.coerce.number().nonnegative().nullable().optional(),
    is_offer: z.boolean().optional(),
    off_percent: z.coerce.number().int().min(0).max(100).optional(),
    rating: z.coerce.number().nullable().optional(),
    reviews_count: z.coerce.number().int().nullable().optional(),
    affiliate_code: z.string().optional(),
    affiliate_url: z.string().optional(),
    source_url: z.string().optional(),
    needs_update: z.boolean().optional(),
    affiliate_valid: z.boolean().nullable().optional(),
    affiliate_valid_checked_at: z.string().nullable().optional(),
    is_active: z.boolean().optional(),
    last_seen_at: z.string().nullable().optional(),
  })
  .strict();

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Payload inválido.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ ok: false, error: "Nenhum campo para atualizar." }, { status: 400 });
  }

  let patch: Record<string, unknown> = { ...body };

  if (typeof body.price === "number" && "promo_price" in body) {
    const price = body.price;
    const promo = body.promo_price;
    const is_offer = promo != null && promo < price;
    patch = {
      ...patch,
      is_offer,
      off_percent: is_offer && price > 0 ? Math.round((1 - (promo as number) / price) * 100) : 0,
    };
  }

  try {
    await postgrestPatch("products", patch, { id: `eq.${id}` });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
