import { NextResponse } from "next/server";
import { z } from "zod";
import { mlFetchListingByItemId, mlFetchListingByUrl } from "@/services/mercadolivre/importer";
import { MercadoLivreError } from "@/services/mercadolivre/errors";
import { mlGetCategoryPublic } from "@/services/mercadolivre/api";

export const runtime = "nodejs";

const schema = z.object({
  url: z.string().url().optional(),
  itemId: z.string().optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
  }

  try {
    const { url, itemId } = parsed.data;
    const fetched = url
      ? await mlFetchListingByUrl(url)
      : itemId
        ? await mlFetchListingByItemId(itemId)
        : null;

    if (!fetched) {
      return NextResponse.json({ ok: false, error: "Informe url ou itemId." }, { status: 400 });
    }

    let category: { id: string; name: string | null; path: { id: string; name: string }[] } | null = null;
    if (fetched.normalized.external_category_id) {
      try {
        const c = await mlGetCategoryPublic(fetched.normalized.external_category_id);
        category = {
          id: c.id,
          name: c.name ? String(c.name) : null,
          path: Array.isArray(c.path_from_root) ? c.path_from_root : [],
        };
      } catch {
        category = null;
      }
    }

    return NextResponse.json({
      ok: true,
      itemId: fetched.itemId,
      listing: fetched.normalized,
      category,
    });
  } catch (e) {
    if (e instanceof MercadoLivreError) {
      const status =
        e.code === "invalid_link" || e.code === "invalid_item_id"
          ? 400
          : e.code === "not_found"
            ? 404
            : e.code === "rate_limited"
              ? 429
              : e.code === "timeout" || e.code === "network"
                ? 503
                : 502;
      return NextResponse.json({ ok: false, error: e.message, code: e.code }, { status });
    }
    console.error(e);
    return NextResponse.json({ ok: false, error: "Erro ao carregar prévia." }, { status: 500 });
  }
}

