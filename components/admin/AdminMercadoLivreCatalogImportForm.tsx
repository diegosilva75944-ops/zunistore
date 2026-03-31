"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

export function AdminMercadoLivreCatalogImportForm() {
  const [sourceUrl, setSourceUrl] = useState("");
  const [affiliateUrl, setAffiliateUrl] = useState("");
  const [affiliateCode, setAffiliateCode] = useState("ml_ext");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    productUrl: string;
    action: string;
    code6: string;
  } | null>(null);

  const submit = useCallback(async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/import/mercadolivre-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sourceUrl: sourceUrl.trim(),
          affiliateUrl: affiliateUrl.trim(),
          affiliateCode: affiliateCode.trim() || "ml_ext",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Erro ${res.status}`);
      }
      setSuccess({
        productUrl: data.productUrl as string,
        action: data.action as string,
        code6: data.code6 as string,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sourceUrl, affiliateUrl, affiliateCode]);

  const actionLabel =
    success?.action === "created"
      ? "Produto criado."
      : success?.action === "updated_existing"
        ? "Produto atualizado."
        : success?.action === "already_exists"
          ? "Já existia no catálogo (nenhuma alteração obrigatória aplicada)."
          : success?.action;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 md:p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-amber-950">Importar pelo painel (Mercado Livre)</h2>
        <p className="text-xs text-amber-900/80 mt-1">
          Cole a URL pública da página do produto (ex.: <span className="font-mono">produto.mercadolivre.com.br/MLB-…</span>,{" "}
          <span className="font-mono">…/p/MLB…</span>, <span className="font-mono">meli.la/…</span> ou{" "}
          <span className="font-mono">…/up/MLBU…</span> — se o link tiver <span className="font-mono">#wid=MLB…</span>, inclua) e o
          link de afiliado usado no botão Comprar. O pipeline é o mesmo da extensão (HTML + preço, descrição, galeria).
        </p>
      </div>
      <div className="space-y-2">
        <label className="block text-xs font-medium text-zinc-700">URL da página do produto (source)</label>
        <textarea
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          rows={2}
          disabled={loading}
          className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-mono text-zinc-900 placeholder:text-zinc-400 focus:border-zuni-primary focus:outline-none focus:ring-2 focus:ring-zuni-primary/30"
          placeholder="https://produto.mercadolivre.com.br/MLB-…"
        />
      </div>
      <div className="space-y-2">
        <label className="block text-xs font-medium text-zinc-700">Link de afiliado (Comprar)</label>
        <textarea
          value={affiliateUrl}
          onChange={(e) => setAffiliateUrl(e.target.value)}
          rows={2}
          disabled={loading}
          className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-mono text-zinc-900 placeholder:text-zinc-400 focus:border-zuni-primary focus:outline-none focus:ring-2 focus:ring-zuni-primary/30"
          placeholder="https://www.mercadolivre.com.br/… ou https://meli.la/…"
        />
      </div>
      <div className="space-y-2">
        <label className="block text-xs font-medium text-zinc-700">Código de afiliado (opcional)</label>
        <input
          type="text"
          value={affiliateCode}
          onChange={(e) => setAffiliateCode(e.target.value)}
          disabled={loading}
          className="w-full max-w-md rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-mono text-zinc-900 focus:border-zuni-primary focus:outline-none focus:ring-2 focus:ring-zuni-primary/30"
        />
      </div>
      <button
        type="button"
        disabled={loading || !sourceUrl.trim() || !affiliateUrl.trim()}
        onClick={submit}
        className="rounded-xl bg-zuni-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
      >
        {loading ? "Importando…" : "Importar para o catálogo"}
      </button>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 space-y-2">
          <p>{actionLabel}</p>
          <p>
            <Link href={success.productUrl} className="font-semibold text-zuni-primary underline">
              Abrir produto no site ({success.code6})
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
