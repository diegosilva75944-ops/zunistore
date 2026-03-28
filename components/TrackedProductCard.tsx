"use client";

import type { Product } from "@/lib/store";
import { ProductCard } from "@/components/ProductCard";
import { registrarCliqueProduto } from "@/lib/tracking";

/** Card com rastreamento de clique na vitrine (links internos /produto/...). */
export function TrackedProductCard({ product }: { product: Product }) {
  return (
    <div
      className="contents"
      onClickCapture={(e) => {
        const el = e.target as HTMLElement;
        if (el.closest('a[href^="/produto/"]')) {
          registrarCliqueProduto(product.id, product.category_id ?? null);
        }
      }}
    >
      <ProductCard product={product} />
    </div>
  );
}
