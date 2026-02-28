"use client";

import { useEffect, useState } from "react";

type Row = {
  id: string;
  icon: string;
  url: string;
  color: string | null;
  sort_order: number;
};

export function SocialLinksClient() {
  const [items, setItems] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ icon: "Instagram", url: "", color: "", sort_order: "0" });

  async function load() {
    const res = await fetch("/api/admin/social-links").catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    setItems(Array.isArray(data?.items) ? data.items : []);
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    setBusy(true);
    const res = await fetch("/api/admin/social-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        icon: draft.icon,
        url: draft.url,
        color: draft.color ? draft.color : null,
        sort_order: Number(draft.sort_order || 0),
      }),
    }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) return alert("Falha ao salvar.");
    setDraft({ icon: "Instagram", url: "", color: "", sort_order: "0" });
    await load();
  }

  async function update(id: string, patch: Partial<Row>) {
    setBusy(true);
    const current = items.find((x) => x.id === id);
    const next = { ...current, ...patch } as Row;
    const res = await fetch(`/api/admin/social-links/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) return alert("Falha ao atualizar.");
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Remover este link?")) return;
    setBusy(true);
    const res = await fetch(`/api/admin/social-links/${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) return alert("Falha ao remover.");
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-200 p-4 space-y-2">
        <div className="text-sm font-semibold">Adicionar</div>
        <div className="grid gap-2 md:grid-cols-4">
          <input
            value={draft.icon}
            onChange={(e) => setDraft((s) => ({ ...s, icon: e.target.value }))}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            placeholder="Ícone (texto)"
          />
          <input
            value={draft.url}
            onChange={(e) => setDraft((s) => ({ ...s, url: e.target.value }))}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-mono"
            placeholder="https://..."
          />
          <input
            value={draft.color}
            onChange={(e) => setDraft((s) => ({ ...s, color: e.target.value }))}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-mono"
            placeholder="#RRGGBB (opcional)"
          />
          <input
            value={draft.sort_order}
            onChange={(e) => setDraft((s) => ({ ...s, sort_order: e.target.value }))}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            placeholder="Ordem"
          />
        </div>
        <button
          disabled={busy || !draft.url.trim()}
          onClick={create}
          className="rounded-full bg-zuni-primary px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Salvar
        </button>
      </div>

      <div className="overflow-auto rounded-2xl ring-1 ring-zinc-200">
        <table className="min-w-[800px] w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-700">
            <tr>
              <th className="p-3 text-left">Ícone</th>
              <th className="p-3 text-left">URL</th>
              <th className="p-3 text-left">Cor</th>
              <th className="p-3 text-left">Ordem</th>
              <th className="p-3 text-left">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-t border-zinc-100">
                <td className="p-3">
                  <input
                    defaultValue={it.icon}
                    onBlur={(e) => update(it.id, { icon: e.target.value })}
                    className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  />
                </td>
                <td className="p-3">
                  <input
                    defaultValue={it.url}
                    onBlur={(e) => update(it.id, { url: e.target.value })}
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-mono"
                  />
                </td>
                <td className="p-3">
                  <input
                    defaultValue={it.color ?? ""}
                    onBlur={(e) => update(it.id, { color: e.target.value || null })}
                    className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-mono"
                  />
                </td>
                <td className="p-3">
                  <input
                    defaultValue={String(it.sort_order)}
                    onBlur={(e) => update(it.id, { sort_order: Number(e.target.value || 0) })}
                    className="w-24 rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  />
                </td>
                <td className="p-3">
                  <button onClick={() => remove(it.id)} className="text-zuni-red font-semibold hover:underline">
                    Remover
                  </button>
                </td>
              </tr>
            ))}
            {!items.length ? (
              <tr>
                <td colSpan={5} className="p-3 text-zinc-600">
                  Nenhum link ainda.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

