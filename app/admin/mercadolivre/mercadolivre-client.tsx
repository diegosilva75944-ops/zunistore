"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SitePageLoader } from "@/components/SitePageLoader";

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

type PreviewResponse =
  | { success: true; itemId: string; listing: any; category: any | null }
  | { success: false; error: string; externalStatus?: number };

type ImportResponse =
  | { success: true; result: { action: "created" | "already_exists" | "updated_existing"; matchedBy?: string; code6: string; slug: string }; productUrl: string }
  | { success: false; error: string; externalStatus?: number };

type SearchResponse =
  | { success: true; items: any[]; total: number; offset: number; limit: number }
  | { success: false; error: string; externalStatus?: number };

type ImportedResponse =
  | { ok: true; items: any[]; total: number; page: number; perPage: number }
  | { ok: false; error: string };

function Badge({ children, tone }: { children: React.ReactNode; tone: "gray" | "green" | "red" | "amber" | "blue" }) {
  const cls =
    tone === "green"
      ? "bg-zuni-green/15 text-zuni-green ring-zuni-green/30"
      : tone === "red"
        ? "bg-zuni-red/10 text-zuni-red ring-zuni-red/30"
        : tone === "amber"
          ? "bg-amber-100 text-amber-800 ring-amber-200"
          : tone === "blue"
            ? "bg-blue-50 text-blue-700 ring-blue-200"
            : "bg-zinc-100 text-zinc-700 ring-zinc-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${cls}`}>
      {children}
    </span>
  );
}

function isRecentlySynced(iso?: string | null) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < 6 * 60 * 60 * 1000;
}

export function MercadoLivreClient() {
  const [tab, setTab] = useState<"link" | "buscar" | "importados">("link");

  // Aba 1: por link
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [updateIfExists, setUpdateIfExists] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const fetchPreview = useCallback(async () => {
    setLoadingPreview(true);
    setImportMsg(null);
    setPreview(null);
    const res = await fetch("/api/admin/mercadolivre/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = (await res.json().catch(() => ({}))) as PreviewResponse;
    setPreview(data);
    setLoadingPreview(false);
  }, [url]);

  const doImport = useCallback(async (payload: { url?: string; itemId?: string }) => {
    setImporting(true);
    setImportMsg(null);
    const res = await fetch("/api/admin/mercadolivre/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, updateIfExists }),
    });
    const data = (await res.json().catch(() => ({}))) as ImportResponse;
    if (!res.ok || !data.success) {
      setImportMsg(data && "error" in data ? data.error : "Falha ao importar.");
      setImporting(false);
      return;
    }
    setImportMsg(
      data.result.action === "created"
        ? `Importado com sucesso.`
        : data.result.action === "already_exists"
          ? `Já existia — não foi duplicado (deduplicação por ${data.result.matchedBy ?? "external"}).`
          : `Já existia — atualizado (deduplicação por ${data.result.matchedBy ?? "external"}).`,
    );
    setImporting(false);
    return data.productUrl;
  }, [updateIfExists]);

  // Aba 2: buscar anúncios
  const [searchKind, setSearchKind] = useState<"term" | "seller_id" | "nickname">("term");
  const [term, setTerm] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [nickname, setNickname] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [selectedSearch, setSelectedSearch] = useState<Record<string, boolean>>({});
  const [bulkImporting, setBulkImporting] = useState(false);
  const selectedSearchIds = useMemo(
    () => Object.entries(selectedSearch).filter(([, v]) => v).map(([k]) => k),
    [selectedSearch],
  );

  const runSearch = useCallback(async () => {
    setSearchLoading(true);
    setSearchResult(null);
    setSelectedSearch({});
    const params = new URLSearchParams();
    params.set("kind", searchKind);
    if (searchKind === "term") params.set("term", term);
    if (searchKind === "seller_id") params.set("sellerId", sellerId);
    if (searchKind === "nickname") params.set("nickname", nickname);
    params.set("limit", "20");
    params.set("offset", "0");
    const res = await fetch(`/api/admin/mercadolivre/search?${params.toString()}`);
    const data = (await res.json().catch(() => ({}))) as SearchResponse;
    setSearchResult(data);
    setSearchLoading(false);
  }, [searchKind, term, sellerId, nickname]);

  const bulkImportSelected = useCallback(async () => {
    if (!selectedSearchIds.length) return;
    setBulkImporting(true);
    let ok = 0;
    let fail = 0;
    for (const itemId of selectedSearchIds) {
      const productUrl = await doImport({ itemId });
      if (productUrl) ok += 1;
      else fail += 1;
      await new Promise((r) => setTimeout(r, 250));
    }
    setBulkImporting(false);
    alert(`Importação concluída: ${ok} sucesso(s), ${fail} falha(s).`);
  }, [selectedSearchIds, doImport]);

  // Aba 3: importados
  const [importedQ, setImportedQ] = useState("");
  const [importedStatus, setImportedStatus] = useState<"any" | "active" | "inactive">("any");
  const [importedPage, setImportedPage] = useState(1);
  const [importedPerPage, setImportedPerPage] = useState<10 | 20 | 50>(20);
  const [importedLoading, setImportedLoading] = useState(false);
  const [importedData, setImportedData] = useState<ImportedResponse | null>(null);
  const [selectedImported, setSelectedImported] = useState<Record<string, boolean>>({});
  const selectedImportedIds = useMemo(
    () => Object.entries(selectedImported).filter(([, v]) => v).map(([k]) => k),
    [selectedImported],
  );
  const [syncing, setSyncing] = useState(false);

  const fetchImported = useCallback(async () => {
    setImportedLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(importedPage));
    params.set("perPage", String(importedPerPage));
    if (importedQ.trim()) params.set("q", importedQ.trim());
    if (importedStatus !== "any") params.set("status", importedStatus);
    const res = await fetch(`/api/admin/mercadolivre/imported?${params.toString()}`);
    const data = (await res.json().catch(() => ({}))) as ImportedResponse;
    setImportedData(data);
    setImportedLoading(false);
  }, [importedPage, importedPerPage, importedQ, importedStatus]);

  useEffect(() => {
    if (tab !== "importados") return;
    fetchImported();
  }, [tab, fetchImported]);

  const syncSelectedImported = useCallback(async () => {
    if (!selectedImportedIds.length) return;
    setSyncing(true);
    const res = await fetch("/api/admin/mercadolivre/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedImportedIds }),
    });
    const data = await res.json().catch(() => ({}));
    setSyncing(false);
    if (!res.ok || !data?.ok) {
      alert(data?.error ?? "Falha ao sincronizar.");
      return;
    }
    alert(`Sincronização: ${data.okCount} ok, ${data.failCount} falha(s).`);
    setSelectedImported({});
    await fetchImported();
  }, [selectedImportedIds, fetchImported]);

  const syncAllImported = useCallback(async () => {
    if (!confirm("Sincronizar (em lote) os produtos importados?")) return;
    setSyncing(true);
    const res = await fetch("/api/admin/mercadolivre/sync-all?limit=50", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setSyncing(false);
    if (!res.ok || !data?.ok) {
      alert(data?.error ?? "Falha ao sincronizar todos.");
      return;
    }
    alert(`Sincronização concluída: ${data.okCount} ok, ${data.failCount} falha(s).`);
    await fetchImported();
  }, [fetchImported]);

  const previewCard = (() => {
    if (!preview) return null;
    if (!preview.success) {
      return (
        <div className="rounded-2xl bg-red-50 ring-1 ring-red-200 p-4 text-sm text-red-900">
          {preview.error}
        </div>
      );
    }
    const p = preview.listing;
    const img = p?.images?.[0] ?? p?.thumbnail ?? null;
    const price = p?.price_current;
    const original = p?.price_original;
    const hasPromo = typeof price === "number" && typeof original === "number" && price < original;

    return (
      <div className="rounded-2xl bg-white ring-1 ring-zinc-200 p-4">
        <div className="flex flex-wrap gap-4">
          <div className="relative h-24 w-24 rounded-2xl bg-zinc-50 ring-1 ring-zinc-200 overflow-hidden">
            {img ? <Image src={img} alt={p?.title ?? "Produto"} fill className="object-contain p-2" /> : null}
          </div>
          <div className="flex-1 min-w-[240px] space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="blue">Item {preview.itemId}</Badge>
              {p?.external_active === false ? <Badge tone="red">Inativo</Badge> : <Badge tone="green">Ativo</Badge>}
              {hasPromo ? <Badge tone="amber">Em promoção</Badge> : null}
            </div>
            <div className="font-semibold">{p?.title ?? "—"}</div>
            <div className="text-sm text-zinc-600">
              {preview.category?.name ? (
                <>Categoria: <span className="font-medium text-zinc-900">{preview.category.name}</span></>
              ) : (
                <>Categoria: <span className="text-zinc-400">—</span></>
              )}
            </div>
            <div className="text-sm">
              {typeof price === "number" ? (
                <span className={`font-semibold ${hasPromo ? "text-zuni-green" : "text-zinc-900"}`}>
                  {formatBRL(price)}
                </span>
              ) : (
                <span className="text-zinc-500">Preço não disponível na API (vamos tentar fallback no import).</span>
              )}
              {hasPromo ? (
                <span className="ml-2 text-zinc-500 line-through">{formatBRL(original)}</span>
              ) : null}
            </div>
            <div className="text-xs text-zinc-500">
              {p?.external_permalink ? (
                <a href={p.external_permalink} target="_blank" rel="noreferrer" className="hover:underline text-zuni-primary font-semibold">
                  Abrir anúncio
                </a>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-2 w-full sm:w-auto">
            <button
              type="button"
              disabled={importing}
              onClick={() => doImport({ url })}
              className="rounded-full bg-zuni-primary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
            >
              {importing ? "Importando…" : "Importar para o catálogo"}
            </button>
            <label className="flex items-center gap-2 text-xs text-zinc-700">
              <input
                type="checkbox"
                checked={updateIfExists}
                onChange={() => setUpdateIfExists((v) => !v)}
                className="rounded border-zinc-300"
              />
              Se já existir, atualizar dados (deduplicação)
            </label>
            {importMsg ? (
              <div className="text-xs text-zinc-700">
                {importMsg}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200">
        <button
          type="button"
          onClick={() => setTab("link")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition ${
            tab === "link" ? "border-zuni-primary text-zuni-primary bg-white" : "border-transparent text-zinc-600 hover:text-zinc-900"
          }`}
        >
          Importar por link
        </button>
        <button
          type="button"
          onClick={() => setTab("buscar")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition ${
            tab === "buscar" ? "border-zuni-primary text-zuni-primary bg-white" : "border-transparent text-zinc-600 hover:text-zinc-900"
          }`}
        >
          Buscar anúncios públicos
        </button>
        <button
          type="button"
          onClick={() => setTab("importados")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition ${
            tab === "importados" ? "border-zuni-primary text-zuni-primary bg-white" : "border-transparent text-zinc-600 hover:text-zinc-900"
          }`}
        >
          Produtos importados
        </button>
      </div>

      {tab === "link" ? (
        <div className="space-y-3">
          <div className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-200 p-4 space-y-3">
            <div className="text-sm font-semibold text-zinc-700">Link do anúncio</div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[260px]">
                <label className="block text-xs text-zinc-500 mb-1">URL do produto</label>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Cole a URL do anúncio do Mercado Livre"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                disabled={loadingPreview}
                onClick={fetchPreview}
                className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              >
                {loadingPreview ? "Buscando…" : "Buscar prévia"}
              </button>
            </div>
            <p className="text-xs text-zinc-600">
              A prévia usa a API pública do Mercado Livre. Se o preço vier vazio, a importação tenta fallback via HTML (sem credenciais).
            </p>
          </div>

          {loadingPreview ? (
            <div className="rounded-2xl ring-1 ring-zinc-200 p-6 py-10 flex justify-center">
              <SitePageLoader compact />
            </div>
          ) : (
            previewCard
          )}
        </div>
      ) : tab === "buscar" ? (
        <div className="space-y-3">
          <div className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-200 p-4 space-y-3">
            <div className="text-sm font-semibold text-zinc-700">Buscar anúncios</div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Tipo</label>
                <select
                  value={searchKind}
                  onChange={(e) => setSearchKind(e.target.value as any)}
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="term">Palavra-chave</option>
                  <option value="seller_id">Seller ID</option>
                  <option value="nickname">Nickname</option>
                </select>
              </div>
              {searchKind === "term" ? (
                <div className="flex-1 min-w-[260px]">
                  <label className="block text-xs text-zinc-500 mb-1">Termo</label>
                  <input
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    placeholder="Ex: iPhone 13"
                  />
                </div>
              ) : null}
              {searchKind === "seller_id" ? (
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-zinc-500 mb-1">Seller ID</label>
                  <input
                    value={sellerId}
                    onChange={(e) => setSellerId(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-mono"
                    placeholder="Ex: 123456789"
                  />
                </div>
              ) : null}
              {searchKind === "nickname" ? (
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-zinc-500 mb-1">Nickname</label>
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-mono"
                    placeholder="Ex: lojaxxx"
                  />
                </div>
              ) : null}
              <button
                type="button"
                disabled={searchLoading}
                onClick={runSearch}
                className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              >
                {searchLoading ? "Buscando…" : "Buscar"}
              </button>
            </div>
            <p className="text-xs text-zinc-600">
              A busca usa o endpoint público `/sites/MLB/search`. Os resultados são anúncios ativos da listagem pública.
            </p>
          </div>

          {searchLoading ? (
            <div className="rounded-2xl ring-1 ring-zinc-200 p-6 py-10 flex justify-center">
              <SitePageLoader compact />
            </div>
          ) : searchResult && !searchResult.success ? (
            <div className="rounded-2xl bg-red-50 ring-1 ring-red-200 p-4 text-sm text-red-900">
              {searchResult.error}
            </div>
          ) : searchResult && searchResult.success ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-zinc-600">
                  Resultados: <span className="font-semibold text-zinc-900">{searchResult.total}</span>
                </div>
                <button
                  type="button"
                  disabled={bulkImporting || selectedSearchIds.length === 0}
                  onClick={bulkImportSelected}
                  className="rounded-full bg-zuni-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                >
                  {bulkImporting ? "Importando…" : `Importar selecionados (${selectedSearchIds.length})`}
                </button>
              </div>

              <div className="overflow-auto rounded-2xl ring-1 ring-zinc-200">
                <table className="min-w-[1000px] w-full text-sm">
                  <thead className="bg-zinc-50 text-zinc-700">
                    <tr>
                      <th className="p-3 text-left w-10"></th>
                      <th className="p-3 text-left">Foto</th>
                      <th className="p-3 text-left">Título</th>
                      <th className="p-3 text-left">Preço</th>
                      <th className="p-3 text-left">Vendedor</th>
                      <th className="p-3 text-left">Item ID</th>
                      <th className="p-3 text-left">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResult.items.map((it: any) => {
                      const img = it.thumbnail ?? null;
                      const hasPromo =
                        it.price != null && it.original_price != null && Number(it.price) < Number(it.original_price);
                      return (
                        <tr key={it.item_id} className="border-t border-zinc-100">
                          <td className="p-3">
                            <input
                              type="checkbox"
                              checked={!!selectedSearch[it.item_id]}
                              onChange={(e) => setSelectedSearch((s) => ({ ...s, [it.item_id]: e.target.checked }))}
                            />
                          </td>
                          <td className="p-3">
                            <div className="relative h-12 w-12 rounded-xl overflow-hidden bg-zinc-50 ring-1 ring-zinc-200">
                              {img ? <Image src={img} alt={it.title} fill className="object-contain p-1" /> : null}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="font-medium line-clamp-2">{it.title || "—"}</div>
                          </td>
                          <td className="p-3">
                            {it.price != null ? (
                              <div className="space-y-0.5">
                                <div className={`font-semibold ${hasPromo ? "text-zuni-green" : "text-zinc-900"}`}>
                                  {formatBRL(Number(it.price))}
                                </div>
                                {hasPromo ? (
                                  <div className="text-xs text-zinc-500 line-through">{formatBRL(Number(it.original_price))}</div>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-zinc-400">—</span>
                            )}
                          </td>
                          <td className="p-3 text-xs">
                            <div className="font-mono text-zinc-700">{it.seller_nickname ?? "—"}</div>
                            <div className="text-zinc-500">{it.seller_id ? `ID: ${it.seller_id}` : ""}</div>
                          </td>
                          <td className="p-3 text-xs font-mono text-zinc-600">{it.item_id}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => doImport({ itemId: it.item_id })}
                                className="rounded-full bg-zuni-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95"
                              >
                                Importar
                              </button>
                              {it.permalink ? (
                                <a
                                  href={it.permalink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs font-semibold text-zuni-primary hover:underline"
                                >
                                  Abrir
                                </a>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-white ring-1 ring-zinc-200 p-6 text-sm text-zinc-600">
              Faça uma busca para ver resultados.
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-200 p-4 space-y-3">
            <div className="text-sm font-semibold text-zinc-700">Filtros</div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[220px]">
                <label className="block text-xs text-zinc-500 mb-1">Busca</label>
                <input
                  value={importedQ}
                  onChange={(e) => setImportedQ(e.target.value)}
                  placeholder="Item ID, vendedor ou título"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Status externo</label>
                <select
                  value={importedStatus}
                  onChange={(e) => setImportedStatus(e.target.value as any)}
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="any">Todos</option>
                  <option value="active">Ativos</option>
                  <option value="inactive">Inativos</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Por página</label>
                <select
                  value={importedPerPage}
                  onChange={(e) => {
                    setImportedPerPage(Number(e.target.value) as any);
                    setImportedPage(1);
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
                  setImportedPage(1);
                  setSelectedImported({});
                  fetchImported();
                }}
                className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95"
              >
                Aplicar
              </button>
              <button
                type="button"
                disabled={syncing || selectedImportedIds.length === 0}
                onClick={syncSelectedImported}
                className="rounded-full bg-zuni-green px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              >
                {syncing ? "Sincronizando…" : `Sincronizar selecionados (${selectedImportedIds.length})`}
              </button>
              <button
                type="button"
                disabled={syncing}
                onClick={syncAllImported}
                className="rounded-full border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
              >
                Sincronizar lote (50 mais antigos)
              </button>
            </div>
          </div>

          {importedLoading ? (
            <div className="rounded-2xl ring-1 ring-zinc-200 p-6 py-10 flex justify-center">
              <SitePageLoader compact />
            </div>
          ) : importedData && !importedData.ok ? (
            <div className="rounded-2xl bg-red-50 ring-1 ring-red-200 p-4 text-sm text-red-900">
              {importedData.error}
            </div>
          ) : importedData && importedData.ok ? (
            <div className="space-y-3">
              <div className="text-sm text-zinc-600">
                Total: <span className="font-semibold text-zinc-900">{importedData.total}</span>
              </div>
              <div className="overflow-auto rounded-2xl ring-1 ring-zinc-200">
                <table className="min-w-[1200px] w-full text-sm">
                  <thead className="bg-zinc-50 text-zinc-700">
                    <tr>
                      <th className="p-3 text-left w-10"></th>
                      <th className="p-3 text-left">Produto</th>
                      <th className="p-3 text-left">Preço</th>
                      <th className="p-3 text-left">Vendedor</th>
                      <th className="p-3 text-left">Item ID</th>
                      <th className="p-3 text-left">Status</th>
                      <th className="p-3 text-left">Importado</th>
                      <th className="p-3 text-left">Último sync</th>
                      <th className="p-3 text-left">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importedData.items.map((row: any) => {
                      const p = row.products ?? {};
                      const img = p.images?.[0] ?? null;
                      const hasPromo = p.promo_price != null && p.promo_price < p.price;
                      const active = row.external_active !== false;
                      const recent = isRecentlySynced(row.last_synced_at);
                      return (
                        <tr key={row.id} className="border-t border-zinc-100">
                          <td className="p-3">
                            <input
                              type="checkbox"
                              checked={!!selectedImported[row.product_id]}
                              onChange={(e) => setSelectedImported((s) => ({ ...s, [row.product_id]: e.target.checked }))}
                            />
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              <div className="relative h-12 w-12 rounded-xl overflow-hidden bg-zinc-50 ring-1 ring-zinc-200">
                                {img ? <Image src={img} alt={p.title} fill className="object-contain p-1" /> : null}
                              </div>
                              <div className="min-w-[260px]">
                                <div className="font-semibold line-clamp-2">{p.title ?? "—"}</div>
                                <div className="text-xs text-zinc-500">
                                  <span className="font-mono">{p.code6 ?? ""}</span>
                                  {p.categories?.name ? <> · {p.categories.name}</> : null}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <Badge tone="blue">Importado</Badge>
                                  {!active ? <Badge tone="red">Inativo</Badge> : null}
                                  {hasPromo ? <Badge tone="amber">Em promoção</Badge> : null}
                                  {recent ? <Badge tone="green">Sincronizado recentemente</Badge> : null}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3">
                            {hasPromo ? (
                              <div className="space-y-0.5">
                                <div className="text-xs text-zinc-500 line-through">{formatBRL(Number(p.price))}</div>
                                <div className="font-semibold text-zuni-green">{formatBRL(Number(p.promo_price))}</div>
                              </div>
                            ) : (
                              <div className="font-semibold text-zinc-900">{p.price != null ? formatBRL(Number(p.price)) : "—"}</div>
                            )}
                          </td>
                          <td className="p-3 text-xs">
                            <div className="font-mono text-zinc-700">{row.seller_nickname ?? "—"}</div>
                            <div className="text-zinc-500">{row.seller_id ? `ID: ${row.seller_id}` : ""}</div>
                          </td>
                          <td className="p-3 text-xs font-mono text-zinc-600">{row.external_id}</td>
                          <td className="p-3 text-xs">{row.external_status ?? (active ? "active" : "inactive")}</td>
                          <td className="p-3 text-xs text-zinc-600">
                            {row.imported_at ? new Date(row.imported_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"}
                          </td>
                          <td className="p-3 text-xs text-zinc-600">
                            {row.last_synced_at ? new Date(row.last_synced_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/admin/produtos/${row.product_id}`}
                                className="text-xs font-semibold text-zuni-primary hover:underline"
                              >
                                Editar
                              </Link>
                              <a
                                href={row.external_permalink}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-semibold text-zinc-700 hover:underline"
                              >
                                Abrir anúncio
                              </a>
                              <a
                                href={`/produto/${p.code6}/${p.slug}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-semibold text-zinc-700 hover:underline"
                              >
                                Ver no site
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-zinc-50 ring-1 ring-zinc-200 p-3">
                <div className="text-sm text-zinc-600">
                  Página <span className="font-semibold text-zinc-900">{importedData.page}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={importedPage <= 1}
                    onClick={() => setImportedPage((p) => Math.max(1, p - 1))}
                    className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-50"
                  >
                    ← Anterior
                  </button>
                  <button
                    type="button"
                    disabled={importedData.total <= importedPage * importedPerPage}
                    onClick={() => setImportedPage((p) => p + 1)}
                    className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-50"
                  >
                    Próxima →
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-white ring-1 ring-zinc-200 p-6 text-sm text-zinc-600">
              Nenhum importado encontrado.
            </div>
          )}
        </div>
      )}

      {(importing || bulkImporting || syncing) && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-white/50 backdrop-blur-md" role="status" aria-busy="true">
          <SitePageLoader compact />
        </div>
      )}
    </div>
  );
}

