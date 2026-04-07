"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Row = Record<string, unknown>;


function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function parseCell(col: string, raw: string): unknown {
  const t = raw.trim();
  if (t === "") return null;
  if (col === "images" || col === "description" || col === "description_detail") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  if (
    [
      "price",
      "promo_price",
      "off_percent",
      "rating",
      "reviews_count",
    ].includes(col)
  ) {
    const n = Number(t.replace(",", "."));
    return Number.isFinite(n) ? n : raw;
  }
  if (["is_offer", "needs_update", "is_active", "affiliate_valid"].includes(col)) {
    if (t.toLowerCase() === "true") return true;
    if (t.toLowerCase() === "false") return false;
    if (t === "") return null;
    return raw;
  }
  return raw;
}

export function ProductsTableClient() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const dirtyIdsRef = useRef<Set<string>>(new Set());

  const columns = useMemo(() => {
    if (!items.length) return [] as string[];
    const keys = new Set<string>();
    for (const row of items) {
      Object.keys(row).forEach((k) => keys.add(k));
    }
    const skip = new Set(["search_tsv", "title_norm"]);
    return [...keys].filter((k) => !skip.has(k)).sort();
  }, [items]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/products/table?limit=${limit}&offset=${offset}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setError(data?.error || "Falha ao carregar.");
        return;
      }
      if (Array.isArray(data.items)) {
        setItems(data.items);
        setTotal(typeof data.total === "number" ? data.total : 0);
        setDrafts((prev) => {
          const next = { ...prev };
          for (const row of data.items as Row[]) {
            const id = String(row.id ?? "");
            if (!id) continue;
            if (dirtyIdsRef.current.has(id)) continue;
            const line: Record<string, string> = {};
            for (const c of Object.keys(row)) {
              line[c] = cellToString(row[c]);
            }
            next[id] = line;
          }
          return next;
        });
        setLastRefresh(new Date());
      }
    } catch {
      setError("Erro de rede.");
    } finally {
      setLoading(false);
    }
  }, [limit, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void load();
      }
    }, 8000);
    return () => clearInterval(t);
  }, [load]);

  function syncDraftFromRow(row: Row) {
    const id = String(row.id ?? "");
    if (!id) return;
    dirtyIdsRef.current.delete(id);
    const line: Record<string, string> = {};
    for (const c of Object.keys(row)) {
      line[c] = cellToString(row[c]);
    }
    setDrafts((d) => ({ ...d, [id]: line }));
  }

  async function saveRow(productId: string) {
    const draft = drafts[productId];
    if (!draft) return;
    const row = items.find((r) => String(r.id) === productId);
    if (!row) return;

    setSaving((s) => ({ ...s, [productId]: true }));
    try {
      const payload: Record<string, unknown> = {};
      for (const col of columns) {
        if (col === "id" || col === "effective_price" || col === "created_at" || col === "updated_at") {
          continue;
        }
        const before = cellToString(row[col]);
        const after = draft[col] ?? "";
        if (before === after) continue;
        payload[col] = parseCell(col, after);
      }
      if (Object.keys(payload).length === 0) {
        alert("Nada alterado nesta linha.");
        return;
      }
      const res = await fetch(`/api/admin/products/table/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        alert(data?.error || "Falha ao guardar.");
        return;
      }
      dirtyIdsRef.current.delete(productId);
      await load();
    } finally {
      setSaving((s) => ({ ...s, [productId]: false }));
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.floor(offset / limit) + 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-full bg-zuni-primary px-4 py-2 font-semibold text-white hover:opacity-95"
        >
          Atualizar agora
        </button>
        <span className="text-zinc-600">
          Total: <strong>{total}</strong> · Página {page}/{totalPages}
        </span>
        {lastRefresh && (
          <span className="text-xs text-zinc-500">
            Última atualização: {lastRefresh.toLocaleTimeString("pt-BR")}
          </span>
        )}
        <label className="flex items-center gap-2">
          Linhas:
          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value) as 25 | 50 | 100);
              setOffset(0);
            }}
            className="rounded-lg border border-zinc-200 px-2 py-1"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
        <button
          type="button"
          disabled={offset <= 0}
          onClick={() => setOffset((o) => Math.max(0, o - limit))}
          className="rounded-lg border border-zinc-200 px-3 py-1 disabled:opacity-50"
        >
          ← Anterior
        </button>
        <button
          type="button"
          disabled={offset + limit >= total}
          onClick={() => setOffset((o) => o + limit)}
          className="rounded-lg border border-zinc-200 px-3 py-1 disabled:opacity-50"
        >
          Seguinte →
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && items.length === 0 && <p className="text-sm text-zinc-600">A carregar…</p>}

      <div className="overflow-x-auto rounded-xl ring-1 ring-zinc-200 max-h-[70vh] overflow-y-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-zinc-100">
            <tr>
              <th className="p-2 font-semibold border-b border-zinc-200">Ações</th>
              {columns.map((c) => (
                <th key={c} className="p-2 font-semibold border-b border-zinc-200 whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const id = String(row.id ?? "");
              const draft = drafts[id] ?? {};
              return (
                <tr key={id}>
                  <td className="p-1 border-b border-zinc-100 align-top whitespace-nowrap">
                    <button
                      type="button"
                      disabled={saving[id]}
                      onClick={() => saveRow(id)}
                      className="rounded-full bg-zuni-green px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                    >
                      {saving[id] ? "…" : "Guardar"}
                    </button>
                    <button
                      type="button"
                      disabled={saving[id]}
                      onClick={() => syncDraftFromRow(row)}
                      className="ml-1 rounded-full border border-zinc-300 px-2 py-1 text-[11px]"
                    >
                      Reverter
                    </button>
                  </td>
                  {columns.map((c) => (
                    <td key={c} className="p-0 border-b border-zinc-100 align-top min-w-[120px]">
                      {c === "id" || c === "effective_price" || c === "updated_at" || c === "created_at" ? (
                        <div className="p-2 text-zinc-600 break-all">{cellToString(row[c])}</div>
                      ) : (
                        <textarea
                          value={draft[c] ?? cellToString(row[c])}
                          onChange={(e) => {
                            dirtyIdsRef.current.add(id);
                            setDrafts((d) => ({
                              ...d,
                              [id]: { ...draft, [c]: e.target.value },
                            }));
                          }}
                          rows={c === "description" || c === "description_detail" ? 3 : 2}
                          className="w-full min-w-[100px] resize-y bg-white font-mono text-[11px] p-1 leading-snug border-0 focus:ring-1 focus:ring-zuni-primary"
                        />
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
