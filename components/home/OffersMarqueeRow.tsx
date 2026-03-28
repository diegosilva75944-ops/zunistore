"use client";

import type { Product } from "@/lib/store";
import { TrackedProductCard } from "@/components/TrackedProductCard";

const MAX_OFFERS = 10;

type Props = {
  products: Product[];
  /** Classes extra no wrapper do carrossel (ex.: fundo na home). */
  className?: string;
};

/**
 * Uma única linha de ofertas com rolagem horizontal contínua para a esquerda.
 * Lista duplicada para loop sem salto; pausa no hover para permitir cliques.
 */
export function OffersMarqueeRow({ products, className }: Props) {
  const list = products.slice(0, MAX_OFFERS);
  if (!list.length) return null;

  const loop = [...list, ...list];
  const seconds = Math.max(28, list.length * 5);

  return (
    <div
      className={`offers-marquee-outer relative overflow-hidden rounded-2xl py-1 -mx-1 ${className ?? ""}`.trim()}
      aria-label="Carrossel de produtos em oferta"
    >
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
