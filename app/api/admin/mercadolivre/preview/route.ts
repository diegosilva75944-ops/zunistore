import { NextResponse } from "next/server";
import { z } from "zod";
import { mlFetchListingByItemIdAuth, mlFetchListingByUrlAuth } from "@/services/mercadolivre/auth-importer";
import { mlGetCategoryAuth, mapMlApiError } from "@/services/mercadolivre/auth-api";

export const runtime = "nodejs";

const schema = z.object({
  url: z.string().url().optional(),
  itemId: z.string().optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Payload inválido." }, { status: 400 });
  }

  try {
    const { url, itemId } = parsed.data;
    const fetched = url
      ? await mlFetchListingByUrlAuth(url)
      : itemId
        ? await mlFetchListingByItemIdAuth(itemId)
        : null;

    if (!fetched) {
      return NextResponse.json({ success: false, error: "Informe url ou itemId." }, { status: 400 });
    }

    let category: { id: string; name: string | null; path: { id: string; name: string }[] } | null = null;
    if (fetched.normalized.external_category_id) {
      try {
        const c = await mlGetCategoryAuth(fetched.normalized.external_category_id);
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
      success: true,
      itemId: fetched.itemId,
      listing: fetched.normalized,
      category,
    });
  } catch (e) {
    const err = mapMlApiError(e);
    const status = err.externalStatus ?? 502;
    return NextResponse.json(err, { status });
  }
}

