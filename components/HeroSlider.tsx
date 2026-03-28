"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";

type SlideProduct = {
  code6: string;
  slug: string;
  title: string;
  images: string[];
  price: number;
  promo_price: number | null;
  off_percent: number;
  affiliate_url: string;
  rating: number | null;
  reviews_count: number | null;
};

type SlideItem = {
  id: string;
  product: SlideProduct;
};

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatRating(value: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `★ ${n.toFixed(1).replace(".", ",")}`;
}

function SlideContent({ item }: { item: SlideItem }) {
  const slide = item;
  const img = slide.product.images?.[0] ?? null;
  const hasPromo = slide.product.promo_price != null && slide.product.promo_price < slide.product.price;
  const finalPrice = hasPromo ? slide.product.promo_price! : slide.product.price;

  return (
    <div className="flex flex-col md:flex-row w-full min-h-[320px] md:min-h-[280px]">
      <Link
        href={`/produto/${slide.product.code6}/${slide.product.slug}`}
        className="relative w-full md:w-1/2 aspect-square md:aspect-auto md:h-72 md:min-h-[200px] bg-white/50 shrink-0 flex items-center justify-center"
      >
        {img ? (
          <Image
            src={img}
            alt={slide.product.title}
            fill
            className="object-contain p-6"
            sizes="(max-width: 768px) 100vw, 50vw"
            priority
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-400">
            Sem imagem
          </div>
        )}
        {hasPromo && slide.product.off_percent > 0 && (
          <div className="absolute top-4 left-4 bg-zuni-red text-white text-sm font-bold px-3 py-1.5 rounded-full">
            {slide.product.off_percent}% OFF
          </div>
        )}
      </Link>

      <div className="flex-1 p-6 md:p-8 flex flex-col justify-center">
        <div className="text-xs font-semibold text-zuni-primary uppercase tracking-wider mb-2">
          Destaque
        </div>
        <Link
          href={`/produto/${slide.product.code6}/${slide.product.slug}`}
          className="block"
        >
          <h2 className="text-xl md:text-2xl font-bold text-zinc-900 leading-tight line-clamp-3 hover:text-zuni-primary transition">
            {slide.product.title}
          </h2>
        </Link>
        {slide.product.rating != null ||
        (slide.product.reviews_count != null && slide.product.reviews_count > 0) ? (
          <div className="mt-2 text-sm text-zinc-600">
            {slide.product.rating != null ? (
              <span className="font-medium text-zinc-800">{formatRating(slide.product.rating)}</span>
            ) : null}
            {slide.product.reviews_count != null && slide.product.reviews_count > 0 ? (
              <span>
                {slide.product.rating != null ? " · " : null}
                {slide.product.reviews_count}{" "}
                {slide.product.reviews_count === 1 ? "avaliação" : "avaliações"}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="mt-4 space-y-1">
          {hasPromo && (
            <div className="text-sm text-zinc-500 line-through">
              {formatBRL(slide.product.price)}
            </div>
          )}
          <div className={`text-2xl md:text-3xl font-bold ${hasPromo ? "text-zuni-green" : "text-zinc-900"}`}>
            {formatBRL(finalPrice)}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={slide.product.affiliate_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-full bg-zuni-primary px-6 py-3 text-sm font-semibold text-white hover:opacity-90 transition"
          >
            Comprar agora
          </a>
          <Link
            href={`/produto/${slide.product.code6}/${slide.product.slug}`}
            className="inline-flex items-center justify-center rounded-full border-2 border-zuni-primary px-6 py-3 text-sm font-semibold text-zuni-primary hover:bg-zuni-primary hover:text-white transition"
          >
            Ver detalhes
          </Link>
        </div>
      </div>
    </div>
  );
}

export function HeroSlider({ items }: { items: SlideItem[] }) {
  const [current, setCurrent] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  const total = items.length;

  const goTo = useCallback((index: number) => {
    setCurrent((index + total) % total);
  }, [total]);

  const next = useCallback(() => goTo(current + 1), [current, goTo]);
  const prev = useCallback(() => goTo(current - 1), [current, goTo]);

  useEffect(() => {
    if (!isAutoPlaying || total <= 1) return;
    const interval = setInterval(next, 5000);
    return () => clearInterval(interval);
  }, [isAutoPlaying, next, total]);

  if (!items.length) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-zinc-200 p-6 text-sm text-zinc-600">
        Sem destaques no carrossel ainda.
      </div>
    );
  }

  return (
    <div
      className="relative rounded-2xl bg-linear-to-br from-zuni-purple-light to-white ring-1 ring-zinc-200 overflow-hidden"
      onMouseEnter={() => setIsAutoPlaying(false)}
      onMouseLeave={() => setIsAutoPlaying(true)}
    >
      <div className="overflow-hidden w-full">
        <div
          className="flex transition-transform duration-500 ease-in-out"
          style={{
            width: `${total * 100}%`,
            transform: `translateX(-${(current / total) * 100}%)`,
          }}
        >
          {items.map((item) => (
            <div key={item.id} className="shrink-0" style={{ width: `${100 / total}%` }}>
              <SlideContent item={item} />
            </div>
          ))}
        </div>
      </div>

      {total > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 shadow-lg flex items-center justify-center text-zinc-700 hover:bg-white hover:text-zuni-primary transition z-10"
            aria-label="Anterior"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <button
            onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 shadow-lg flex items-center justify-center text-zinc-700 hover:bg-white hover:text-zuni-primary transition z-10"
            aria-label="Próximo"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
            {items.map((_, idx) => (
              <button
                key={idx}
                onClick={() => goTo(idx)}
                className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ease-in-out ${
                  idx === current
                    ? "bg-zuni-primary w-6"
                    : "bg-zinc-300 hover:bg-zinc-400"
                }`}
                aria-label={`Ir para slide ${idx + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
