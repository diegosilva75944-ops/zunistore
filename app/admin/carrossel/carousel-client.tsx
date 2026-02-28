"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Product = { id: string; code6: string; slug: string; title: string; images?: string[] | null };

type CarouselRow = {
  product_id: string;
  size: "S" | "M" | "G";
  product: Product;
};

export function CarouselClient({
  initialCarousel,
  products,
}: {
  initialCarousel: any[];
  products: Product[];
}) {
  const initial: CarouselRow[] = (initialCarousel ?? [])
    .map((c) => ({
      product_id: c.product_id as string,
      size: (c.size as "S" | "M" | "G") ?? "M",
      product: c.products as Product,
    }))
    .filter((x) => x.product);

  const [items, setItems] = useState<CarouselRow[]>(initial);
  const [query, setQuery] = useState("");
  const [pickId, setPickId] = useState(products[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 50);
    return products
      .filter((p) => p.title.toLowerCase().includes(q) || p.code6.includes(q))
      .slice(0, 50);
  }, [products, query]);

  function addSelected() {
    const prod = products.find((p) => p.id === pickId);
    if (!prod) return;
    if (items.some((x) => x.product_id === prod.id)) return;
    setItems((s) => [...s, { product_id: prod.id, size: "M", product: prod }]);
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.product_id === active.id);
    const newIndex = items.findIndex((i) => i.product_id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setItems((s) => arrayMove(s, oldIndex, newIndex));
  }

  async function save() {
    setBusy(true);
    const payload = {
      items: items.map((it, idx) => ({
        product_id: it.product_id,
        sort_order: idx,
        size: it.size,
      })),
    };

    const res = await fetch("/api/admin/carousel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    setBusy(false);

    if (!res || !res.ok) {
      alert("Falha ao salvar carrossel.");
      return;
    }
    alert("Carrossel salvo.");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-zinc-50 ring-1 ring-zinc-200 p-4 space-y-2">
        <div className="text-sm font-semibold">Adicionar produto</div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título ou código…"
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm w-72"
          />
          <select
            value={pickId}
            onChange={(e) => setPickId(e.target.value)}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm min-w-72"
          >
            {filteredProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code6} · {p.title.slice(0, 60)}
              </option>
            ))}
          </select>
          <button
            onClick={addSelected}
            className="rounded-full bg-zuni-primary px-4 py-2 text-sm font-semibold text-white"
          >
            Adicionar
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-600">
          Itens no carrossel: <span className="font-semibold text-zinc-900">{items.length}</span>
        </div>
        <button
          disabled={busy}
          onClick={save}
          className="rounded-full bg-zuni-orange px-5 py-2 text-sm font-semibold text-zuni-black disabled:opacity-60"
        >
          {busy ? "Salvando…" : "Salvar carrossel"}
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.product_id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.map((it) => (
              <SortableRow
                key={it.product_id}
                id={it.product_id}
                title={`${it.product.code6} · ${it.product.title}`}
                image={it.product.images?.[0] ?? null}
                size={it.size}
                onSize={(size) =>
                  setItems((s) => s.map((x) => (x.product_id === it.product_id ? { ...x, size } : x)))
                }
                onRemove={() => setItems((s) => s.filter((x) => x.product_id !== it.product_id))}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableRow({
  id,
  title,
  image,
  size,
  onSize,
  onRemove,
}: {
  id: string;
  title: string;
  image: string | null;
  size: "S" | "M" | "G";
  onSize: (v: "S" | "M" | "G") => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-2xl bg-white ring-1 ring-zinc-200 p-3 ${isDragging ? "opacity-70" : ""}`}
    >
      <button
        type="button"
        className="cursor-grab select-none text-zinc-400 hover:text-zinc-700 px-2"
        {...attributes}
        {...listeners}
        aria-label="Arrastar"
      >
        ⋮⋮
      </button>

      <div className="relative h-12 w-12 rounded-xl overflow-hidden bg-zinc-50 ring-1 ring-zinc-200 shrink-0">
        {image ? <Image src={image} alt={title} fill className="object-contain p-1" /> : null}
      </div>

      <div className="flex-1">
        <div className="text-sm font-semibold line-clamp-2">{title}</div>
      </div>

      <select
        value={size}
        onChange={(e) => onSize(e.target.value as any)}
        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
      >
        <option value="S">S</option>
        <option value="M">M</option>
        <option value="G">G</option>
      </select>

      <button onClick={onRemove} className="text-sm font-semibold text-zuni-red hover:underline">
        Remover
      </button>
    </div>
  );
}

