"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

type Category = { id: string; name: string };

type ProductRow = {
  id: string;
  code6: string;
  slug: string;
  title: string;
  images: string[] | null;
  price: number | null;
  promo_price: number | null;
  off_percent: number | null;
  affiliate_url: string;
  needs_update: boolean;
  categories?: { id: string; name: string } | null;
};

export function ProductsClient({ categories }: { categories: Category[] }) {
  const [items, setItems] = useState<ProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<10 | 20 | 50>(20);
  const [filterQ, setFilterQ] = useState("");
  const [filterCode6, setFilterCode6] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [filterVersion, setFilterVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [action, setAction] = useState<
    "change_category" | "mark_needs_update" | "unmark_needs_update" | "remove"
  >("mark_needs_update");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncingProductId, setSyncingProductId] = useState<string | null>(null);

  const fetchProducts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("perPage", String(perPage));
    if (filterQ.trim()) params.set("q", filterQ.trim());
    if (filterCode6.trim()) params.set("code6", filterCode6.trim());
    if (filterCategoryId) params.set("categoryId", filterCategoryId);
    const res = await fetch(`/api/admin/products?${params.toString()}`);
    const data = await res.json().catch(() => ({}));
    setItems(Array.isArray(data?.items) ? data.items : []);
    setTotal(Number(data?.total) ?? 0);
    setLoading(false);
  }, [page, perPage, filterQ, filterCode6, filterCategoryId]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts, filterVersion]);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected],
  );

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  async function runBulk() {
    if (!selectedIds.length) return;
    if (action === "remove" && !confirm("Remover produtos selecionados?")) return;

    setBusy(true);
    const res = await fetch("/api/admin/products/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: selectedIds,
        action,
        categoryId: action === "change_category" ? categoryId : undefined,
      }),
    }).catch(() => null);

    setBusy(false);
    if (!res || !res.ok) {
      alert("Falha ao executar ação.");
      return;
    }
    window.location.reload();
  }

  async function runBulkChangeCategory() {
    if (!selectedIds.length) return;
    setBusy(true);
    const res = await fetch("/api/admin/products/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: selectedIds,
        action: "change_category",
        categoryId,
      }),
    }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      alert("Falha ao alterar categoria.");
      return;
    }
    window.location.reload();
  }

  async function syncProductPrice(productId: string) {
    setSyncingProductId(productId);
    try {
      const res = await fetch(`/api/admin/products/${productId}/sync-price`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error ?? "Falha ao sincronizar preço.");
        return;
      }
      await fetchProducts(true);
    } finally {
      setSyncingProductId(null);
    }
  }

  async function syncAllPrices() {
    if (!confirm("Sincronizar preços de TODOS os produtos? Isso pode levar alguns segundos.")) return;
    
    setSyncing(true);
    setSyncResult(null);
    
    try {
      const res = await fetch("/api/cron/sync-prices", {
        method: "POST",
      });
      
      const data = await res.json().catch(() => null);
      
      if (!res.ok || !data?.ok) {
        setSyncResult(`Erro: ${data?.error || "Falha na sincronização"}`);
        return;
      }
      
      setSyncResult(`Sincronizado! Total: ${data.total}, Atualizados: ${data.updated}, Ignorados: ${data.skipped}, Falhas: ${data.failed}`);
      
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (e) {
      setSyncResult("Erro ao conectar com o servidor.");
    } finally {
      setSyncing(false);
    }
  }

  const allChecked = items.length > 0 && items.every((p) => selected[p.id]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap rounded-2xl bg-zuni-green/10 ring-1 ring-zuni-green/30 p-3">
        <button
          disabled={syncing}
          onClick={syncAllPrices}
          className="rounded-full bg-zuni-green px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 flex items-center gap-2"
        >
          {syncing ? (
            <>
              <span className="animate-spin">⏳</span>
              Sincronizando...
            </>
          ) : (
            <>
              🔄 Sincronizar Todos os Preços
            </>
          )}
        </button>
        
        {syncResult && (
          <span className={`text-sm ${syncResult.startsWith("Erro") ? "text-zuni-red" : "text-zuni-green"}`}>
            {syncResult}
          </span>
        )}
        
        <span className="text-xs text-zinc-600 ml-auto">
          Atualização automática: diariamente às 3h
        </span>
      </div>

      <div className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-200 p-4 space-y-3">
        <div className="text-sm font-semibold text-zinc-700">Filtros</div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Nome</label>
            <input
              type="text"
              value={filterQ}
              onChange={(e) => setFilterQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setPage(1);
                  setSelected({});
                  setFilterVersion((v) => v + 1);
                }
              }}
              placeholder="Buscar no título/descrição"
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm w-48 min-w-0"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Código (code6)</label>
            <input
              type="text"
              value={filterCode6}
              onChange={(e) => setFilterCode6(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setPage(1);
                  setSelected({});
                  setFilterVersion((v) => v + 1);
                }
              }}
              placeholder="Ex: 000001"
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm w-28 min-w-0 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Categoria</label>
            <select
              value={filterCategoryId}
              onChange={(e) => setFilterCategoryId(e.target.value)}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm min-w-[140px]"
            >
              <option value="">Todas</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Por página</label>
            <select
              value={perPage}
              onChange={(e) => {
                setPerPage(Number(e.target.value) as 10 | 20 | 50);
                setPage(1);
              }}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => {
              setPage(1);
              setSelected({});
              setFilterVersion((v) => v + 1);
            }}
            className="rounded-full bg-zuni-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
          >
            Aplicar filtros
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-zuni-purple-light/50 ring-1 ring-zuni-primary/20 p-4 space-y-3">
        <div className="text-sm font-semibold text-zinc-800">
          Alterar categoria em lote
        </div>
        <p className="text-xs text-zinc-600">
          Marque os produtos na tabela (checkbox) que deseja alterar e escolha a nova categoria abaixo. Depois clique em &quot;Alterar categoria dos selecionados&quot;.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Nova categoria</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm min-w-[180px]"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button
              disabled={busy || selectedIds.length === 0}
              onClick={runBulkChangeCategory}
              className="rounded-full bg-zuni-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-95"
            >
              Alterar categoria dos selecionados
              {selectedIds.length > 0 && ` (${selectedIds.length})`}
            </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap rounded-2xl bg-zinc-50 ring-1 ring-zinc-200 p-3">
        <span className="text-xs font-medium text-zinc-600">Outras ações em lote:</span>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value as any)}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
        >
          <option value="mark_needs_update">Marcar needs_update</option>
          <option value="unmark_needs_update">Desmarcar needs_update</option>
          <option value="remove">Remover</option>
        </select>
        <button
          disabled={busy || selectedIds.length === 0}
          onClick={runBulk}
          className="rounded-full bg-zinc-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-zinc-800"
        >
          Aplicar ({selectedIds.length})
        </button>
        <span className="text-xs text-zinc-500 ml-auto">Use a extensão para importar (aba Importação).</span>
      </div>

      {loading ? (
        <div className="rounded-2xl ring-1 ring-zinc-200 p-8 text-center text-sm text-zinc-500">
          Carregando produtos…
        </div>
      ) : (
      <div className="overflow-auto rounded-2xl ring-1 ring-zinc-200">
        <table className="min-w-[1100px] w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-700">
            <tr>
              <th className="p-3 text-left w-10">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => {
                    const v = e.target.checked;
                    const next: Record<string, boolean> = {};
                    items.forEach((p) => (next[p.id] = v));
                    setSelected(next);
                  }}
                />
              </th>
              <th className="p-3 text-left">Foto</th>
              <th className="p-3 text-left">Nome</th>
              <th className="p-3 text-left">Categoria</th>
              <th className="p-3 text-left">Preço</th>
              <th className="p-3 text-left">Promo</th>
              <th className="p-3 text-left">OFF%</th>
              <th className="p-3 text-left">Sync preço</th>
              <th className="p-3 text-left">Editar</th>
              <th className="p-3 text-left">Abrir</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              const img = p.images?.[0] ?? null;
              const hasPromo = p.promo_price != null && p.promo_price < (p.price ?? 0);
              return (
                <tr key={p.id} className="border-t border-zinc-100">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={!!selected[p.id]}
                      onChange={(e) => setSelected((s) => ({ ...s, [p.id]: e.target.checked }))}
                    />
                  </td>
                  <td className="p-3">
                    <div className="relative h-12 w-12 rounded-xl overflow-hidden bg-zinc-50 ring-1 ring-zinc-200">
                      {img ? (
                        <Image src={img} alt={p.title} fill className="object-contain p-1" />
                      ) : null}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="font-semibold line-clamp-2">{p.title}</div>
                    <div className="text-xs text-zinc-500 font-mono">{p.code6}</div>
                  </td>
                  <td className="p-3 text-xs">{p.categories?.name ?? "—"}</td>
                  <td className="p-3">
                    <span className={`font-medium ${hasPromo ? "text-zinc-400 line-through" : "text-zinc-900"}`}>
                      {p.price != null ? formatBRL(p.price) : "—"}
                    </span>
                  </td>
                  <td className="p-3">
                    {hasPromo ? (
                      <span className="font-semibold text-zuni-green">
                        {formatBRL(p.promo_price!)}
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    {p.off_percent ? (
                      <span className="inline-flex rounded-full bg-zuni-red text-white text-xs font-semibold px-2 py-0.5">
                        {p.off_percent}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3">
                    <button
                      type="button"
                      disabled={syncingProductId === p.id}
                      onClick={() => syncProductPrice(p.id)}
                      className="inline-flex items-center gap-1 rounded-full bg-zuni-green/90 px-2.5 py-1 text-xs font-semibold text-white hover:bg-zuni-green disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Sincronizar preço com a loja original"
                    >
                      {syncingProductId === p.id ? (
                        <>
                          <span className="animate-spin">⏳</span>
                          Sync…
                        </>
                      ) : (
                        "Sync"
                      )}
                    </button>
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/admin/produtos/${p.id}`}
                      className="text-zuni-primary font-semibold hover:underline"
                    >
                      Editar
                    </Link>
                  </td>
                  <td className="p-3">
                    <a
                      href={p.affiliate_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-zuni-primary font-semibold hover:underline"
                    >
                      Abrir
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-zinc-50 ring-1 ring-zinc-200 p-3">
        <div className="text-sm text-zinc-600">
          <span className="font-semibold text-zinc-900">{total}</span> produto(s)
          {total > 0 && (
            <> · Página <span className="font-semibold">{page}</span> de {totalPages}</>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-50"
          >
            ← Anterior
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-50"
          >
            Próxima →
          </button>
        </div>
      </div>
    </div>
  );
}

