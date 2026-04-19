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

function MobileOffersScroll({
  list,
  outerClass,
}: {
  list: Product[];
  outerClass: string;
}) {
  return (
    <div
      className={`${outerClass} md:hidden overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth snap-x snap-mandatory [scrollbar-width:thin] touch-pan-x [-webkit-overflow-scrolling:touch]`}
      aria-label="Lista de produtos em oferta — deslize horizontalmente"
    >
      <div className="flex w-max gap-0 pb-1 pt-0.5">
        {list.map((p) => (
          <div
            key={`m-${p.id}`}
            className="snap-start shrink-0 w-[78vw] max-w-[220px] px-2 sm:w-72 sm:max-w-[260px]"
          >
            <TrackedProductCard product={p} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Faixa de ofertas: no mobile, rolagem horizontal com dedo; em md+, rolagem contínua animada ou scroll conforme largura.
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

  return (
    <>
      <MobileOffersScroll list={list} outerClass={outerClass} />

      {!useInfiniteLoop ? (
        <div
          ref={outerRef}
          className={`${outerClass} hidden md:block overflow-x-auto scroll-smooth [scrollbar-width:thin]`}
          aria-label="Lista de produtos em oferta"
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
      ) : (
        <div ref={outerRef} className={`${outerClass} hidden md:block`} aria-label="Carrossel de produtos em oferta">
          <div
            className="offers-marquee-track flex w-max"
            style={{
              animation: `offers-marquee-x ${Math.max(28, list.length * 5)}s linear infinite`,
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
        </div>
      )}
    </>
  );
}
