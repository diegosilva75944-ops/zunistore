import "server-only";

import { adminAffiliateValidationSweepAll } from "@/lib/admin/db";
import { runWithMlPlaywrightBrowserSession } from "@/lib/ml-test/extractWithBrowser";
import {
  runCronMlFullReimportAll,
  type AffiliateValidationSweepSummary,
  type CronMlFullReimportBatchResult,
  type CronMlProgressEvent,
} from "@/services/mercadolivre/cron-ml-reimport";

export type { CronMlProgressEvent };

/** Resposta JSON para cron / stream (inclui validação de afiliados quando existir). */
export function mlAdminFullPipelineResultToJson(result: CronMlFullReimportBatchResult) {
  if (!result.ok) {
    return {
      ok: false as const,
      mode: "ml_full_reimport" as const,
      error: result.error,
    };
  }
  const affiliate = result.affiliate_validation;
  if (result.skipped) {
    return {
      ok: true as const,
      mode: "ml_full_reimport" as const,
      skipped: true,
      reason: result.reason,
      total: result.total,
      reimported: result.reimported,
      deleted: result.deleted,
      failed: result.failed,
      skipped_no_url: result.skipped_no_url,
      failures: result.failures.slice(0, 40),
      dedupe_removed: result.dedupe_removed ?? 0,
      dedupe_errors: (result.dedupe_errors ?? []).slice(0, 20),
      ...(affiliate ? { affiliate_validation: affiliate } : {}),
    };
  }
  return {
    ok: true as const,
    mode: "ml_full_reimport" as const,
    skipped: false,
    total: result.total,
    reimported: result.reimported,
    deleted: result.deleted,
    failed: result.failed,
    skipped_no_url: result.skipped_no_url,
    failures: result.failures.slice(0, 40),
    updated: result.reimported,
    skipped_legacy: 0,
    dedupe_removed: result.dedupe_removed,
    dedupe_errors: result.dedupe_errors.slice(0, 20),
    ...(affiliate ? { affiliate_validation: affiliate } : {}),
  };
}

/**
 * Reimportação ML (todos) → dedupe → validação completa de links de afiliado.
 * Um único Chromium permanece aberto até o fim; uma aba de cada vez (sem pool paralelo).
 */
export async function runMlAdminFullPipeline(options?: {
  onProgress?: (evt: CronMlProgressEvent) => void | Promise<void>;
}): Promise<CronMlFullReimportBatchResult> {
  return runWithMlPlaywrightBrowserSession(async () => {
    const reimport = await runCronMlFullReimportAll({
      onProgress: options?.onProgress,
    });

    if (!reimport.ok) {
      return reimport;
    }

    await options?.onProgress?.({ phase: "affiliate_start" });

    const affiliate: AffiliateValidationSweepSummary = await adminAffiliateValidationSweepAll({
      batchSize: 30,
      onBatch: async (info) => {
        await options?.onProgress?.({
          phase: "affiliate_batch",
          batch: info.batchIndex,
          batchChecked: info.batchChecked,
          totalChecked: info.totalChecked,
          valid: info.valid,
          invalid: info.invalid,
          errors: info.errors,
          transient: info.transient,
        });
      },
    });

    await options?.onProgress?.({
      phase: "affiliate_done",
      batches: affiliate.batches,
      checked: affiliate.checked,
      valid: affiliate.valid,
      invalid: affiliate.invalid,
      errors: affiliate.errors,
      transient: affiliate.transient,
    });

    if (reimport.skipped) {
      return { ...reimport, affiliate_validation: affiliate };
    }
    return { ...reimport, affiliate_validation: affiliate };
  }, { poolSize: 1 });
}
