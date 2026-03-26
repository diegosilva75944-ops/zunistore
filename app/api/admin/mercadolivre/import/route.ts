import { NextResponse } from "next/server";
import { z } from "zod";
import { mlFetchListingByItemIdAuth, mlFetchListingByUrlAuth } from "@/services/mercadolivre/auth-importer";
import { mlImportOrUpdateProduct } from "@/services/mercadolivre/persist";
import { mapMlApiError } from "@/services/mercadolivre/auth-api";

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
    return NextResponse.json({ success: false, error: "Payload inválido." }, { status: 400 });
  }

  try {
    const { url, itemId, updateIfExists } = parsed.data;
    const fetched = url
      ? await mlFetchListingByUrlAuth(url)
      : itemId
        ? await mlFetchListingByItemIdAuth(itemId)
        : null;

    if (!fetched) {
      return NextResponse.json({ success: false, error: "Informe url ou itemId." }, { status: 400 });
    }

    const result = await mlImportOrUpdateProduct({
      normalized: fetched.normalized,
      updateIfExists,
    });

    return NextResponse.json({
      success: true,
      result,
      productUrl: `/produto/${result.code6}/${result.slug}`,
    });
  } catch (e) {
    const err = mapMlApiError(e);
    const status = (err.externalStatus && [401, 403, 429].includes(err.externalStatus)) ? err.externalStatus : 502;
    return NextResponse.json(err, { status });
  }
}

