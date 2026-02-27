"use client";

import { useState } from "react";

export default function Home() {
  const [itemInput, setItemInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [affiliateUrl, setAffiliateUrl] = useState<string | null>(null);

  async function handleSync(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    setAffiliateUrl(null);

    try {
      const res = await fetch("/api/ml/products/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item: itemInput }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Falha ao sincronizar produto.");
      }

      setMessage("Produto sincronizado com sucesso.");
      setAffiliateUrl(data.product?.affiliateUrl ?? null);
    } catch (err: any) {
      setError(err.message ?? "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!affiliateUrl) return;
    navigator.clipboard.writeText(affiliateUrl).catch(() => {});
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center px-4">
      <main className="w-full max-w-xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            ZuniStore · Afiliados Mercado Livre
          </h1>
          <p className="text-zinc-400 text-sm">
            Conecte sua conta do Mercado Livre, informe o ID ou URL de um anúncio
            e gere o link de afiliado automaticamente.
          </p>
        </header>

        <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-zinc-100">
                Conexão com o Mercado Livre
              </p>
              <p className="text-xs text-zinc-400">
                Clique para autorizar o acesso via OAuth e salvar o token.
              </p>
            </div>
            <a
              href="/api/ml/auth"
              className="inline-flex items-center justify-center rounded-full bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 transition-colors"
            >
              Conectar conta
            </a>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <form onSubmit={handleSync} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-100">
                ID ou URL do anúncio
              </label>
              <input
                value={itemInput}
                onChange={(e) => setItemInput(e.target.value)}
                placeholder="Ex: MLB123456789 ou https://produto.mercadolivre.com.br/MLB..."
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !itemInput.trim()}
              className="inline-flex w-full items-center justify-center rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
            >
              {loading ? "Sincronizando..." : "Sincronizar produto"}
            </button>
          </form>

          {message && (
            <p className="text-sm text-emerald-400 border border-emerald-500/40 bg-emerald-500/10 rounded-lg px-3 py-2">
              {message}
            </p>
          )}

          {error && (
            <p className="text-sm text-red-400 border border-red-500/40 bg-red-500/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {affiliateUrl && (
            <div className="space-y-2 pt-2 border-t border-zinc-800">
              <p className="text-sm font-medium text-zinc-100">
                Link de afiliado gerado
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-300 break-all">
                  {affiliateUrl}
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center justify-center rounded-full bg-zinc-100 px-4 py-2 text-xs font-medium text-zinc-900 hover:bg-white transition-colors"
                >
                  Copiar
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
