import "server-only";

import { moveProductToDeletedHistoryAndDelete, recordProductPriceChange } from "@/lib/admin/db";
import { fetchPricesFromUrl } from "@/lib/ml-price";
import { postgrestGet } from "@/lib/postgrest/server";
import { runDedupeProductsByDuplicateTitle } from "@/services/products/dedupe-by-title";
import { mlSyncImportedProduct } from "@/services/mercadolivre/sync";

const BATCH_PAGE = 500;
/** Pausa entre produtos para reduzir bloqueio / carga no ML. */
const DELAY_MS_BETWEEN_PRODUCTS = 400;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type CronMlBatchFailure = { product_id: string; code6: string; error: string };

export type CronMlProgressOutcome = "reimported" | "deleted" | "failed" | "skipped_no_url";

export type CronMlProgressEvent =
  | { phase: "start"; total: number }
  | {
      phase: "product";
      index: number;
      total: number;
      product_id: string;
      code6: string;
      outcome: CronMlProgressOutcome;
      error?: string;
    }
  | { phase: "dedupe" };

export type CronMlFullReimportBatchResult =
  | {
      ok: true;
      skipped: true;
      reason: "no_ml_products";
      total: number;
      reimported: number;
      deleted: number;
      failed: number;
      skipped_no_url: number;
      failures: CronMlBatchFailure[];
      dedupe_removed?: number;
      dedupe_errors?: string[];
    }
  | {
      ok: true;
      skipped: false;
      total: number;
      reimported: number;
      deleted: number;
      failed: number;
      skipped_no_url: number;
      failures: CronMlBatchFailure[];
      dedupe_removed: number;
      dedupe_errors: string[];
    }
  | {
      ok: false;
      error: string;
      total?: number;
      reimported?: number;
      deleted?: number;
      failed?: number;
      failures?: CronMlBatchFailure[];
    };

/** Todos os produtos com vínculo ML, maior code6 primeiro. */
export async function listAllMlProductsDescCode6(): Promise<{ id: string; code6: string }[]> {
  const out: { id: string; code6: string }[] = [];
  for (let offset = 0; ; offset += BATCH_PAGE) {
    const rows = await postgrestGet<any[]>("products", {
      select: "id,code6,product_external_listings!inner(origin)",
      "product_external_listings.origin": "eq.mercadolivre",
      order: "code6.desc",
      limit: String(BATCH_PAGE),
      offset: String(offset),
    });
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) break;
    for (const r of list) {
      if (r?.id && r?.code6) out.push({ id: String(r.id), code6: String(r.code6) });
    }
    if (list.length < BATCH_PAGE) break;
  }
  return out;
}

async function processOneMlProduct(
  productId: string,
  code6: string,
): Promise<
  | { kind: "reimported" }
  | { kind: "deleted" }
  | { kind: "failed"; error: string }
  | { kind: "skip_no_urls" }
> {
  const prodRows = await postgrestGet<any[]>("products", {
    select: "id,price,promo_price,source_url,affiliate_url",
    id: `eq.${productId}`,
    limit: "1",
  });
  const prod = Array.isArray(prodRows) ? prodRows[0] : null;
  if (!prod) {
    return { kind: "failed", error: "Produto não encontrado." };
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
    return { kind: "skip_no_urls" };
  }

  const oldPrice = Number(prod.price) || 0;
  const oldPromo = prod.promo_price != null ? Number(prod.promo_price) : null;

  const quick = await fetchPricesFromUrl(priceUrl);
  if (quick.kind === "listing_gone") {
    try {
      await moveProductToDeletedHistoryAndDelete(productId, "sync_not_found");
    } catch (e) {
      return { kind: "failed", error: e instanceof Error ? e.message : "Falha ao arquivar produto removido." };
    }
    return { kind: "deleted" };
  }

  try {
    await mlSyncImportedProduct(productId);
  } catch (e) {
    return { kind: "failed", error: e instanceof Error ? e.message : String(e) };
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

  return { kind: "reimported" };
}

/**
 * Uma execução do cron / botão “sincronizar todos”: reimporta **todos** os produtos ML,
 * **um por um**, em ordem **decrescente** de `code6` (mesmo fluxo da aba Teste ML).
 */
export async function runCronMlFullReimportAll(options?: {
  onProgress?: (evt: CronMlProgressEvent) => void | Promise<void>;
}): Promise<CronMlFullReimportBatchResult> {
  let all: { id: string; code6: string }[];
  try {
    all = await listAllMlProductsDescCode6();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  if (!all.length) {
    return {
      ok: true,
      skipped: true,
      reason: "no_ml_products",
      total: 0,
      reimported: 0,
      deleted: 0,
      failed: 0,
      skipped_no_url: 0,
      failures: [],
      dedupe_removed: 0,
      dedupe_errors: [],
    };
  }

  let reimported = 0;
  let deleted = 0;
  let failed = 0;
  let skipped_no_url = 0;
  const failures: CronMlBatchFailure[] = [];

  await options?.onProgress?.({ phase: "start", total: all.length });

  for (let i = 0; i < all.length; i++) {
    const { id, code6 } = all[i];
    const result = await processOneMlProduct(id, code6);
    let outcome: CronMlProgressOutcome;
    if (result.kind === "reimported") {
      reimported += 1;
      outcome = "reimported";
    } else if (result.kind === "deleted") {
      deleted += 1;
      outcome = "deleted";
    } else if (result.kind === "failed") {
      failed += 1;
      failures.push({ product_id: id, code6, error: result.error });
      outcome = "failed";
    } else {
      skipped_no_url += 1;
      outcome = "skipped_no_url";
    }
    await options?.onProgress?.({
      phase: "product",
      index: i + 1,
      total: all.length,
      product_id: id,
      code6,
      outcome,
      error: result.kind === "failed" ? result.error : undefined,
    });
    if (i < all.length - 1 && DELAY_MS_BETWEEN_PRODUCTS > 0) {
      await sleep(DELAY_MS_BETWEEN_PRODUCTS);
    }
  }

  await options?.onProgress?.({ phase: "dedupe" });

  let dedupe_removed = 0;
  const dedupe_errors: string[] = [];
  try {
    const d = await runDedupeProductsByDuplicateTitle();
    dedupe_removed = d.removed;
    dedupe_errors.push(...d.errors);
  } catch (e) {
    dedupe_errors.push(e instanceof Error ? e.message : String(e));
  }

  return {
    ok: true,
    skipped: false,
    total: all.length,
    reimported,
    deleted,
    failed,
    skipped_no_url,
    failures,
    dedupe_removed,
    dedupe_errors,
  };
}
