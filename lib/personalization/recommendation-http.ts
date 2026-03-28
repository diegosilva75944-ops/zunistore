import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  attachNewVisitSessionIfNeeded,
  resolveVisitSession,
} from "@/lib/personalization/visit-session-server";

/** Evita CDN/navegador servirem vitrine de outra sessão. */
export const RECOMMENDATIONS_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, must-revalidate",
} as const;

export function jsonRecommendations(req: NextRequest, body: unknown, status = 200) {
  const { sessionId, wasNew } = resolveVisitSession(req);
  const res = NextResponse.json(body, { status, headers: RECOMMENDATIONS_CACHE_HEADERS });
  attachNewVisitSessionIfNeeded(res, sessionId, wasNew);
  return res;
}
