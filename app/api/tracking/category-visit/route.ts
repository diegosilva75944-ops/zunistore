import { NextResponse } from "next/server";
import { z } from "zod";
import { persistCategoryVisit } from "@/services/personalization/write-events";

export const runtime = "nodejs";

const schema = z.object({
  sessionId: z.string().uuid(),
  categoryId: z.string().uuid(),
  userId: z.string().uuid().optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
    }
    await persistCategoryVisit({
      sessionId: parsed.data.sessionId,
      userId: parsed.data.userId ?? null,
      categoryId: parsed.data.categoryId,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[tracking/category-visit]", e);
    return NextResponse.json({ ok: false, error: "Falha ao registrar." }, { status: 500 });
  }
}
