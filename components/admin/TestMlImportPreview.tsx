"use client";

import type { TestMlImportResult } from "@/lib/ml-test";

function fmtBrl(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

type Props = {
  data: TestMlImportResult;
};

export function TestMlImportPreview({ data }: Props) {
  const { pricing, title, shortDescription, fullDescription, images } = data;
  const hasPromo =
    pricing.hasDiscount &&
    pricing.displayMode === "discounted_price" &&
    pricing.originalPrice != null &&
    pricing.currentPrice != null &&
    pricing.originalPrice > pricing.currentPrice;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 md:p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">{title || "Sem título"}</h2>
        <p className="text-xs text-zinc-500 mt-1">
          Origem preço: <span className="font-mono">{pricing.source}</span> · Confiança:{" "}
          <span className="font-semibold">{pricing.confidence}</span> · Modo:{" "}
          <span className="font-mono">{pricing.displayMode}</span>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
          <div className="text-xs text-zinc-500">Preço atual (UI)</div>
          <div className="text-lg font-semibold text-emerald-700">{fmtBrl(pricing.currentPrice)}</div>
        </div>
        <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
          <div className="text-xs text-zinc-500">Preço anterior (riscado)</div>
          <div className="text-lg font-semibold text-zinc-900">
            {hasPromo ? fmtBrl(pricing.originalPrice) : "—"}
          </div>
        </div>
        <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
          <div className="text-xs text-zinc-500">OFF</div>
          <div className="text-lg font-semibold text-zinc-900">
            {hasPromo && pricing.discountPercent != null ?
              `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(pricing.discountPercent)}%`
            : "—"}
          </div>
        </div>
        <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
          <div className="text-xs text-zinc-500">Parcelamento (se detectado)</div>
          <div className="text-sm font-medium text-zinc-800">
            {pricing.installments != null && pricing.installmentPrice != null ?
              `${pricing.installments}x ${fmtBrl(pricing.installmentPrice)}`
            : "—"}
          </div>
        </div>
      </div>

      {images.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-800 mb-2">Galeria ({images.length})</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {images.slice(0, 16).map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={src}
                src={src}
                alt=""
                className="h-28 w-full object-contain rounded-lg bg-zinc-100 ring-1 ring-zinc-200"
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-zinc-800 mb-1">Descrição curta</h3>
        <p className="text-sm text-zinc-700 whitespace-pre-wrap">{shortDescription || "—"}</p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-zinc-800 mb-1">Descrição completa</h3>
        <div className="max-h-80 overflow-y-auto rounded-xl bg-zinc-50 p-3 text-sm text-zinc-800 whitespace-pre-wrap ring-1 ring-zinc-200">
          {fullDescription || "—"}
        </div>
      </div>
    </div>
  );
}
