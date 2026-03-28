import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonRecommendations } from "@/lib/personalization/recommendation-http";
import { recommendPopularGlobal } from "@/services/personalization/recommend";

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
    const { limit, excludeIds } = parsed.data;
    const items = await recommendPopularGlobal({
      excludeIds,
      limit: limit ?? 12,
    });
    return jsonRecommendations(req, { ok: true, items });
  } catch (e) {
    console.error("[recommendations/popular]", e);
    return jsonRecommendations(req, { ok: false, error: "Falha ao carregar." }, 500);
  }
}
