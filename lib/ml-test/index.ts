import type { ImportMode, TestMlImportResult } from "./types";
import type { RunTestMlImportOptions } from "./pipeline";
import { tryHostWorkerImport } from "./hostProxy";
import { runTestMlImportCore } from "./pipeline";

export type {
  ChosenBlockInfo,
  IgnoredCandidateEntry,
  ImportMode,
  PriceCandidate,
  PriceConfidence,
  PriceDataSource,
  PricingDisplayMode,
  PricingPreview,
  ResolvePreviewPricingResult,
  TestMlImportResult,
  UsedCandidateEntry,
} from "./types";
export type { RunTestMlImportOptions } from "./pipeline";
export type { FetchHtmlWithPlaywrightOptions } from "./extractWithBrowser";
export { runTestMlImportCore } from "./pipeline";

/**
 * Importação ML (PDP). Se `ML_HOST_IMPORT_URL` + `ML_HOST_IMPORT_SECRET` estiverem definidos, delega ao worker no host.
 */
export async function runTestMlImport(
  rawUrl: string,
  mode: ImportMode,
  opts?: RunTestMlImportOptions,
): Promise<TestMlImportResult> {
  const proxied = await tryHostWorkerImport(rawUrl, mode, opts);
  if (proxied !== null) return proxied;
  return runTestMlImportCore(rawUrl, mode, opts);
}

export { runTestMlImport as runMlPdpImport };
