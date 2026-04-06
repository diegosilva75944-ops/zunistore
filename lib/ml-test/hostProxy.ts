import "server-only";

import type { ImportMode, TestMlImportResult } from "./types";
import type { RunTestMlImportOptions } from "./pipeline";

/**
 * Se `ML_HOST_IMPORT_URL` + `ML_HOST_IMPORT_SECRET` estiverem definidos, delega o import ao worker HTTP
 * no host (fora do Docker), onde o Playwright vê X11/cookies reais.
 */
export async function tryHostWorkerImport(
  rawUrl: string,
  mode: ImportMode,
  opts?: RunTestMlImportOptions,
): Promise<TestMlImportResult | null> {
  const base = process.env.ML_HOST_IMPORT_URL?.trim();
  const secret = process.env.ML_HOST_IMPORT_SECRET?.trim();
  if (!base || !secret) return null;

  const timeoutMs = Math.min(
    Math.max(Number(process.env.ML_HOST_IMPORT_TIMEOUT_MS ?? "") || 120_000, 30_000),
    600_000,
  );

  const res = await fetch(`${base.replace(/\/$/, "")}/internal/ml-import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({
      url: rawUrl,
      mode,
      opts: opts ?? {},
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  let json: { ok?: boolean; error?: string; result?: TestMlImportResult };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    throw new Error(`Worker ML (import): resposta não-JSON (HTTP ${res.status}).`);
  }
  if (!res.ok || !json.ok) {
    throw new Error(json.error || `Worker ML falhou (HTTP ${res.status}).`);
  }
  if (!json.result) throw new Error("Worker ML: resposta sem result.");
  return json.result;
}
