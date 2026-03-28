"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { registrarBusca } from "@/lib/tracking";

/** Registra o termo da URL /buscar?q= após carregar a página (dedupe no cliente). */
export function BuscarQueryTracker() {
  const searchParams = useSearchParams();
  const q = (searchParams.get("q") ?? "").trim();
  const last = useRef("");

  useEffect(() => {
    if (q.length < 2) return;
    if (q === last.current) return;
    last.current = q;
    registrarBusca(q);
  }, [q]);

  return null;
}
