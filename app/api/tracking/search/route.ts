import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeSearchTermServer } from "@/services/personalization/normalize-term";
import { persistSearchEvent } from "@/services/personalization/write-events";

export const runtime = "nodejs";

const schema = z.object({
  sessionId: z.string().uuid(),
  term: z.string().min(2).max(400),
  userId: z.string().uuid().optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
    }
    const norm = normalizeSearchTermServer(parsed.data.term);
    if (norm.length < 2) {
      return NextResponse.json({ ok: false, error: "Termo curto demais." }, { status: 400 });
    }
    await persistSearchEvent({
      sessionId: parsed.data.sessionId,
      userId: parsed.data.userId ?? null,
      term: parsed.data.term,
      normalizedTerm: norm,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[tracking/search]", e);
    return NextResponse.json({ ok: false, error: "Falha ao registrar." }, { status: 500 });
  }
}
