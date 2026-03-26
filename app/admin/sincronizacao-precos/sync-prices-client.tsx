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
};

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function mlUrl(row: Row): string | null {
  const u = row.source_url || row.affiliate_url;
  if (!u || !/mercadolivre\.com\.br/i.test(String(u))) return null;
  return String(u);
}

export function SyncPricesClient() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const perPage = 20;
  const [qDraft, setQDraft] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [openedCount, setOpenedCount] = useState(0);
  const [delayMs, setDelayMs] = useState(450);
  /** null = ainda testando; true/false = ponte da extensão respondeu */
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
            O servidor (cron) continua sincronizando via HTML/Playwright. Quando o SSR do ML traz
            classes de preço erradas, o sync passa a priorizar o valor de{" "}
            <code className="rounded bg-amber-100/80 px-1">meta itemprop=&quot;price&quot;</code> quando
            detecta dessincronia com fraction/cents.
          </li>
          <li>
            Esta página abre as páginas do Mercado Livre no <strong>seu</strong> navegador (novas abas,
            em sequência). Isso força o carregamento real do PDP (JavaScript, preços hidratados). O
            painel não lê o conteúdo dessas abas (limite de segurança do navegador); use para conferir
            preços ou manter cache “quente” antes de rodar o sync no servidor.
          </li>
          <li>
            Se o navegador bloquear janelas, permita pop-ups para este site e clique de novo no botão.
          </li>
          <li>
            <strong>Extensão ZuniStore Importer (v1.1+):</strong> instale a pasta{" "}
            <code className="rounded bg-amber-100/80 px-1">zunistore-importer</code>, configure URL base
            e o mesmo <strong>token</strong> de importação em Opções. Use &quot;Sincronizar via
            extensão&quot; para abrir cada PDP em aba oculta, ler preços como na importação e gravar na
            API. Se o site não for localhost:3000, Vercel ou zunistore.com.br, adicione o padrão da URL
            em <code className="rounded bg-amber-100/80 px-1">manifest.json</code> (content_scripts do{" "}
            <code className="rounded bg-amber-100/80 px-1">admin_bridge.js</code>).
          </li>
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-zinc-600">Extensão:</span>
        {extensionReady === null && <span className="text-zinc-500">Verificando…</span>}
        {extensionReady === true && (
          <span className="font-medium text-green-700">Conectada (bridge + token nas opções)</span>
        )}
        {extensionReady === false && (
          <span className="text-amber-800">
            Não detectada nesta página — recarregue após instalar ou ajuste o manifest para esta URL.
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
        <div className="flex flex-col gap-1 w-[140px]">
          <label className="text-xs font-medium text-zinc-600">Intervalo (ms)</label>
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
          className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
        >
          Aplicar filtro
        </button>
        <button
          type="button"
          disabled={opening || !items.length}
          onClick={openBatchInTabs}
          className="rounded-lg bg-zuni-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
        >
          {opening ? `Abrindo… ${openedCount}/${items.length}` : `Abrir ${items.length} aba(s) desta página`}
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
          {extSyncBusy ? "Sincronizando via extensão…" : "Sincronizar via extensão (esta página)"}
        </button>
      </div>

      {loading ? (
        <SitePageLoader />
      ) : (
        <>
          <p className="text-sm text-zinc-600">
            {total} produto(s) Mercado Livre — página {page} de {totalPages}
          </p>
          <div className="overflow-x-auto rounded-xl border border-zinc-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs font-semibold uppercase text-zinc-600">
                <tr>
                  <th className="px-3 py-2">Produto</th>
                  <th className="px-3 py-2">Preço / promo</th>
                  <th className="px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const url = mlUrl(row);
                  return (
                    <tr key={row.id} className="border-t border-zinc-100">
                      <td className="px-3 py-2 max-w-[420px]">
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
                      <td className="px-3 py-2 whitespace-nowrap text-zinc-700">
                        {row.price != null ? formatBRL(Number(row.price)) : "—"}
                        {row.promo_price != null && (
                          <span className="block text-xs text-green-700">
                            promo {formatBRL(Number(row.promo_price))}
                          </span>
                        )}
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
                          Nova aba
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
