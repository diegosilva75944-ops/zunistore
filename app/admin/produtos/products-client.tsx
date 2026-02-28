"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

type Category = { id: string; name: string };

type ProductRow = {
  id: string;
  code6: string;
  slug: string;
  title: string;
  images: string[] | null;
  off_percent: number | null;
  affiliate_url: string;
  needs_update: boolean;
  categories?: { id: string; name: string } | null;
};

export function ProductsClient({
  categories,
  initialItems,
}: {
  categories: Category[];
  initialItems: ProductRow[];
}) {
  const [items] = useState<ProductRow[]>(initialItems);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [action, setAction] = useState<
    "change_category" | "mark_needs_update" | "unmark_needs_update" | "remove"
  >("mark_needs_update");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected],
  );

  async function runBulk() {
    if (!selectedIds.length) return;
    if (action === "remove" && !confirm("Remover produtos selecionados?")) return;

    setBusy(true);
    const res = await fetch("/api/admin/products/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: selectedIds,
        action,
        categoryId: action === "change_category" ? categoryId : undefined,
      }),
    }).catch(() => null);

    setBusy(false);
    if (!res || !res.ok) {
      alert("Falha ao executar ação.");
      return;
    }
    window.location.reload();
  }

  const allChecked = items.length > 0 && items.every((p) => selected[p.id]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap rounded-2xl bg-zinc-50 ring-1 ring-zinc-200 p-3">
        <select
          value={action}
          onChange={(e) => setAction(e.target.value as any)}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
        >
          <option value="change_category">Mudar categoria</option>
          <option value="mark_needs_update">Marcar needs_update</option>
          <option value="unmark_needs_update">Desmarcar needs_update</option>
          <option value="remove">Remover</option>
        </select>

        {action === "change_category" ? (
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : null}

        <button
          disabled={busy || selectedIds.length === 0}
          onClick={runBulk}
          className="rounded-full bg-zuni-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Aplicar ({selectedIds.length})
        </button>

        <div className="text-xs text-zinc-600">
          Dica: use a extensão para importar (aba Importação).
        </div>
      </div>

      <div className="overflow-auto rounded-2xl ring-1 ring-zinc-200">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-700">
            <tr>
              <th className="p-3 text-left w-10">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => {
                    const v = e.target.checked;
                    const next: Record<string, boolean> = {};
                    items.forEach((p) => (next[p.id] = v));
                    setSelected(next);
                  }}
                />
              </th>
              <th className="p-3 text-left">Foto</th>
              <th className="p-3 text-left">Nome</th>
              <th className="p-3 text-left">Categoria</th>
              <th className="p-3 text-left">OFF%</th>
              <th className="p-3 text-left">Editar</th>
              <th className="p-3 text-left">Abrir afiliado</th>
              <th className="p-3 text-left">needs_update</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              const img = p.images?.[0] ?? null;
              return (
                <tr key={p.id} className="border-t border-zinc-100">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={!!selected[p.id]}
                      onChange={(e) => setSelected((s) => ({ ...s, [p.id]: e.target.checked }))}
                    />
                  </td>
                  <td className="p-3">
                    <div className="relative h-12 w-12 rounded-xl overflow-hidden bg-zinc-50 ring-1 ring-zinc-200">
                      {img ? (
                        <Image src={img} alt={p.title} fill className="object-contain p-1" />
                      ) : null}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="font-semibold line-clamp-2">{p.title}</div>
                    <div className="text-xs text-zinc-500 font-mono">{p.code6}</div>
                  </td>
                  <td className="p-3">{p.categories?.name ?? "—"}</td>
                  <td className="p-3">
                    {p.off_percent ? (
                      <span className="inline-flex rounded-full bg-zuni-red text-white text-xs font-semibold px-3 py-1">
                        {p.off_percent}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/admin/produtos/${p.id}`}
                      className="text-zuni-primary font-semibold hover:underline"
                    >
                      Editar
                    </Link>
                  </td>
                  <td className="p-3">
                    <a
                      href={p.affiliate_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-zuni-primary font-semibold hover:underline"
                    >
                      Abrir
                    </a>
                  </td>
                  <td className="p-3">
                    {p.needs_update ? (
                      <span className="text-xs font-semibold text-zuni-orange">SIM</span>
                    ) : (
                      <span className="text-xs text-zinc-500">não</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

