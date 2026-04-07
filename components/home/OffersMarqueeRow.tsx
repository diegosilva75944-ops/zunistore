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
 * Faixa de ofertas com rolagem horizontal contínua.
 * Se uma única “volta” da lista for mais estreita que o container, o loop infinito
 * (`[...list, ...list]` + translate -50%) mostra o mesmo produto duas vezes ao mesmo tempo;
 * nesse caso usamos só scroll horizontal, sem duplicar itens.
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

  const outerClass = `offers-marquee-outer relative overflow-hidden rounded-2xl py-1 -mx-1 ${className ?? ""}`.trim();

  if (!useInfiniteLoop) {
    return (
      <div
        ref={outerRef}
        className={`${outerClass} overflow-x-auto scroll-smooth [scrollbar-width:thin]`}
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
    );
  }

  const loop = [...list, ...list];
  const seconds = Math.max(28, list.length * 5);

  return (
    <div ref={outerRef} className={outerClass} aria-label="Carrossel de produtos em oferta">
      <div
        className="offers-marquee-track flex w-max"
        style={{
          animation: `offers-marquee-x ${seconds}s linear infinite`,
        }}
      >
        {loop.map((p, i) => (
          <div
            key={`${p.id}-${i}`}
            className="w-[42vw] max-w-[200px] shrink-0 px-2 sm:w-48 sm:max-w-none md:w-52"
          >
            <TrackedProductCard product={p} />
          </div>
        ))}
      </div>
    </div>
  );
}
