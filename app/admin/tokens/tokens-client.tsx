"use client";

import { useEffect, useState } from "react";

type TokenRow = {
  id: string;
  name: string;
  active: boolean;
  last_used_at: string | null;
  created_at: string;
};

export function TokensClient() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [name, setName] = useState("Extensão");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/tokens").catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    setTokens(Array.isArray(data?.tokens) ? data.tokens : []);
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    setBusy(true);
    setCreatedToken(null);
    const res = await fetch("/api/admin/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    setBusy(false);

    if (!res || !res.ok) {
      alert("Falha ao criar token.");
      return;
    }
    const data = await res.json().catch(() => null);
    setCreatedToken(data?.token ?? null);
    await load();
  }

  async function revoke(id: string) {
    if (!confirm("Revogar este token?")) return;
    const res = await fetch(`/api/admin/tokens/${id}/revoke`, { method: "POST" }).catch(() => null);
    if (!res || !res.ok) {
      alert("Falha ao revogar token.");
      return;
    }
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-200 p-4 space-y-2">
        <div className="text-sm font-semibold">Criar token</div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm w-64"
            placeholder="Nome do token"
          />
          <button
            disabled={busy || !name.trim()}
            onClick={create}
            className="rounded-full bg-zuni-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Criar
          </button>
        </div>
        {createdToken ? (
          <div className="text-sm bg-white border border-zinc-200 rounded-xl px-3 py-2">
            <div className="text-xs text-zinc-600 mb-1">Copie agora (será mostrado só 1 vez):</div>
            <div className="font-mono break-all">{createdToken}</div>
          </div>
        ) : null}
      </div>

      <div className="overflow-auto rounded-2xl ring-1 ring-zinc-200">
        <table className="min-w-[700px] w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-700">
            <tr>
              <th className="p-3 text-left">Nome</th>
              <th className="p-3 text-left">Ativo</th>
              <th className="p-3 text-left">Último uso</th>
              <th className="p-3 text-left">Criado em</th>
              <th className="p-3 text-left">Ações</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t.id} className="border-t border-zinc-100">
                <td className="p-3 font-semibold">{t.name}</td>
                <td className="p-3">{t.active ? "sim" : "não"}</td>
                <td className="p-3 text-zinc-600">
                  {t.last_used_at ? new Date(t.last_used_at).toLocaleString("pt-BR") : "—"}
                </td>
                <td className="p-3 text-zinc-600">
                  {t.created_at ? new Date(t.created_at).toLocaleString("pt-BR") : "—"}
                </td>
                <td className="p-3">
                  {t.active ? (
                    <button
                      onClick={() => revoke(t.id)}
                      className="text-zuni-red font-semibold hover:underline"
                    >
                      Revogar
                    </button>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </td>
              </tr>
            ))}
            {!tokens.length ? (
              <tr>
                <td className="p-3 text-zinc-600" colSpan={5}>
                  Nenhum token ainda.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

