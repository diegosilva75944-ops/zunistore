import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { attachNewVisitSessionIfNeeded, resolveVisitSession } from "@/lib/personalization/visit-session-server";
import { clearPersonalizationSession } from "@/services/personalization/clear-session";

export const runtime = "nodejs";

/** Limpa histórico no servidor para o cookie de visita atual (localStorage no cliente). */
export async function POST(req: NextRequest) {
  const { sessionId, wasNew } = resolveVisitSession(req);
  try {
    await clearPersonalizationSession(sessionId);
    const res = NextResponse.json({ ok: true });
    attachNewVisitSessionIfNeeded(res, sessionId, wasNew);
    return res;
  } catch (e) {
    console.error("[personalization/clear]", e);
    const res = NextResponse.json({ ok: false, error: "Falha ao limpar." }, { status: 500 });
    attachNewVisitSessionIfNeeded(res, sessionId, wasNew);
    return res;
  }
}
