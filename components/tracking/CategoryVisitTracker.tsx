"use client";

import { useEffect } from "react";
import { personalizationAllowed } from "@/lib/consent";
import { registrarVisitaCategoria } from "@/lib/tracking";

export function CategoryVisitTracker({ categoryId }: { categoryId: string }) {
  useEffect(() => {
    if (!categoryId || !personalizationAllowed()) return;
    registrarVisitaCategoria(categoryId);
  }, [categoryId]);

  return null;
}
