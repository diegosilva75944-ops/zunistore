import "server-only";

import {
  adminValidateProductAffiliateLink,
  moveProductToDeletedHistoryAndDelete,
  recordProductPriceChange,
} from "@/lib/admin/db";
import { fetchPricesFromUrl } from "@/lib/ml-price";
import { postgrestGet } from "@/lib/postgrest/server";
import { runDedupeProductsByDuplicateTitle } from "@/services/products/dedupe-by-title";
import { mlSyncImportedProductPricesAndRatingsOnly } from "@/services/mercadolivre/sync";

const BATCH_PAGE = 500;
/** Um produto de cada vez no fluxo de sync ML (navegador no servidor). */
const SYNC_PARALLEL = 1;
/** Pausa entre produtos (evita martelar o ML). */
const DELAY_MS_BETWEEN_BATCHES = 400;

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
      /** Após reimport ML: resultado da validação do link de afiliado desse mesmo produto. */
      affiliate?: { valid: boolean; transient?: boolean; error?: boolean };
    }
  | { phase: "dedupe" }
  | { phase: "affiliate_start" }
  | {
      phase: "affiliate_batch";
      batch: number;
      batchChecked: number;
      totalChecked: number;
      valid: number;
      invalid: number;
      errors: number;
      transient: number;
    }
  | {
      phase: "affiliate_done";
      batches: number;
      checked: number;
      valid: number;
      invalid: number;
      errors: number;
      transient: number;
    };

export type AffiliateValidationSweepSummary = {
  batches: number;
  checked: number;
  valid: number;
  invalid: number;
  errors: number;
  /** Bloqueio/rate limit — não contados como expirados. */
  transient: number;
};

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
      affiliate_validation?: AffiliateValidationSweepSummary;
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
      affiliate_validation?: AffiliateValidationSweepSummary;
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
    await mlSyncImportedProductPricesAndRatingsOnly(productId);
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
      affiliate_validation: {
        batches: 0,
        checked: 0,
        valid: 0,
        invalid: 0,
        errors: 0,
        transient: 0,
      },
    };
  }

  let reimported = 0;
  let deleted = 0;
  let failed = 0;
  let skipped_no_url = 0;
  const failures: CronMlBatchFailure[] = [];

  await options?.onProgress?.({ phase: "start", total: all.length });

  let processed = 0;
  let affChecked = 0;
  let affValid = 0;
  let affInvalid = 0;
  let affTransient = 0;
  let affErrors = 0;

  for (let batchStart = 0; batchStart < all.length; batchStart += SYNC_PARALLEL) {
    const slice = all.slice(batchStart, batchStart + SYNC_PARALLEL);
    const outcomes = await Promise.all(slice.map(({ id, code6 }) => processOneMlProduct(id, code6)));
    for (let j = 0; j < slice.length; j++) {
      const { id, code6 } = slice[j];
      const result = outcomes[j];
      processed += 1;
      let outcome: CronMlProgressOutcome;
      let affiliate:
        | { valid: boolean; transient?: boolean; error?: boolean }
        | undefined;

      if (result.kind === "reimported") {
        reimported += 1;
        outcome = "reimported";
        try {
          const ar = await adminValidateProductAffiliateLink(id);
          affChecked += 1;
          if (ar.transient) {
            affTransient += 1;
            affiliate = { valid: false, transient: true };
          } else if (ar.valid) {
            affValid += 1;
            affiliate = { valid: true };
          } else {
            affInvalid += 1;
            affiliate = { valid: false };
          }
        } catch {
          affChecked += 1;
          affErrors += 1;
          affiliate = { valid: false, error: true };
        }
        await options?.onProgress?.({
          phase: "affiliate_batch",
          batch: processed,
          batchChecked: 1,
          totalChecked: affChecked,
          valid: affValid,
          invalid: affInvalid,
          errors: affErrors,
          transient: affTransient,
        });
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
        index: processed,
        total: all.length,
        product_id: id,
        code6,
        outcome,
        error: result.kind === "failed" ? result.error : undefined,
        affiliate,
      });
    }
    if (batchStart + slice.length < all.length && DELAY_MS_BETWEEN_BATCHES > 0) {
      await sleep(DELAY_MS_BETWEEN_BATCHES);
    }
  }

  await options?.onProgress?.({
    phase: "affiliate_done",
    batches: affChecked > 0 ? 1 : 0,
    checked: affChecked,
    valid: affValid,
    invalid: affInvalid,
    errors: affErrors,
    transient: affTransient,
  });

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
    affiliate_validation: {
      batches: affChecked > 0 ? 1 : 0,
      checked: affChecked,
      valid: affValid,
      invalid: affInvalid,
      errors: affErrors,
      transient: affTransient,
    },
  };
}
