import { NextResponse } from "next/server";
import { z } from "zod";
import { mlSearchListings } from "@/services/mercadolivre/search";
import { MercadoLivreError } from "@/services/mercadolivre/errors";

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
    return NextResponse.json({ ok: false, error: "Parâmetros inválidos." }, { status: 400 });
  }

  try {
    const { kind, limit, offset } = parsed.data;
    const res =
      kind === "term"
        ? await mlSearchListings({ kind: "term", term: parsed.data.term ?? "", limit, offset })
        : kind === "seller_id"
          ? await mlSearchListings({ kind: "seller_id", sellerId: parsed.data.sellerId ?? "", limit, offset })
          : await mlSearchListings({ kind: "nickname", nickname: parsed.data.nickname ?? "", limit, offset });

    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    if (e instanceof MercadoLivreError) {
      const status =
        e.code === "rate_limited" ? 429 : e.code === "timeout" || e.code === "network" ? 503 : 502;
      return NextResponse.json({ ok: false, error: e.message, code: e.code }, { status });
    }
    console.error(e);
    return NextResponse.json({ ok: false, error: "Erro ao pesquisar anúncios." }, { status: 500 });
  }
}

