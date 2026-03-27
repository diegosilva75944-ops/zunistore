import "server-only";

import { CRON_ML_REIMPORT_CURSOR_COLORS_KEY } from "@/lib/site-settings-internal";
import { moveProductToDeletedHistoryAndDelete, recordProductPriceChange } from "@/lib/admin/db";
import { fetchPricesFromUrl } from "@/lib/ml-price";
import { postgrestGet, postgrestPatch, postgrestPost } from "@/lib/postgrest/server";
import { mlSyncImportedProduct } from "@/services/mercadolivre/sync";

export type CronMlFullReimportResult =
  | {
      ok: true;
      skipped: true;
      reason: "no_ml_products";
    }
  | {
      ok: true;
      skipped: false;
      product_id: string;
      code6: string;
      reimported: boolean;
      deleted: boolean;
      listing_gone: boolean;
    }
  | {
      ok: false;
      skipped: false;
      product_id?: string;
      code6?: string;
      error: string;
    };

function parseCursorFromColors(colors: unknown): string | null {
  if (!colors || typeof colors !== "object") return null;
  const raw = (colors as Record<string, unknown>)[CRON_ML_REIMPORT_CURSOR_COLORS_KEY];
  if (typeof raw !== "string" || !raw.trim()) return null;
  return raw.trim();
}

async function getSiteSettingsRow(): Promise<{ id: string; cron_ml_reimport_cursor_code6: string | null } | null> {
  const rows = await postgrestGet<any[]>("site_settings", {
    select: "id,colors",
    limit: "1",
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.id) return null;
  return {
    id: String(row.id),
    cron_ml_reimport_cursor_code6: parseCursorFromColors(row.colors),
  };
}

async function ensureSiteSettingsRow(): Promise<{ id: string; cron_ml_reimport_cursor_code6: string | null }> {
  let row = await getSiteSettingsRow();
  if (!row) {
    await postgrestPost("site_settings", { colors: {} });
    row = await getSiteSettingsRow();
  }
  if (!row) {
    throw new Error("Não foi possível criar ou ler site_settings.");
  }
  return row;
}

async function setCronCursor(code6: string | null): Promise<void> {
  const rows = await postgrestGet<any[]>("site_settings", {
    select: "id,colors",
    limit: "1",
  });
  const data = Array.isArray(rows) ? rows[0] : null;
  const prev =
    data?.colors && typeof data.colors === "object" && data.colors !== null ?
      { ...(data.colors as Record<string, unknown>) }
    : {};

  if (code6 == null || code6 === "") {
    delete prev[CRON_ML_REIMPORT_CURSOR_COLORS_KEY];
  } else {
    prev[CRON_ML_REIMPORT_CURSOR_COLORS_KEY] = code6;
  }

  if (!data?.id) {
    await postgrestPost("site_settings", { colors: prev });
    return;
  }
  await postgrestPatch("site_settings", { colors: prev }, { id: `eq.${data.id}` });
}

/**
 * Próximo produto com vínculo ML, em ordem decrescente de code6.
 * Com `cursorCode6`, retorna o maior code6 estritamente menor (rodízio); se não houver, faz wrap e volta ao maior.
 */
export async function pickNextMlProductDescCode6(cursorCode6: string | null): Promise<{
  id: string;
  code6: string;
} | null> {
  const base: Record<string, string> = {
    select: "id,code6,product_external_listings!inner(origin)",
    "product_external_listings.origin": "eq.mercadolivre",
    order: "code6.desc",
    limit: "1",
  };

  const tryQuery = async (cursor: string | null) => {
    const params: Record<string, string> = { ...base };
    if (cursor) {
      params.code6 = `lt.${encodeURIComponent(cursor)}`;
    }
    const rows = await postgrestGet<any[]>("products", params);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (row?.id && row?.code6) {
      return { id: String(row.id), code6: String(row.code6) };
    }
    return null;
  };

  let next = await tryQuery(cursorCode6);
  if (!next && cursorCode6) {
    next = await tryQuery(null);
  }
  return next;
}

/**
 * Uma execução do cron: reimporta um único produto ML (mesmo fluxo da aba Teste ML → `mlImportOrUpdateProduct`),
 * preservando id/code6, substituindo imagens pelo array importado.
 */
export async function runCronMlFullReimportOne(): Promise<CronMlFullReimportResult> {
  let settings: { id: string; cron_ml_reimport_cursor_code6: string | null };
  try {
    settings = await ensureSiteSettingsRow();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, skipped: false, error: msg };
  }

  const cursor = settings.cron_ml_reimport_cursor_code6;
  const pick = await pickNextMlProductDescCode6(cursor);
  if (!pick) {
    return { ok: true, skipped: true, reason: "no_ml_products" };
  }

  const productId = pick.id;
  const code6 = pick.code6;

  const prodRows = await postgrestGet<any[]>("products", {
    select: "id,price,promo_price,source_url,affiliate_url",
    id: `eq.${productId}`,
    limit: "1",
  });
  const prod = Array.isArray(prodRows) ? prodRows[0] : null;
  if (!prod) {
    await setCronCursor(code6);
    return { ok: false, skipped: false, product_id: productId, code6, error: "Produto não encontrado após seleção." };
  }

  const sourceUrl = prod.source_url as string | null | undefined;
  const affiliateUrl = prod.affiliate_url as string | null | undefined;
  const priceUrl =
    typeof affiliateUrl === "string" && affiliateUrl.trim().startsWith("http") ?
      { sourceUrl, affiliateUrl }
    : typeof sourceUrl === "string" && sourceUrl.trim().startsWith("http") ?
      { sourceUrl, affiliateUrl }
    : null;

  if (!priceUrl) {
    return {
      ok: false,
      skipped: false,
      product_id: productId,
      code6,
      error: "Produto sem source_url/affiliate_url válidos para checagem do anúncio.",
    };
  }

  const oldPrice = Number(prod.price) || 0;
  const oldPromo = prod.promo_price != null ? Number(prod.promo_price) : null;

  /** Só usa a checagem leve para anúncio removido; demais casos seguem para o mesmo pipeline da aba Teste ML. */
  const quick = await fetchPricesFromUrl(priceUrl);
  if (quick.kind === "listing_gone") {
    try {
      await moveProductToDeletedHistoryAndDelete(productId, "sync_not_found");
    } catch (e) {
      return {
        ok: false,
        skipped: false,
        product_id: productId,
        code6,
        error: e instanceof Error ? e.message : "Falha ao arquivar produto removido.",
      };
    }
    await setCronCursor(null);
    return {
      ok: true,
      skipped: false,
      product_id: productId,
      code6,
      reimported: false,
      deleted: true,
      listing_gone: true,
    };
  }

  try {
    await mlSyncImportedProduct(productId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, skipped: false, product_id: productId, code6, error: msg };
  }

  const afterRows = await postgrestGet<any[]>("products", {
    select: "price,promo_price",
    id: `eq.${productId}`,
    limit: "1",
  });
  const after = Array.isArray(afterRows) ? afterRows[0] : null;
  if (after) {
    try {
      await recordProductPriceChange({
        productId,
        oldPrice,
        newPrice: Number(after.price) || 0,
        oldPromoPrice: oldPromo,
        newPromoPrice: after.promo_price != null ? Number(after.promo_price) : null,
        source: "sync_batch",
      });
    } catch (e) {
      console.error("[cron-ml-reimport] recordProductPriceChange", e);
    }
  }

  await setCronCursor(code6);

  return {
    ok: true,
    skipped: false,
    product_id: productId,
    code6,
    reimported: true,
    deleted: false,
    listing_gone: false,
  };
}
