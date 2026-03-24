import { NextResponse } from "next/server";
import { z } from "zod";
import { adminListCarousel, adminSetCarousel } from "@/lib/admin/db";

export const runtime = "nodejs";

export async function GET() {
  const items = await adminListCarousel();
  const simple = items.map((x) => ({
    id: x.id,
    product_id: x.product_id,
    sort_order: x.sort_order,
    size: x.size,
  }));
  return NextResponse.json({ ok: true, items: simple });
}

const schema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        sort_order: z.number().int(),
        size: z.enum(["S", "M", "G"]),
      }),
    )
    .max(30),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
  }
  await adminSetCarousel(parsed.data.items);
  return NextResponse.json({ ok: true });
}

