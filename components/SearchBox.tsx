"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { registrarBusca } from "@/lib/tracking";

type SearchItem = {
  code6: string;
  slug: string;
  title: string;
};

export function SearchBox() {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const debounced = useDebounce(term, 50);

  function goToResultsPage() {
    const q = term.trim();
    if (!q) return;
    registrarBusca(q);
    setOpen(false);
    router.push(`/buscar?q=${encodeURIComponent(q)}`);
  }

  useEffect(() => {
    const q = debounced.trim();
    abortRef.current?.abort();
    setItems([]);

    if (!q) {
      setLoading(false);
      return;
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);

    fetch(`/api/search?term=${encodeURIComponent(q)}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) return { items: [] };
        return r.json();
      })
      .then((data) => {
        if (ctrl.signal.aborted) return;
        setItems(Array.isArray(data?.items) ? data.items : []);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
  }, [debounced]);

  useEffect(() => {
    const q = debounced.trim();
    if (q.length < 2) return;
    const t = window.setTimeout(() => registrarBusca(q), 700);
    return () => window.clearTimeout(t);
  }, [debounced]);

  useEffect(() => {
    function onPointerDown(ev: MouseEvent | TouchEvent) {
      const el = rootRef.current;
      if (!el || !open) return;
      const target = ev.target as Node | null;
      if (target && el.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  const hasResults = items.length > 0;
  const canSearch = term.trim().length > 0;

  return (
    <div className="relative w-full" ref={rootRef}>
      <form
        className="flex items-center gap-1 w-full rounded-full bg-white/10 ring-1 ring-white/10 focus-within:ring-2 focus-within:ring-zuni-yellow pl-3 pr-1 py-1"
        onSubmit={(e) => {
          e.preventDefault();
          goToResultsPage();
        }}
      >
        <input
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Busque por produto, categoria ou descrição…"
          className="flex-1 min-w-0 bg-transparent text-white placeholder:text-white/60 px-1 py-1.5 text-sm outline-none border-0"
          aria-label="Buscar produtos"
        />
        <button
          type="submit"
          disabled={!canSearch}
          className="shrink-0 inline-flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-40 disabled:pointer-events-none w-9 h-9 text-white transition"
          aria-label="Buscar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </button>
      </form>

      {open ? (
        <div className="absolute left-0 right-0 mt-2 rounded-2xl bg-white text-zuni-black shadow-xl overflow-hidden ring-1 ring-zinc-200 z-50">
          <div className="px-4 py-2 text-xs text-zinc-600 flex items-center justify-between gap-2">
            <span>
              {loading ? "Buscando…" : hasResults ? "Resultados" : term.trim() ? "Nenhum resultado" : "Digite para buscar"}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-zinc-600 hover:text-zinc-900 shrink-0"
            >
              Fechar
            </button>
          </div>
          {hasResults ? (
            <ul className="max-h-80 overflow-auto">
              {items.map((p) => (
                <li key={p.code6} className="border-t border-zinc-100">
                  <Link
                    href={`/produto/${p.code6}/${p.slug}`}
                    className="block px-4 py-3 text-sm hover:bg-zuni-purple-light"
                    onClick={() => setOpen(false)}
                  >
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {canSearch ? (
            <div className="border-t border-zinc-100 px-4 py-2">
              <button
                type="button"
                onClick={() => goToResultsPage()}
                className="text-sm font-semibold text-zuni-primary hover:underline w-full text-left"
              >
                Ver todos os resultados para «{term.trim()}»
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function useDebounce<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
