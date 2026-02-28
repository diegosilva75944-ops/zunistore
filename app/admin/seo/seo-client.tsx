"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  slug: string;
  title: string;
  description: string;
  query_terms: string[] | any;
  is_indexable: boolean;
  min_results: number;
};

export function SeoClient() {
  const [items, setItems] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected],
  );

  async function load() {
    const res = await fetch("/api/admin/seo-queries").catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    setItems(Array.isArray(data?.items) ? data.items : []);
  }

  useEffect(() => {
    load();
  }, []);

  async function generate() {
    setBusy(true);
    const res = await fetch("/api/admin/seo-queries/generate", { method: "POST" }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) return alert("Falha ao gerar sugestões.");
    await load();
    alert("Sugestões geradas/atualizadas.");
  }

  async function bulkApprove(indexable: boolean) {
    if (!selectedIds.length) return;
    setBusy(true);
    const res = await fetch("/api/admin/seo-queries/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds, patch: { is_indexable: indexable } }),
    }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) return alert("Falha ao atualizar.");
    setSelected({});
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap rounded-2xl bg-zinc-50 ring-1 ring-zinc-200 p-4">
        <button
          disabled={busy}
          onClick={generate}
          className="rounded-full bg-zuni-orange px-5 py-2 text-sm font-semibold text-zuni-black disabled:opacity-60"
        >
          Gerar sugestões automaticamente
        </button>

        <div className="flex items-center gap-2">
          <button
            disabled={busy || !selectedIds.length}
            onClick={() => bulkApprove(true)}
            className="rounded-full bg-zuni-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Aprovar indexação ({selectedIds.length})
          </button>
          <button
            disabled={busy || !selectedIds.length}
            onClick={() => bulkApprove(false)}
            className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            Marcar noindex
          </button>
        </div>
      </div>

      <div className="overflow-auto rounded-2xl ring-1 ring-zinc-200">
        <table className="min-w-[1000px] w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-700">
            <tr>
              <th className="p-3 text-left w-10"></th>
              <th className="p-3 text-left">Slug</th>
              <th className="p-3 text-left">Título</th>
              <th className="p-3 text-left">Indexável</th>
              <th className="p-3 text-left">min_results</th>
              <th className="p-3 text-left">Termos</th>
            </tr>
          </thead>
          <tbody>
            {items.map((q) => (
              <tr key={q.id} className="border-t border-zinc-100">
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={!!selected[q.id]}
                    onChange={(e) => setSelected((s) => ({ ...s, [q.id]: e.target.checked }))}
                  />
                </td>
                <td className="p-3 font-mono text-xs">{q.slug}</td>
                <td className="p-3 font-semibold">{q.title}</td>
                <td className="p-3">{q.is_indexable ? "sim" : "não"}</td>
                <td className="p-3">{q.min_results ?? 8}</td>
                <td className="p-3 text-xs text-zinc-600">
                  {Array.isArray(q.query_terms) ? q.query_terms.join(", ") : "—"}
                </td>
              </tr>
            ))}
            {!items.length ? (
              <tr>
                <td className="p-3 text-zinc-600" colSpan={6}>
                  Nenhuma query ainda.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

