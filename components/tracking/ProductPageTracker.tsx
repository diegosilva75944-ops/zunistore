"use client";

import { useEffect } from "react";
import { SS_VIEW_PREFIX } from "@/lib/personalization/constants";
import type { RecentProductSnapshot } from "@/lib/personalization/types";
import { personalizationAllowed } from "@/lib/consent";
import { registrarProdutoRecente, registrarVisualizacaoProduto } from "@/lib/tracking";

type Props = {
  product: Omit<RecentProductSnapshot, "at">;
};

/**
 * Uma visualização por aba (sessionStorage) para evitar loop em re-renders.
 * Histórico recente é sempre local; envio ao servidor só com personalização aceita.
 */
export function ProductPageTracker({ product }: Props) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `${SS_VIEW_PREFIX}${product.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      return;
    }
    registrarProdutoRecente(product);
    if (!personalizationAllowed()) return;
    registrarVisualizacaoProduto(product.id, product.category_id ?? null);
  }, [product]);

  return null;
}
