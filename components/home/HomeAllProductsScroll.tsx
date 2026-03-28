"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Após mudar query na home (ex.: ?p=2), garante scroll até #todos-produtos
 * quando o hash está na URL — o Link do Next nem sempre posiciona na âncora sozinho.
 */
export function HomeAllProductsScroll() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname !== "/") return;
    if (typeof window === "undefined") return;
    if (window.location.hash.replace(/^#/, "") !== "todos-produtos") return;

    const el = document.getElementById("todos-produtos");
    if (!el) return;

    const raf = window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [pathname, searchParams]);

  return null;
}
