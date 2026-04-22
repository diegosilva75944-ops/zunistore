import "server-only";

import { runWithMlPlaywrightBrowserSession } from "@/lib/ml-test/extractWithBrowser";
import {
  runCronMlFullReimportAll,
  type CronMlFullReimportBatchResult,
  type CronMlProgressEvent,
} from "@/services/mercadolivre/cron-ml-reimport";

export type { CronMlProgressEvent };

/** Resposta JSON para cron / stream (inclui validação de afiliados por produto no próprio loop ML). */
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
      inactive_marked: result.inactive_marked,
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
    inactive_marked: result.inactive_marked,
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
 * Reimportação ML (todos) → após cada produto reimportado, validação do link de afiliado do mesmo item → dedupe.
 * Um Chromium, uma aba; validação alinhada ao sync individual.
 */
export async function runMlAdminFullPipeline(options?: {
  onProgress?: (evt: CronMlProgressEvent) => void | Promise<void>;
}): Promise<CronMlFullReimportBatchResult> {
  return runWithMlPlaywrightBrowserSession(async () => {
    return runCronMlFullReimportAll({
      onProgress: options?.onProgress,
    });
  }, { poolSize: 1 });
}
