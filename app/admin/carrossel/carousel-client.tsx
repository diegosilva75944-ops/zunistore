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

type Product = {
  id: string;
  code6: string;
  slug: string;
  title: string;
  images?: string[] | null;
  price?: number | null;
  promo_price?: number | null;
  off_percent?: number | null;
};

type CarouselRow = {
  product_id: string;
  product: Product;
};

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

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
    setItems((s) => [...s, { product_id: prod.id, product: prod }]);
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
        size: "M",
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
        <div className="text-sm font-semibold">Adicionar produto ao slider</div>
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
          Slides no carrossel: <span className="font-semibold text-zinc-900">{items.length}</span>
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
            {items.map((it, index) => (
              <SortableRow
                key={it.product_id}
                id={it.product_id}
                index={index + 1}
                title={it.product.title}
                code6={it.product.code6}
                image={it.product.images?.[0] ?? null}
                price={it.product.price ?? null}
                promoPrice={it.product.promo_price ?? null}
                offPercent={it.product.off_percent ?? null}
                onRemove={() => setItems((s) => s.filter((x) => x.product_id !== it.product_id))}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {items.length > 0 && (
        <div className="rounded-2xl bg-zuni-purple-light ring-1 ring-zuni-primary/20 p-4">
          <div className="text-sm font-semibold text-zuni-primary mb-2">Preview da ordem dos slides</div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {items.map((it, idx) => (
              <div
                key={it.product_id}
                className="shrink-0 w-20 h-20 rounded-xl bg-white ring-1 ring-zinc-200 relative overflow-hidden"
              >
                {it.product.images?.[0] ? (
                  <Image
                    src={it.product.images[0]}
                    alt={it.product.title}
                    fill
                    className="object-contain p-1"
                  />
                ) : null}
                <div className="absolute top-1 left-1 bg-zuni-primary text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                  {idx + 1}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SortableRow({
  id,
  index,
  title,
  code6,
  image,
  price,
  promoPrice,
  offPercent,
  onRemove,
}: {
  id: string;
  index: number;
  title: string;
  code6: string;
  image: string | null;
  price: number | null;
  promoPrice: number | null;
  offPercent: number | null;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const hasPromo = promoPrice != null && price != null && promoPrice < price;

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

      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-zuni-primary text-white font-bold text-sm">
        {index}
      </div>

      <div className="relative h-14 w-14 rounded-xl overflow-hidden bg-zinc-50 ring-1 ring-zinc-200 shrink-0">
        {image ? <Image src={image} alt={title} fill className="object-contain p-1" /> : null}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold line-clamp-1">{title}</div>
        <div className="text-xs text-zinc-500 font-mono">{code6}</div>
      </div>

      <div className="text-right shrink-0">
        {hasPromo ? (
          <>
            <div className="text-xs text-zinc-400 line-through">{formatBRL(price!)}</div>
            <div className="text-sm font-semibold text-zuni-green">{formatBRL(promoPrice!)}</div>
          </>
        ) : price ? (
          <div className="text-sm font-semibold">{formatBRL(price)}</div>
        ) : (
          <div className="text-sm text-zinc-400">—</div>
        )}
        {offPercent ? (
          <div className="inline-flex rounded-full bg-zuni-red text-white text-xs font-semibold px-2 py-0.5 mt-1">
            {offPercent}% OFF
          </div>
        ) : null}
      </div>

      <button onClick={onRemove} className="text-sm font-semibold text-zuni-red hover:underline shrink-0">
        Remover
      </button>
    </div>
  );
}
