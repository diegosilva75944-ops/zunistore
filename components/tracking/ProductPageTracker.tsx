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
 * Uma visualização por aba/sessão de navegador (sessionStorage) para evitar loop em re-renders.
 * Só grava histórico com consentimento de personalização aceito.
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
    if (!personalizationAllowed()) return;
    registrarVisualizacaoProduto(product.id, product.category_id ?? null);
    registrarProdutoRecente(product);
  }, [product]);

  return null;
}
