import "server-only";

import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  UUID_RE,
  visitSessionCookieOpts,
  ZUNI_VISIT_SESSION_COOKIE,
} from "@/lib/personalization/visit-session";

export function resolveVisitSession(req: NextRequest): { sessionId: string; wasNew: boolean } {
  const cur = req.cookies.get(ZUNI_VISIT_SESSION_COOKIE)?.value;
  if (cur && UUID_RE.test(cur)) return { sessionId: cur, wasNew: false };
  return { sessionId: randomUUID(), wasNew: true };
}

export function attachNewVisitSessionIfNeeded(
  res: NextResponse,
  sessionId: string,
  wasNew: boolean,
) {
  if (!wasNew) return;
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(ZUNI_VISIT_SESSION_COOKIE, sessionId, visitSessionCookieOpts(secure));
}
