"use client";

import { personalizationAllowed } from "@/lib/consent";
import { getSessionId } from "@/lib/session";
import type { RecentProductSnapshot } from "@/lib/personalization/types";
import {
  localAppendCategory,
  localAppendClick,
  localAppendSearch,
  localAppendView,
  localClearAllPersonalizationData,
  localUpsertRecentProduct,
  normalizeSearchTerm,
} from "@/lib/tracking/local-storage";

let lastSearchPosted = { term: "", at: 0 };
const SEARCH_DEDUP_MS = 5000;

async function postJson(path: string, body: Record<string, unknown>) {
  const sessionId = getSessionId();
  if (!sessionId) return;
  try {
    await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, sessionId }),
      keepalive: true,
    });
  } catch {
    /* rede / offline */
  }
}

/** Registra busca (local + servidor se consentido). Debounce de repetição idêntica. */
export function registrarBusca(termo: string) {
  const t = normalizeSearchTerm(termo);
  if (t.length < 2) return;
  const now = Date.now();
  if (t === lastSearchPosted.term && now - lastSearchPosted.at < SEARCH_DEDUP_MS) return;
  lastSearchPosted = { term: t, at: now };

  localAppendSearch(t);
  if (!personalizationAllowed()) return;
  void postJson("/api/tracking/search", { term: t });
}

export function registrarCliqueProduto(produtoId: string, categoriaId: string | null) {
  localAppendClick(produtoId, categoriaId);
  if (!personalizationAllowed()) return;
  void postJson("/api/tracking/product-click", { productId: produtoId, categoryId: categoriaId });
}

export function registrarVisualizacaoProduto(produtoId: string, categoriaId: string | null) {
  localAppendView(produtoId, categoriaId);
  if (!personalizationAllowed()) return;
  void postJson("/api/tracking/product-view", { productId: produtoId, categoryId: categoriaId });
}

export function registrarVisitaCategoria(categoriaId: string) {
  localAppendCategory(categoriaId);
  if (!personalizationAllowed()) return;
  void postJson("/api/tracking/category-visit", { categoryId: categoriaId });
}

export function registrarProdutoRecente(p: Omit<RecentProductSnapshot, "at">) {
  localUpsertRecentProduct(p);
}

export function limparHistoricoPersonalizacao() {
  localClearAllPersonalizationData();
  void postJson("/api/personalization/clear", {});
}
