"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SitePageLoader } from "@/components/SitePageLoader";
import {
  buildCategoryTree,
  collectDescendantCategoryIds,
  getCategoryBreadcrumbTrail,
  type CategoryTreeNode,
} from "@/lib/categories-tree";

type Category = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  is_seed?: boolean;
  show_in_header?: boolean;
  created_at?: string;
  product_count?: number;
};

function parentSelectOptions(list: Category[], excludeSubtreeOf: string | null): { id: string; label: string }[] {
  const blocked = new Set<string>();
  if (excludeSubtreeOf) {
    blocked.add(excludeSubtreeOf);
    const flat = list.map((c) => ({ id: c.id, parent_id: c.parent_id }));
    for (const id of collectDescendantCategoryIds(excludeSubtreeOf, flat)) blocked.add(id);
  }
  const opts = list
    .filter((c) => !blocked.has(c.id))
    .map((c) => ({
      id: c.id,
      label: getCategoryBreadcrumbTrail(c.id, list)
        .map((x) => x.name)
        .join(" › "),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt"));
  return [{ id: "", label: "— Sem pai (categoria raiz) —" }, ...opts];
}

export function CategoriesClient() {
  const [list, setList] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [parentIdForNew, setParentIdForNew] = useState("");
  const [showNewInHeader, setShowNewInHeader] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editParentId, setEditParentId] = useState("");
  const [togglingHeaderId, setTogglingHeaderId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const byId = useMemo(() => Object.fromEntries(list.map((c) => [c.id, c])), [list]);
  const tree = useMemo(() => buildCategoryTree(list), [list]);
  const deletableFlat = useMemo(() => {
    const out: Category[] = [];
    function walk(n: CategoryTreeNode[]) {
      for (const x of n) {
        out.push(x);
        if (x.children.length) walk(x.children);
      }
    }
    walk(tree);
    return out;
  }, [tree]);
  const deletableSorted = useMemo(() => deletableFlat.filter((c) => !c.is_seed), [deletableFlat]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev };
      for (const c of list) {
        if (next[c.id] === undefined) next[c.id] = true;
      }
      return next;
    });
  }, [list]);

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

  const scrollToNewForm = useCallback(() => {
    document.getElementById("nova-categoria-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
        parent_id: parentIdForNew.trim() || undefined,
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
    setParentIdForNew("");
    setShowNewInHeader(false);
    setMessage("Categoria criada.");
    load();
  }

  function startEdit(c: Category) {
    setEditingId(c.id);
    setEditName(c.name);
    setEditSlug(c.slug);
    setEditParentId(c.parent_id ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditSlug("");
    setEditParentId("");
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const c = byId[editingId];
    setBusy(true);
    setMessage(null);
    const body: Record<string, unknown> = {
      name: editName.trim(),
      slug: editSlug.trim() || undefined,
    };
    if (!c?.is_seed) {
      body.parent_id = editParentId.trim() ? editParentId.trim() : null;
    }
    const res = await fetch(`/api/admin/categories/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage(data?.error ?? "Erro ao atualizar.");
      return;
    }
    setMessage("Atualizado.");
    cancelEdit();
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
    setSelectedIds((prev) => prev.filter((x) => x !== id));
    load();
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function selectAllDeletable() {
    setSelectedIds(deletableSorted.map((c) => c.id));
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) return;
    if (
      !confirm(
        `Excluir ${selectedIds.length} categoria(s)? Não é possível excluir as que tiverem produtos vinculados.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/categories/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !data?.ok) {
      setMessage(data?.error ?? "Erro na exclusão em lote.");
      return;
    }
    const deleted: string[] = Array.isArray(data.deleted) ? data.deleted : [];
    const failed: { id: string; error: string }[] = Array.isArray(data.failed) ? data.failed : [];
    const parts: string[] = [];
    if (deleted.length > 0) parts.push(`${deleted.length} excluída(s).`);
    if (failed.length > 0) {
      const sample = failed.slice(0, 5).map((f) => `${byId[f.id]?.name ?? f.id}: ${f.error}`);
      const more = failed.length > 5 ? ` (+${failed.length - 5} outras)` : "";
      parts.push(`${failed.length} não excluída(s). ${sample.join("; ")}${more}`);
    }
    setMessage(parts.join(" ") || "Concluído.");
    if (failed.length > 0) {
      setSelectedIds(failed.map((f) => f.id));
    } else {
      setSelectedIds([]);
    }
    for (const id of deleted) {
      if (editingId === id) cancelEdit();
    }
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

  function toggleExpanded(id: string) {
    setExpanded((s) => ({ ...s, [id]: !s[id] }));
  }

  function startSubcategory(parentId: string) {
    setParentIdForNew(parentId);
    setName("");
    setSlug("");
    setShowNewInHeader(false);
    scrollToNewForm();
  }

  const editParentOptions = editingId ? parentSelectOptions(list, editingId) : [];

  return (
    <div className="space-y-6 relative">
      <form
        id="nova-categoria-form"
        onSubmit={handleCreate}
        className="rounded-2xl bg-zinc-50 p-4 space-y-3 max-w-lg scroll-mt-4"
      >
        <h2 className="text-sm font-semibold text-zinc-700">Nova categoria</h2>
        <p className="text-xs text-zinc-500">
          Escolha o pai para criar uma <strong>subcategoria</strong>, ou deixe em raiz. Use «+ Sub» na árvore para
          pré-preencher o pai.
        </p>
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">Pai (opcional)</label>
          <select
            value={parentIdForNew}
            onChange={(e) => setParentIdForNew(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            disabled={busy}
          >
            {parentSelectOptions(list, null).map((o, i) => (
              <option key={o.id ? o.id : `root-${i}`} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">Nome</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Smartphones"
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
        <p
          className={`text-sm ${
            message.includes("Erro") || message.includes("não excluída")
              ? "text-red-600"
              : "text-zinc-600"
          }`}
        >
          {message}
        </p>
      )}

      <div>
        <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-700">Árvore de categorias</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Hierarquia completa. Passe o mouse no site: cada item do cabeçalho abre as subcategorias reais do banco.
            </p>
          </div>
          <button
            type="button"
            className="text-xs text-zuni-primary hover:underline"
            onClick={() => {
              const all: Record<string, boolean> = {};
              for (const c of list) all[c.id] = true;
              setExpanded(all);
            }}
          >
            Expandir tudo
          </button>
        </div>

        {!loading && deletableSorted.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 mb-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
            <span className="text-zinc-600">
              Selecionadas: <span className="font-semibold text-zinc-900">{selectedIds.length}</span>
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={selectAllDeletable}
              className="text-xs font-medium text-zuni-primary hover:underline disabled:opacity-50"
            >
              Marcar todas (exceto seed)
            </button>
            <button
              type="button"
              disabled={busy || selectedIds.length === 0}
              onClick={clearSelection}
              className="text-xs font-medium text-zinc-600 hover:underline disabled:opacity-50"
            >
              Limpar
            </button>
            <button
              type="button"
              disabled={busy || selectedIds.length === 0}
              onClick={handleBulkDelete}
              className="ml-auto rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Excluir selecionadas
            </button>
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-zinc-500">Carregando…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma categoria.</p>
        ) : (
          <ul className="rounded-2xl border border-zinc-200 bg-white overflow-hidden divide-y divide-zinc-100">
            <CategoryTreeRows
              nodes={tree}
              depth={0}
              editingId={editingId}
              editName={editName}
              editSlug={editSlug}
              editParentId={editParentId}
              setEditName={setEditName}
              setEditSlug={setEditSlug}
              setEditParentId={setEditParentId}
              editParentOptions={editParentOptions}
              onSubmitEdit={handleUpdate}
              onCancelEdit={cancelEdit}
              busy={busy}
              expanded={expanded}
              toggleExpanded={toggleExpanded}
              selectedSet={selectedSet}
              toggleSelect={toggleSelect}
              togglingHeaderId={togglingHeaderId}
              onToggleHeader={handleToggleHeader}
              startEdit={startEdit}
              onDelete={handleDelete}
              onAddSub={startSubcategory}
            />
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

function CategoryTreeRows({
  nodes,
  depth,
  editingId,
  editName,
  editSlug,
  editParentId,
  setEditName,
  setEditSlug,
  setEditParentId,
  editParentOptions,
  onSubmitEdit,
  onCancelEdit,
  busy,
  expanded,
  toggleExpanded,
  selectedSet,
  toggleSelect,
  togglingHeaderId,
  onToggleHeader,
  startEdit,
  onDelete,
  onAddSub,
}: {
  nodes: CategoryTreeNode[];
  depth: number;
  editingId: string | null;
  editName: string;
  editSlug: string;
  editParentId: string;
  setEditName: (v: string) => void;
  setEditSlug: (v: string) => void;
  setEditParentId: (v: string) => void;
  editParentOptions: { id: string; label: string }[];
  onSubmitEdit: (e: React.FormEvent) => void;
  onCancelEdit: () => void;
  busy: boolean;
  expanded: Record<string, boolean>;
  toggleExpanded: (id: string) => void;
  selectedSet: Set<string>;
  toggleSelect: (id: string) => void;
  togglingHeaderId: string | null;
  onToggleHeader: (id: string, next: boolean) => void;
  startEdit: (c: Category) => void;
  onDelete: (id: string) => void;
  onAddSub: (parentId: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        const c = node as Category;
        const hasKids = node.children.length > 0;
        const isOpen = expanded[node.id] !== false;

        return (
          <li key={node.id} className="list-none">
            <div
              className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4 bg-white hover:bg-zinc-50/80"
              style={{ paddingLeft: `${12 + depth * 18}px` }}
            >
              {hasKids ? (
                <button
                  type="button"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                  aria-expanded={isOpen}
                  onClick={() => toggleExpanded(node.id)}
                  title={isOpen ? "Recolher" : "Expandir"}
                >
                  <span className="text-xs font-bold">{isOpen ? "−" : "+"}</span>
                </button>
              ) : (
                <span className="inline-block w-7 shrink-0" aria-hidden />
              )}

              {!c.is_seed ? (
                <label className="flex w-5 shrink-0 cursor-pointer items-center justify-center">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(c.id)}
                    disabled={busy}
                    onChange={() => toggleSelect(c.id)}
                    className="rounded border-zinc-300"
                  />
                </label>
              ) : (
                <span className="w-5 shrink-0" aria-hidden />
              )}

              {editingId === c.id ? (
                <form onSubmit={onSubmitEdit} className="flex flex-1 flex-wrap items-end gap-2 min-w-0">
                  <div>
                    <label className="block text-[10px] text-zinc-500">Nome</label>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="rounded-lg border border-zinc-200 px-2 py-1 text-sm w-36 sm:w-44"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-500">Slug</label>
                    <input
                      value={editSlug}
                      onChange={(e) => setEditSlug(e.target.value)}
                      className="rounded-lg border border-zinc-200 px-2 py-1 text-sm w-28 sm:w-36"
                    />
                  </div>
                  {!c.is_seed ? (
                    <div className="min-w-[10rem] flex-1">
                      <label className="block text-[10px] text-zinc-500">Pai</label>
                      <select
                        value={editParentId}
                        onChange={(e) => setEditParentId(e.target.value)}
                        className="w-full max-w-xs rounded-lg border border-zinc-200 px-2 py-1 text-xs"
                      >
                        {editParentOptions.map((o, i) => (
                          <option key={o.id ? o.id : `ep-${i}`} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-full bg-zuni-primary px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs"
                  >
                    Cancelar
                  </button>
                </form>
              ) : (
                <>
                  <div className="flex-1 min-w-[160px] space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-zinc-900">{c.name}</span>
                      <span
                        className="text-xs tabular-nums text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full"
                        title="Produtos com esta categoria"
                      >
                        {typeof c.product_count === "number" ? c.product_count : "—"} prod.
                      </span>
                      {c.is_seed ? (
                        <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">seed</span>
                      ) : null}
                    </div>
                    <div className="text-xs text-zinc-500 font-mono">/{c.slug}</div>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-zinc-700 shrink-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(c.show_in_header)}
                      disabled={togglingHeaderId === c.id}
                      onChange={(e) => onToggleHeader(c.id, e.target.checked)}
                    />
                    Cabeçalho
                  </label>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onAddSub(c.id)}
                      className="text-xs font-medium text-zuni-primary hover:underline"
                    >
                      + Sub
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(c)}
                      className="text-xs text-zinc-600 hover:underline"
                    >
                      Editar
                    </button>
                    {!c.is_seed ? (
                      <button
                        type="button"
                        onClick={() => onDelete(c.id)}
                        disabled={busy}
                        className="text-xs text-red-600 hover:underline disabled:opacity-50"
                      >
                        Excluir
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </div>
            {hasKids && isOpen ? (
              <ul className="border-t border-zinc-100">
                <CategoryTreeRows
                  nodes={node.children}
                  depth={depth + 1}
                  editingId={editingId}
                  editName={editName}
                  editSlug={editSlug}
                  editParentId={editParentId}
                  setEditName={setEditName}
                  setEditSlug={setEditSlug}
                  setEditParentId={setEditParentId}
                  editParentOptions={editParentOptions}
                  onSubmitEdit={onSubmitEdit}
                  onCancelEdit={onCancelEdit}
                  busy={busy}
                  expanded={expanded}
                  toggleExpanded={toggleExpanded}
                  selectedSet={selectedSet}
                  toggleSelect={toggleSelect}
                  togglingHeaderId={togglingHeaderId}
                  onToggleHeader={onToggleHeader}
                  startEdit={startEdit}
                  onDelete={onDelete}
                  onAddSub={onAddSub}
                />
              </ul>
            ) : null}
          </li>
        );
      })}
    </>
  );
}
