"use client";

import { useState } from "react";

export function AdminLoginClient({ nextPath }: { nextPath: string }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).catch(() => null);

    if (!res) {
      setError("Falha de rede.");
      setLoading(false);
      return;
    }

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error || "Falha ao entrar.");
      setLoading(false);
      return;
    }

    window.location.href = nextPath;
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white ring-1 ring-zinc-200 p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Admin · ZuniStore</h1>
          <p className="text-sm text-zinc-600">Entre com seu usuário e senha.</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-zinc-700">Usuário</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-700">Senha</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>

          {error ? (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {error}
            </div>
          ) : null}

          <button
            disabled={loading}
            className="w-full rounded-full bg-zuni-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <div className="text-xs text-zinc-500">
          Senha inicial (seed): <span className="font-mono">Diego6412@</span>
        </div>
      </div>
    </div>
  );
}

