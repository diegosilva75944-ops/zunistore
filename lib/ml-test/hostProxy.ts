import "server-only";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { ImportMode, TestMlImportResult } from "./types";
import type { RunTestMlImportOptions } from "./pipeline";

/**
 * Se `ML_HOST_IMPORT_URL` estiver definido, delega o import ao worker HTTP no host (fora do Docker).
 * `ML_HOST_IMPORT_SECRET` é opcional; se definido, envia `Authorization: Bearer`.
 */
export async function tryHostWorkerImport(
  rawUrl: string,
  mode: ImportMode,
  opts?: RunTestMlImportOptions,
): Promise<TestMlImportResult | null> {
  const base = process.env.ML_HOST_IMPORT_URL?.trim();
  if (!base) return null;

  const secret = process.env.ML_HOST_IMPORT_SECRET?.trim();

  const timeoutMs = Math.min(
    Math.max(Number(process.env.ML_HOST_IMPORT_TIMEOUT_MS ?? "") || 120_000, 30_000),
    600_000,
  );

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers.Authorization = `Bearer ${secret}`;

  const res = await fetch(`${base.replace(/\/$/, "")}/internal/ml-import`, {
    method: "POST",
    headers,
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

export type MlLoginOpenDelegateResult =
  | { ok: true; userDataDir: string; storageStatePath: string }
  | { ok: false; error: string; details?: string };

/**
 * Se `ML_HOST_IMPORT_URL` estiver definido (mesmo worker que o import/sync ML no host), pede ao processo
 * no host para abrir o login com janela e devolve o `storageState` para gravar no contentor.
 * `ML_HOST_LOGIN_TIMEOUT_MS` — opcional; vazio = sem limite de tempo (o pedido só termina ao fechar o browser).
 */
export async function tryHostWorkerMlLoginOpen(): Promise<MlLoginOpenDelegateResult | null> {
  if (String(process.env.ML_HOST_IS_WORKER ?? "").trim() === "1") return null;

  const base = process.env.ML_HOST_IMPORT_URL?.trim();
  if (!base) return null;

  const secret = process.env.ML_HOST_IMPORT_SECRET?.trim();
  const rawTimeout = String(process.env.ML_HOST_LOGIN_TIMEOUT_MS ?? "").trim();
  const timeoutMs = rawTimeout === "" ? 0 : Number(rawTimeout);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers.Authorization = `Bearer ${secret}`;

  const init: RequestInit = {
    method: "POST",
    headers,
    body: "{}",
  };
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    init.signal = AbortSignal.timeout(timeoutMs);
  }

  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/$/, "")}/internal/ml-login-open`, init);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `Worker ML (login): rede falhou — ${msg}. Confirme ML_HOST_IMPORT_URL e o processo ml-host no host.`,
    };
  }

  let json: {
    ok?: boolean;
    error?: string;
    details?: string;
    storageState?: unknown;
    userDataDir?: string;
    storageStatePath?: string;
  };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    return {
      ok: false,
      error: `Worker ML (login): resposta não-JSON (HTTP ${res.status}).`,
    };
  }

  if (!res.ok || !json.ok) {
    return {
      ok: false,
      error:
        typeof json.error === "string" ? json.error : `Worker ML (login) falhou (HTTP ${res.status}).`,
      details: typeof json.details === "string" ? json.details : undefined,
    };
  }

  if (!json.storageState || typeof json.storageState !== "object") {
    return {
      ok: false,
      error: "Worker ML (login): resposta sem storageState.",
    };
  }

  const storageStatePathRel =
    String(json.storageStatePath ?? ".playwright/ml-storage-state.json").trim() ||
    ".playwright/ml-storage-state.json";
  const userDataDirRel =
    String(json.userDataDir ?? ".playwright/ml-user-data").trim() || ".playwright/ml-user-data";

  const abs = path.resolve(process.cwd(), storageStatePathRel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, JSON.stringify(json.storageState), "utf8");

  return {
    ok: true,
    userDataDir: userDataDirRel,
    storageStatePath: storageStatePathRel,
  };
}
