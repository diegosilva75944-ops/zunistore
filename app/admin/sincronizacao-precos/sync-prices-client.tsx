"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SitePageLoader } from "@/components/SitePageLoader";

const ADMIN_MSG = "zunistore-admin";
const EXT_MSG = "zunistore-extension";

type Row = {
  id: string;
  title: string;
  source_url: string | null;
  affiliate_url: string | null;
  price: number | null;
  promo_price: number | null;
  is_offer?: boolean | null;
  updated_at?: string | null;
};

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function mlUrl(row: Row): string | null {
  const u = row.source_url || row.affiliate_url;
  if (!u || !/mercadolivre\.com\.br/i.test(String(u))) return null;
  return String(u);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function SyncPricesClient() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<25 | 50 | 100>(25);
  const [qDraft, setQDraft] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [openedCount, setOpenedCount] = useState(0);
  const [delayMs, setDelayMs] = useState(450);

  const [batchSize, setBatchSize] = useState(10);
  const [serverBusy, setServerBusy] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const cancelAutoRef = useRef(false);
  const [serverLog, setServerLog] = useState<string | null>(null);
  const [lastBatch, setLastBatch] = useState<{
    processed: number;
    updated: number;
    failed: number;
    deleted: number;
    skipped: number;
  } | null>(null);
  const [totalsAuto, setTotalsAuto] = useState<{
    batches: number;
    updated: number;
    failed: number;
    deleted: number;
    skipped: number;
  } | null>(null);

  const [extensionReady, setExtensionReady] = useState<boolean | null>(null);
  const [extSyncBusy, setExtSyncBusy] = useState(false);
  const [extSyncSummary, setExtSyncSummary] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({
        page: String(page),
        perPage: String(perPage),
      });
      if (qApplied.trim()) sp.set("q", qApplied.trim());
      const res = await fetch(`/api/admin/products/ml-browser-sync-queue?${sp}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao carregar.");
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, perPage, qApplied]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let replied = false;
    function onMsg(event: MessageEvent) {
      if (event.source !== window) return;
      const d = event.data as Record<string, unknown> | null;
      if (!d || d.source !== EXT_MSG) return;

      if (d.type === "ZUNI_ML_SYNC_PING_REPLY") {
        replied = true;
        setExtensionReady(!!d.ok);
        return;
      }

      if (d.type === "ZUNI_ML_SYNC_RESPONSE") {
        setExtSyncBusy(false);
        if (d.ok) {
          const okCount = typeof d.okCount === "number" ? d.okCount : 0;
          const failCount = typeof d.failCount === "number" ? d.failCount : 0;
          setExtSyncSummary(`Extensão: ${okCount} atualizado(s), ${failCount} falha(s).`);
          void loadRef.current();
        } else {
          setExtSyncSummary(
            typeof d.error === "string" ? d.error : "Falha na sincronização pela extensão.",
          );
        }
      }
    }

    window.addEventListener("message", onMsg);
    window.postMessage({ source: ADMIN_MSG, type: "ZUNI_ML_SYNC_PING" }, "*");
    const t = window.setTimeout(() => {
      if (!replied) setExtensionReady(false);
    }, 1600);
    return () => {
      window.removeEventListener("message", onMsg);
      window.clearTimeout(t);
    };
  }, []);

  const openBatchInTabs = () => {
    const urls = items.map(mlUrl).filter(Boolean) as string[];
    if (!urls.length) return;
    setOpening(true);
    setOpenedCount(0);
    let i = 0;
    const step = () => {
      if (i >= urls.length) {
        setOpening(false);
        return;
      }
      window.open(urls[i], "_blank", "noopener,noreferrer");
      setOpenedCount(i + 1);
      i += 1;
      window.setTimeout(step, Math.max(200, delayMs));
    };
    step();
  };

  const runServerBatch = useCallback(async () => {
    const lim = Math.min(50, Math.max(1, batchSize));
    setServerBusy(true);
    setServerLog(null);
    try {
      const res = await fetch("/api/admin/products/sync-prices-ml-batch", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: lim }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setServerLog(data.error || `Erro HTTP ${res.status}`);
        return null;
      }
      const summary = {
        processed: Number(data.processed) || 0,
        updated: Number(data.updated) || 0,
        failed: Number(data.failed) || 0,
        deleted: Number(data.deleted) || 0,
        skipped: Number(data.skipped) || 0,
      };
      setLastBatch(summary);
      setServerLog(
        `Lote: ${summary.updated} atualizados, ${summary.failed} falhas, ${summary.deleted} removidos, ${summary.skipped} ignorados (${summary.processed} processados).`,
      );
      await loadRef.current();
      return { ...summary, moreLikely: !!data.moreLikely, processed: summary.processed };
    } catch (e) {
      setServerLog(e instanceof Error ? e.message : "Falha na requisição.");
      return null;
    } finally {
      setServerBusy(false);
    }
  }, [batchSize]);

  const stopAuto = () => {
    cancelAutoRef.current = true;
  };

  const runAllAutomatic = async () => {
    cancelAutoRef.current = false;
    setAutoRunning(true);
    setTotalsAuto({ batches: 0, updated: 0, failed: 0, deleted: 0, skipped: 0 });
    setServerLog("Modo automático: processando lotes até acabar a fila…");
    let batches = 0;
    let u = 0;
    let f = 0;
    let d = 0;
    let s = 0;
    try {
      while (!cancelAutoRef.current) {
        const lim = Math.min(50, Math.max(1, batchSize));
        const res = await fetch("/api/admin/products/sync-prices-ml-batch", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: lim }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setServerLog(data.error || `Erro HTTP ${res.status} (automático interrompido).`);
          break;
        }
        batches += 1;
        const pu = Number(data.updated) || 0;
        const pf = Number(data.failed) || 0;
        const pd = Number(data.deleted) || 0;
        const ps = Number(data.skipped) || 0;
        u += pu;
        f += pf;
        d += pd;
        s += ps;
        setTotalsAuto({ batches, updated: u, failed: f, deleted: d, skipped: s });
        setLastBatch({
          processed: Number(data.processed) || 0,
          updated: pu,
          failed: pf,
          deleted: pd,
          skipped: ps,
        });
        await loadRef.current();
        const proc = Number(data.processed) || 0;
        const more = !!data.moreLikely;
        if (proc === 0 || !more) {
          setServerLog(
            `Concluído: ${batches} lote(s), ${u} atualizados, ${f} falhas, ${d} removidos, ${s} ignorados.`,
          );
          break;
        }
        await sleep(600);
      }
    } finally {
      setAutoRunning(false);
      cancelAutoRef.current = false;
    }
  };

  const syncViaExtension = () => {
    const queue = items
      .map((row) => ({ id: row.id, url: mlUrl(row) }))
      .filter((x): x is { id: string; url: string } => !!x.url);
    if (!queue.length) return;
    setExtSyncSummary(null);
    setExtSyncBusy(true);
    window.postMessage({ source: ADMIN_MSG, type: "ZUNI_ML_SYNC_REQUEST", items: queue }, "*");
  };

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950">
        <p className="font-medium">Como usar</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-amber-900/90">
          <li>
            <strong>Servidor:</strong> cada lote busca o HTML do ML, interpreta preço normal e promocional
            no markup (buy box) e, se o Playwright estiver disponível, confere o DOM renderizado. Os
            produtos mais antigos por <code className="rounded bg-amber-100/80 px-1">updated_at</code> entram
            primeiro na fila.
          </li>
          <li>
            <strong>Sincronizar todos (automático):</strong> repete lotes do tamanho escolhido até não
            haver mais produtos ML pendentes na fila (ou até você parar).
          </li>
          <li>
            Abrir abas manualmente ainda força o PDP no navegador (útil para conferir). A extensão pode
            gravar preços lidos no PDP com o token de importação.
          </li>
        </ul>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 space-y-3">
        <p className="text-sm font-semibold text-zinc-800">Sincronização no servidor</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1 w-[120px]">
            <label className="text-xs font-medium text-zinc-600">Produtos por lote</label>
            <input
              type="number"
              min={1}
              max={50}
              value={batchSize}
              onChange={(e) => setBatchSize(parseInt(e.target.value, 10) || 10)}
              disabled={serverBusy || autoRunning}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={serverBusy || autoRunning}
            onClick={() => void runServerBatch()}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {serverBusy ? "Processando lote…" : "Rodar um lote"}
          </button>
          <button
            type="button"
            disabled={serverBusy || autoRunning}
            onClick={() => void runAllAutomatic()}
            className="rounded-lg bg-zuni-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
          >
            Sincronizar todos (automático)
          </button>
          {autoRunning && (
            <button
              type="button"
              onClick={stopAuto}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
            >
              Parar automático
            </button>
          )}
        </div>
        {serverLog && <p className="text-sm text-zinc-700">{serverLog}</p>}
        {totalsAuto && autoRunning === false && totalsAuto.batches > 0 && (
          <p className="text-xs text-zinc-600">
            Última sequência automática: {totalsAuto.batches} lote(s), total acumulado{" "}
            {totalsAuto.updated} ok / {totalsAuto.failed} falhas / {totalsAuto.deleted} removidos.
          </p>
        )}
        {lastBatch && !autoRunning && (
          <p className="text-xs text-zinc-500">
            Último lote: {lastBatch.processed} processados nesta requisição.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-zinc-600">Extensão:</span>
        {extensionReady === null && <span className="text-zinc-500">Verificando…</span>}
        {extensionReady === true && (
          <span className="font-medium text-green-700">Conectada</span>
        )}
        {extensionReady === false && (
          <span className="text-amber-800">
            Não detectada — use a página em /admin/sync-ml e recarregue após instalar a extensão.
          </span>
        )}
      </div>
      {extSyncSummary && (
        <p className="rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-800">{extSyncSummary}</p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex flex-1 flex-col gap-1 min-w-[200px]">
          <label className="text-xs font-medium text-zinc-600">Buscar por título</label>
          <input
            type="search"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setPage(1);
                setQApplied(qDraft.trim());
              }
            }}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            placeholder="Nome do produto…"
          />
        </div>
        <div className="flex flex-col gap-1 w-[120px]">
          <label className="text-xs font-medium text-zinc-600">Por página</label>
          <select
            value={perPage}
            onChange={(e) => {
              setPage(1);
              setPerPage(Number(e.target.value) as 25 | 50 | 100);
            }}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
        <div className="flex flex-col gap-1 w-[140px]">
          <label className="text-xs font-medium text-zinc-600">Intervalo abas (ms)</label>
          <input
            type="number"
            min={200}
            max={5000}
            step={50}
            value={delayMs}
            onChange={(e) => setDelayMs(parseInt(e.target.value, 10) || 450)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setPage(1);
            setQApplied(qDraft.trim());
          }}
          className="rounded-lg bg-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-300"
        >
          Aplicar filtro
        </button>
        <button
          type="button"
          disabled={opening || !items.length}
          onClick={openBatchInTabs}
          className="rounded-lg bg-zinc-600 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-500 disabled:opacity-50"
        >
          {opening ? `Abrindo… ${openedCount}/${items.length}` : `Abrir ${items.length} aba(s) (lista)`}
        </button>
        <button
          type="button"
          disabled={
            extSyncBusy ||
            !items.length ||
            extensionReady !== true ||
            !items.some((r) => mlUrl(r))
          }
          onClick={syncViaExtension}
          className="rounded-lg border-2 border-zuni-primary bg-white px-4 py-2 text-sm font-semibold text-zuni-primary hover:bg-zuni-purple-light/30 disabled:opacity-50"
        >
          {extSyncBusy ? "Sincronizando…" : "Extensão: lista atual"}
        </button>
      </div>

      {loading ? (
        <SitePageLoader />
      ) : (
        <>
          <p className="text-sm text-zinc-600">
            {total} produto(s) Mercado Livre na loja — página {page} de {totalPages} (ordenado por cadastro
            recente na listagem).
          </p>
          <div className="overflow-x-auto rounded-xl border border-zinc-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs font-semibold uppercase text-zinc-600">
                <tr>
                  <th className="px-3 py-2">Produto</th>
                  <th className="px-3 py-2">Preço</th>
                  <th className="px-3 py-2">Promo</th>
                  <th className="px-3 py-2">Oferta</th>
                  <th className="px-3 py-2">Atualizado</th>
                  <th className="px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const url = mlUrl(row);
                  return (
                    <tr key={row.id} className="border-t border-zinc-100">
                      <td className="px-3 py-2 max-w-[380px]">
                        <div className="font-medium text-zinc-900 line-clamp-2">{row.title}</div>
                        {url && (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-zuni-primary hover:underline break-all"
                          >
                            Abrir ML
                          </a>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-zinc-800">
                        {row.price != null ? formatBRL(Number(row.price)) : "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-green-700">
                        {row.promo_price != null ? formatBRL(Number(row.promo_price)) : "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-zinc-600">
                        {row.is_offer ? "Sim" : "Não"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-zinc-500">
                        {formatDate(row.updated_at)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Link
                          href={`/admin/produtos/${row.id}`}
                          className="text-xs font-medium text-zuni-primary hover:underline"
                        >
                          Editar
                        </Link>
                        {" · "}
                        <button
                          type="button"
                          disabled={!url}
                          onClick={() => url && window.open(url, "_blank", "noopener,noreferrer")}
                          className="text-xs font-medium text-zuni-primary hover:underline disabled:opacity-40"
                        >
                          Aba
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </>
      )}
    </div>
  );
}
