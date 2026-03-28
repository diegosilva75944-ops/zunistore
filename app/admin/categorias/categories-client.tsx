"use client";

import { useEffect, useMemo, useState } from "react";
import { SitePageLoader } from "@/components/SitePageLoader";

type Category = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  is_seed?: boolean;
  show_in_header?: boolean;
  created_at?: string;
};

export function CategoriesClient() {
  const [list, setList] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [showNewInHeader, setShowNewInHeader] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [togglingHeaderId, setTogglingHeaderId] = useState<string | null>(null);

  const byId = useMemo(() => Object.fromEntries(list.map((c) => [c.id, c])), [list]);
  const sorted = useMemo(
    () => [...list].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [list],
  );

  function load() {
    setLoading(true);
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((data) => {
        setList(Array.isArray(data) ? data : []);
      })
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        slug: slug.trim() || undefined,
        show_in_header: showNewInHeader,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage(data?.error ?? "Erro ao criar.");
      return;
    }
    setName("");
    setSlug("");
    setShowNewInHeader(false);
    setMessage("Categoria criada.");
    load();
  }

  function startEdit(c: Category) {
    setEditingId(c.id);
    setEditName(c.name);
    setEditSlug(c.slug);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditSlug("");
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/admin/categories/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), slug: editSlug.trim() || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage(data?.error ?? "Erro ao atualizar.");
      return;
    }
    setMessage("Atualizado.");
    setEditingId(null);
    setEditName("");
    setEditSlug("");
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta categoria? Não é possível se houver produtos vinculados.")) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/admin/categories/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage(data?.error ?? "Erro ao excluir.");
      return;
    }
    setMessage("Categoria excluída.");
    if (editingId === id) cancelEdit();
    load();
  }

  async function handleToggleHeader(id: string, next: boolean) {
    setTogglingHeaderId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ show_in_header: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data?.error ?? "Erro ao atualizar cabeçalho.");
        return;
      }
      load();
    } finally {
      setTogglingHeaderId(null);
    }
  }

  return (
    <div className="space-y-6 relative">
      <form onSubmit={handleCreate} className="rounded-2xl bg-zinc-50 p-4 space-y-3 max-w-md">
        <h2 className="text-sm font-semibold text-zinc-700">Nova categoria</h2>
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">Nome</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Eletrônicos"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            disabled={busy}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">Slug (opcional)</label>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="Minúsculas e traços; vazio gera do nome"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            disabled={busy}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={showNewInHeader}
            onChange={(e) => setShowNewInHeader(e.target.checked)}
            disabled={busy}
          />
          Mostrar no cabeçalho do site
        </label>
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded-full bg-zuni-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
        >
          Cadastrar
        </button>
      </form>

      {message && (
        <p className={`text-sm ${message.includes("Erro") ? "text-red-600" : "text-zinc-600"}`}>
          {message}
        </p>
      )}

      <div>
        <h2 className="text-sm font-semibold text-zinc-700 mb-2">Categorias cadastradas</h2>
        <p className="text-xs text-zinc-500 mb-3">
          Importações do ML criam subcategorias com slug em minúsculas; elas não vão ao cabeçalho até você marcar abaixo.
        </p>
        {loading ? (
          <p className="text-sm text-zinc-500">Carregando…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma categoria.</p>
        ) : (
          <ul className="space-y-2">
            {sorted.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3"
              >
                {editingId === c.id ? (
                  <form onSubmit={handleUpdate} className="flex flex-wrap items-end gap-2 flex-1">
                    <div>
                      <label className="block text-xs text-zinc-500">Nome</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="rounded-lg border border-zinc-200 px-2 py-1 text-sm w-40"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500">Slug</label>
                      <input
                        type="text"
                        value={editSlug}
                        onChange={(e) => setEditSlug(e.target.value)}
                        className="rounded-lg border border-zinc-200 px-2 py-1 text-sm w-32"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busy}
                      className="rounded-full bg-zuni-primary px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs"
                    >
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="flex-1 min-w-[200px] space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{c.name}</span>
                        {c.is_seed ? (
                          <span className="text-xs bg-zinc-200 text-zinc-600 px-2 py-0.5 rounded">seed</span>
                        ) : null}
                      </div>
                      <div className="text-xs text-zinc-500">
                        /{c.slug}
                        {c.parent_id && byId[c.parent_id] ? (
                          <span className="text-zinc-400"> · em «{byId[c.parent_id].name}»</span>
                        ) : null}
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-zinc-700 shrink-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(c.show_in_header)}
                        disabled={togglingHeaderId === c.id}
                        onChange={(e) => handleToggleHeader(c.id, e.target.checked)}
                      />
                      Cabeçalho
                    </label>
                    {!c.is_seed && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEdit(c)}
                          className="text-xs text-zuni-primary hover:underline"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(c.id)}
                          disabled={busy}
                          className="text-xs text-red-600 hover:underline disabled:opacity-50"
                        >
                          Excluir
                        </button>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {busy ? (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center bg-white/50 backdrop-blur-md"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <SitePageLoader compact />
        </div>
      ) : null}
    </div>
  );
}
