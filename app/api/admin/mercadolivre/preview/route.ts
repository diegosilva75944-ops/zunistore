import { NextResponse } from "next/server";
import { z } from "zod";
import { mlFetchListingByItemIdAuth, mlFetchListingByUrlAuth } from "@/services/mercadolivre/auth-importer";
import { mlGetCategoryAuth, mapMlApiError } from "@/services/mercadolivre/auth-api";
import { getAdminSession } from "@/lib/admin/auth";
import { extractMlItemIdFromUrl } from "@/services/mercadolivre/parser";

export const runtime = "nodejs";

const schema = z.object({
  url: z.string().url().optional(),
  itemId: z.string().optional(),
});

export async function POST(req: Request) {
  const debug = process.env.NODE_ENV !== "production";
  console.log("[ml-preview] enter");
  const session = await getAdminSession();
  console.log("[ml-preview] admin_session", { authenticated: Boolean(session), adminId: session?.id ?? null });
  if (!session) {
    console.warn("[ml-preview] blocked:unauthenticated");
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  if (debug) console.log("[ml-preview] payload", json);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    console.warn("[ml-preview] payload_invalid");
    return NextResponse.json({ success: false, error: "Payload inválido." }, { status: 400 });
  }

  try {
    const { url, itemId } = parsed.data;
    let extractedItemId: string | null = null;
    if (url) {
      try {
        extractedItemId = extractMlItemIdFromUrl(url);
      } catch {
        extractedItemId = null;
      }
    }
    console.log("[ml-preview] request_parsed", {
      hasUrl: Boolean(url),
      itemId: itemId ?? null,
      extractedItemId,
    });

    const fetched = url
      ? await mlFetchListingByUrlAuth(url)
      : itemId
        ? await mlFetchListingByItemIdAuth(itemId)
        : null;

    if (!fetched) {
      console.warn("[ml-preview] missing_input");
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

    const responseBody = {
      success: true,
      itemId: fetched.itemId,
      listing: fetched.normalized,
      category,
    };
    console.log("[ml-preview] success", { status: 200, itemId: fetched.itemId });
    return NextResponse.json(responseBody);
  } catch (e) {
    const err = mapMlApiError(e);
    const status = err.externalStatus ?? 502;
    if (status === 403) {
      const body = {
        success: false as const,
        error: "Mercado Livre recusou a consulta do anúncio",
        externalStatus: 403,
      };
      console.warn("[ml-preview] forbidden_from_source", {
        source: "mercadolivre_or_backend",
        status,
        mappedError: err.error,
      });
      return NextResponse.json(body, { status: 403 });
    }
    console.warn("[ml-preview] failure", { status, error: err.error, externalStatus: err.externalStatus ?? null });
    return NextResponse.json(err, { status });
  }
}

