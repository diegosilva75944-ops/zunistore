"use client";

import { useEffect, useRef, useState } from "react";
import type { Product } from "@/lib/store";
import { TrackedProductCard } from "@/components/TrackedProductCard";

const MAX_OFFERS = 15;
/** Largura estimada de um card + padding (px) — alinha com `w-[42vw] max-w-[200px] … px-2`. */
const CARD_EST_PX = 212;

type Props = {
  products: Product[];
  /** Classes extra no wrapper do carrossel (ex.: fundo na home). */
  className?: string;
};

/**
 * Faixa de ofertas com rolagem horizontal contínua (loop CSS) quando a lista é larga o suficiente;
 * caso contrário, scroll horizontal (inclui mobile com poucos itens).
 * O `ref` mede sempre a largura visível — mobile incluído — para o loop automático funcionar.
 */
export function OffersMarqueeRow({ products, className }: Props) {
  const list = products.slice(0, MAX_OFFERS);
  const outerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = outerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  if (!list.length) return null;

  const oneStripPx = list.length * CARD_EST_PX;
  const useInfiniteLoop = containerWidth <= 0 || oneStripPx >= containerWidth * 1.5;

  /** Sem margem negativa: evita “bleed” horizontal fora do contentor e barra de rolagem na página. */
  const outerClass = `offers-marquee-outer relative overflow-hidden rounded-2xl py-1 ${className ?? ""}`.trim();
  const seconds = Math.max(28, list.length * 5);

  return (
    <div ref={outerRef} className={outerClass} aria-label="Carrossel de produtos em oferta">
      {useInfiniteLoop ? (
        <div
          className="offers-marquee-track flex w-max"
          style={{
            animation: `offers-marquee-x ${seconds}s linear infinite`,
          }}
        >
          {[...list, ...list].map((p, i) => (
            <div
              key={`${p.id}-${i}`}
              className="w-[42vw] max-w-[200px] shrink-0 px-2 sm:w-48 sm:max-w-none md:w-52"
            >
              <TrackedProductCard product={p} />
            </div>
          ))}
        </div>
      ) : (
        <div
          className="overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth [scrollbar-width:thin] touch-pan-x [-webkit-overflow-scrolling:touch]"
          aria-label="Lista de produtos em oferta — deslize para ver mais"
        >
          <div className="flex w-max gap-0 pb-0.5">
            {list.map((p) => (
              <div
                key={p.id}
                className="w-[42vw] max-w-[200px] shrink-0 px-2 sm:w-48 sm:max-w-none md:w-52"
              >
                <TrackedProductCard product={p} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
