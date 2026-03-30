"use client";

import { useCallback, useState } from "react";
import type { MagaluImportMode, TestMagaluImportResult } from "@/lib/magalu-test";
import { TestMagaluImportForm } from "./TestMagaluImportForm";
import { TestMagaluImportExtras } from "./TestMagaluImportExtras";
import { TestMlImportPreview } from "./TestMlImportPreview";
import { TestMlImportDebug } from "./TestMlImportDebug";

export function TestMagaluImportClient() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TestMagaluImportResult | null>(null);

  const run = useCallback(async (mode: MagaluImportMode) => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/test-magalu-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: url.trim(), mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Erro ${res.status}`);
      }
      setResult(data.result as TestMagaluImportResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [url]);

  return (
    <div className="space-y-6">
      <TestMagaluImportForm url={url} onUrlChange={setUrl} loading={loading} onSubmit={run} />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      )}

      {result && (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading || !url.trim()}
              onClick={() => run("auto")}
              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              Tentar de novo (auto)
            </button>
            <button
              type="button"
              disabled={loading || !url.trim()}
              onClick={() => run("html")}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            >
              Reprocessar com HTML
            </button>
            <button
              type="button"
              disabled={loading || !url.trim()}
              onClick={() => run("headless")}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            >
              Reprocessar com headless
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setResult(null);
                setError(null);
              }}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
            >
              Limpar teste
            </button>
          </div>

          <TestMagaluImportExtras data={result} />
          <TestMlImportPreview data={result} />
          <TestMlImportDebug data={result} />
        </>
      )}
    </div>
  );
}
