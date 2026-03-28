import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { attachNewVisitSessionIfNeeded, resolveVisitSession } from "@/lib/personalization/visit-session-server";
import { normalizeSearchTermServer } from "@/services/personalization/normalize-term";
import { persistSearchEvent } from "@/services/personalization/write-events";

export const runtime = "nodejs";

const schema = z.object({
  term: z.string().min(2).max(400),
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
    const norm = normalizeSearchTermServer(parsed.data.term);
    if (norm.length < 2) {
      const res = NextResponse.json({ ok: false, error: "Termo curto demais." }, { status: 400 });
      attachNewVisitSessionIfNeeded(res, sessionId, wasNew);
      return res;
    }
    await persistSearchEvent({
      sessionId,
      userId: parsed.data.userId ?? null,
      term: parsed.data.term,
      normalizedTerm: norm,
    });
    const res = NextResponse.json({ ok: true });
    attachNewVisitSessionIfNeeded(res, sessionId, wasNew);
    return res;
  } catch (e) {
    console.error("[tracking/search]", e);
    const res = NextResponse.json({ ok: false, error: "Falha ao registrar." }, { status: 500 });
    attachNewVisitSessionIfNeeded(res, sessionId, wasNew);
    return res;
  }
}
