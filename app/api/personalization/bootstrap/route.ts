import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { attachNewVisitSessionIfNeeded, resolveVisitSession } from "@/lib/personalization/visit-session-server";

export const runtime = "nodejs";

/** Garante cookie de visita antes de vários fetches em paralelo (evita 4 UUIDs diferentes). */
export async function GET(req: NextRequest) {
  const { sessionId, wasNew } = resolveVisitSession(req);
  const res = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "private, no-store, must-revalidate" } },
  );
  attachNewVisitSessionIfNeeded(res, sessionId, wasNew);
  return res;
}
