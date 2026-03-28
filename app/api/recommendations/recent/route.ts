import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonRecommendations } from "@/lib/personalization/recommendation-http";
import { recommendRecentFromIds } from "@/services/personalization/recommend";

export const runtime = "nodejs";

const querySchema = z.object({
  ids: z
    .string()
    .min(1)
    .transform((s) =>
      [...new Set(s.split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 24),
    )
    .pipe(z.array(z.string().uuid())),
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
    const idsRaw = url.searchParams.get("ids") ?? "";
    const parsed = querySchema.safeParse({
      ids: idsRaw,
      limit: url.searchParams.get("limit") ?? undefined,
      excludeIds: url.searchParams.get("excludeIds") ?? undefined,
    });
    if (!parsed.success) {
      return jsonRecommendations(req, { ok: false, error: "IDs inválidos ou ausentes." }, 400);
    }
    const { ids, limit, excludeIds } = parsed.data;
    const items = await recommendRecentFromIds(ids, {
      excludeIds,
      limit: limit ?? 12,
    });
    return jsonRecommendations(req, { ok: true, items });
  } catch (e) {
    console.error("[recommendations/recent]", e);
    return jsonRecommendations(req, { ok: false, error: "Falha ao carregar." }, 500);
  }
}
