import { NextResponse } from "next/server";
import { z } from "zod";
import { mlFetchListingByItemId, mlFetchListingByUrl } from "@/services/mercadolivre/importer";
import { mlImportOrUpdateProduct } from "@/services/mercadolivre/persist";
import { MercadoLivreError } from "@/services/mercadolivre/errors";

export const runtime = "nodejs";

const schema = z.object({
  url: z.string().url().optional(),
  itemId: z.string().optional(),
  updateIfExists: z.boolean().optional().default(false),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
  }

  try {
    const { url, itemId, updateIfExists } = parsed.data;
    const fetched = url
      ? await mlFetchListingByUrl(url)
      : itemId
        ? await mlFetchListingByItemId(itemId)
        : null;

    if (!fetched) {
      return NextResponse.json({ ok: false, error: "Informe url ou itemId." }, { status: 400 });
    }

    const result = await mlImportOrUpdateProduct({
      normalized: fetched.normalized,
      updateIfExists,
    });

    return NextResponse.json({
      ...result,
      productUrl: `/produto/${result.code6}/${result.slug}`,
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
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro ao importar." },
      { status: 500 },
    );
  }
}

