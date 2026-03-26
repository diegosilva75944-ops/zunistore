import { NextResponse } from "next/server";
import { z } from "zod";
import { mlSearchAuth, mapMlApiError } from "@/services/mercadolivre/auth-api";
import { normalizeSearchListing } from "@/services/mercadolivre/search";

export const runtime = "nodejs";

const schema = z.object({
  kind: z.enum(["term", "seller_id", "nickname"]),
  term: z.string().optional(),
  sellerId: z.union([z.string(), z.number()]).optional(),
  nickname: z.string().optional(),
  limit: z.coerce.number().int().optional(),
  offset: z.coerce.number().int().optional(),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = schema.safeParse({
    kind: searchParams.get("kind"),
    term: searchParams.get("term") ?? undefined,
    sellerId: searchParams.get("sellerId") ?? undefined,
    nickname: searchParams.get("nickname") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    offset: searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Parâmetros inválidos." }, { status: 400 });
  }

  try {
    const { kind, limit, offset } = parsed.data;
    // Usa API autenticada (oficial). Mantemos o normalizador de itens do search existente.
    const q: Record<string, string | number> = {
      limit: limit ?? 20,
      offset: offset ?? 0,
    };
    if (kind === "term") q.q = parsed.data.term ?? "";
    if (kind === "seller_id") q.seller_id = String(parsed.data.sellerId ?? "");
    if (kind === "nickname") q.nickname = parsed.data.nickname ?? "";

    const raw = await mlSearchAuth({ siteId: "MLB", query: q });
    const items = (Array.isArray(raw.results) ? raw.results : [])
      .map(normalizeSearchListing)
      .filter(Boolean);

    return NextResponse.json({ success: true, total: raw.total, offset: raw.offset, limit: raw.limit, items });
  } catch (e) {
    const err = mapMlApiError(e);
    const status = (err.externalStatus && [401, 403, 429].includes(err.externalStatus)) ? err.externalStatus : 502;
    return NextResponse.json(err, { status });
  }
}

