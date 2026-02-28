"use client";

import { useState } from "react";

export function ProductEditClient({
  product,
  categories,
}: {
  product: any;
  categories: { id: string; name: string }[];
}) {
  const [form, setForm] = useState({
    title: product.title ?? "",
    description: product.description ?? "",
    imagesText: Array.isArray(product.images) ? product.images.join("\n") : "",
    category_id: product.category_id ?? categories[0]?.id ?? "",
    price: String(product.price ?? ""),
    promo_price: product.promo_price == null ? "" : String(product.promo_price),
    affiliate_url: product.affiliate_url ?? "",
    source_url: product.source_url ?? "",
    rating: product.rating == null ? "" : String(product.rating),
    reviews_count: product.reviews_count == null ? "" : String(product.reviews_count),
  });

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);

    const images = form.imagesText
      .split("\n")
      .map((s: string) => s.trim())
      .filter(Boolean);

    const payload: any = {
      title: form.title,
      description: form.description,
      images,
      category_id: form.category_id,
      price: form.price,
      promo_price: form.promo_price ? form.promo_price : null,
      affiliate_url: form.affiliate_url,
      source_url: form.source_url,
      rating: form.rating ? form.rating : null,
      reviews_count: form.reviews_count ? form.reviews_count : null,
    };

    const res = await fetch(`/api/admin/products/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);

    setBusy(false);
    if (!res || !res.ok) {
      const data = res ? await res.json().catch(() => null) : null;
      setMsg(data?.error || "Falha ao salvar.");
      return;
    }

    setMsg("Salvo com sucesso.");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Título">
          <input
            value={form.title}
            onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
        </Field>

        <Field label="Categoria">
          <select
            value={form.category_id}
            onChange={(e) => setForm((s) => ({ ...s, category_id: e.target.value }))}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Preço">
          <input
            value={form.price}
            onChange={(e) => setForm((s) => ({ ...s, price: e.target.value }))}
            inputMode="decimal"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
        </Field>

        <Field label="Preço promocional (opcional)">
          <input
            value={form.promo_price}
            onChange={(e) => setForm((s) => ({ ...s, promo_price: e.target.value }))}
            inputMode="decimal"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
        </Field>

        <Field label="Rating (opcional)">
          <input
            value={form.rating}
            onChange={(e) => setForm((s) => ({ ...s, rating: e.target.value }))}
            inputMode="decimal"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
        </Field>

        <Field label="Reviews count (opcional)">
          <input
            value={form.reviews_count}
            onChange={(e) => setForm((s) => ({ ...s, reviews_count: e.target.value }))}
            inputMode="numeric"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
        </Field>
      </div>

      <Field label="Descrição">
        <textarea
          value={form.description}
          onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
          className="w-full min-h-40 rounded-xl border border-zinc-200 px-3 py-2 text-sm"
        />
      </Field>

      <Field label="Imagens (1 URL por linha)">
        <textarea
          value={form.imagesText}
          onChange={(e) => setForm((s) => ({ ...s, imagesText: e.target.value }))}
          className="w-full min-h-32 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-mono"
        />
      </Field>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Link afiliado final (Comprar)">
          <input
            value={form.affiliate_url}
            onChange={(e) => setForm((s) => ({ ...s, affiliate_url: e.target.value }))}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-mono"
          />
        </Field>

        <Field label="Source URL (origem)">
          <input
            value={form.source_url}
            onChange={(e) => setForm((s) => ({ ...s, source_url: e.target.value }))}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-mono"
          />
        </Field>
      </div>

      {msg ? (
        <div className="text-sm text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2">
          {msg}
        </div>
      ) : null}

      <button
        disabled={busy}
        onClick={save}
        className="rounded-full bg-zuni-primary px-6 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Salvando…" : "Salvar"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-zinc-700">{label}</div>
      {children}
    </div>
  );
}

