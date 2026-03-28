import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonRecommendations, RECOMMENDATIONS_CACHE_HEADERS } from "@/lib/personalization/recommendation-http";
import { attachNewVisitSessionIfNeeded, resolveVisitSession } from "@/lib/personalization/visit-session-server";
import { recommendSearchBasedForSession } from "@/services/personalization/recommend";

export const runtime = "nodejs";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(24).optional(),
  excludeIds: z
    .string()
    .optional()
    .transform((s) =>
      s
        ? [...new Set(s.split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 40)
        : [],
    )
    .pipe(z.array(z.string().uuid())),
});

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const parsed = querySchema.safeParse({
      limit: url.searchParams.get("limit") ?? undefined,
      excludeIds: url.searchParams.get("excludeIds") ?? undefined,
    });
    if (!parsed.success) {
      return jsonRecommendations(req, { ok: false, error: "Parâmetros inválidos." }, 400);
    }
    const { sessionId, wasNew } = resolveVisitSession(req);
    const { limit, excludeIds } = parsed.data;
    const items = await recommendSearchBasedForSession(sessionId, {
      excludeIds,
      limit: limit ?? 12,
    });
    const res = NextResponse.json(
      { ok: true, items },
      { status: 200, headers: RECOMMENDATIONS_CACHE_HEADERS },
    );
    attachNewVisitSessionIfNeeded(res, sessionId, wasNew);
    return res;
  } catch (e) {
    console.error("[recommendations/search-based]", e);
    return jsonRecommendations(req, { ok: false, error: "Falha ao carregar." }, 500);
  }
}
