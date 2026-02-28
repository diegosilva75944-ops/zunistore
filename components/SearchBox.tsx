"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type SearchItem = {
  code6: string;
  slug: string;
  title: string;
};

export function SearchBox() {
  const [term, setTerm] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const debounced = useDebounce(term, 300);

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
      .then((r) => r.json())
      .then((data) => {
        setItems(Array.isArray(data?.items) ? data.items : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [debounced]);

  const hasResults = items.length > 0;

  return (
    <div className="relative">
      <input
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Busque por produto, categoria ou descrição…"
        className="w-full rounded-full bg-white/10 text-white placeholder:text-white/60 px-4 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-zuni-yellow"
      />

      {open ? (
        <div className="absolute left-0 right-0 mt-2 rounded-2xl bg-white text-zuni-black shadow-xl overflow-hidden ring-1 ring-zinc-200">
          <div className="px-4 py-2 text-xs text-zinc-600 flex items-center justify-between">
            <span>{loading ? "Buscando…" : hasResults ? "Resultados" : "Nenhum resultado"}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-zinc-600 hover:text-zinc-900"
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

