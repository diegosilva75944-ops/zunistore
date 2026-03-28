import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { attachNewVisitSessionIfNeeded, resolveVisitSession } from "@/lib/personalization/visit-session-server";
import { persistCategoryVisit } from "@/services/personalization/write-events";

export const runtime = "nodejs";

const schema = z.object({
  categoryId: z.string().uuid(),
  userId: z.string().uuid().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const { sessionId, wasNew } = resolveVisitSession(req);
  try {
    const json = await req.json().catch(() => null);
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      const res = NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
      attachNewVisitSessionIfNeeded(res, sessionId, wasNew);
      return res;
    }
    await persistCategoryVisit({
      sessionId,
      userId: parsed.data.userId ?? null,
      categoryId: parsed.data.categoryId,
    });
    const res = NextResponse.json({ ok: true });
    attachNewVisitSessionIfNeeded(res, sessionId, wasNew);
    return res;
  } catch (e) {
    console.error("[tracking/category-visit]", e);
    const res = NextResponse.json({ ok: false, error: "Falha ao registrar." }, { status: 500 });
    attachNewVisitSessionIfNeeded(res, sessionId, wasNew);
    return res;
  }
}
