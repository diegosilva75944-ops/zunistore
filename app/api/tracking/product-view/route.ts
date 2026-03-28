import { NextResponse } from "next/server";
import { z } from "zod";
import { persistProductView } from "@/services/personalization/write-events";

export const runtime = "nodejs";

const schema = z.object({
  sessionId: z.string().uuid(),
  productId: z.string().uuid(),
  categoryId: z.string().uuid().nullable().optional(),
  userId: z.string().uuid().optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
    }
    await persistProductView({
      sessionId: parsed.data.sessionId,
      userId: parsed.data.userId ?? null,
      productId: parsed.data.productId,
      categoryId: parsed.data.categoryId ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[tracking/product-view]", e);
    return NextResponse.json({ ok: false, error: "Falha ao registrar." }, { status: 500 });
  }
}
