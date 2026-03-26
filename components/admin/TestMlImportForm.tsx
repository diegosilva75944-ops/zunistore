"use client";

import type { ImportMode } from "@/lib/ml-test";

type Props = {
  url: string;
  onUrlChange: (v: string) => void;
  loading: boolean;
  onSubmit: (mode: ImportMode) => void;
};

export function TestMlImportForm({ url, onUrlChange, loading, onSubmit }: Props) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 md:p-5 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-amber-950">Entrada (somente teste)</h2>
        <p className="text-xs text-amber-900/80 mt-1">
          Cole a URL pública do produto no Mercado Livre. Nada é salvo no catálogo — ao recarregar a página, os
          dados somem.
        </p>
      </div>
      <textarea
        value={url}
        onChange={(e) => onUrlChange(e.target.value)}
        rows={3}
        disabled={loading}
        placeholder="Ex.: https://www.mercadolivre.com.br/.../p/MLB1234567890"
        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-mono text-zinc-900 placeholder:text-zinc-400 focus:border-zuni-primary focus:outline-none focus:ring-2 focus:ring-zuni-primary/30"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={loading || !url.trim()}
          onClick={() => onSubmit("auto")}
          className="rounded-xl bg-zuni-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
        >
          {loading ? "Processando…" : "Importar produto (auto)"}
        </button>
        <button
          type="button"
          disabled={loading || !url.trim()}
          onClick={() => onSubmit("html")}
          className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
        >
          Só HTTP + HTML
        </button>
        <button
          type="button"
          disabled={loading || !url.trim()}
          onClick={() => onSubmit("headless")}
          className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
        >
          Só Playwright
        </button>
      </div>
    </div>
  );
}
