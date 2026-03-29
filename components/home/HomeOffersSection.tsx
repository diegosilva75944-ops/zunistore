import Link from "next/link";
import type { Product } from "@/lib/store";
import { OffersMarqueeRow } from "@/components/home/OffersMarqueeRow";

type Props = {
  products: Product[];
};

/**
 * Home — “Produtos em Oferta”: estilos em globals.css; cores editáveis em Admin → Tema (--home-offers-*).
 * Carrossel e cards inalterados; apenas moldura visual e hierarquia do título.
 */
export function HomeOffersSection({ products }: Props) {
  if (!products.length) return null;

  return (
    <section
      className="home-offers-section zuni-site-section rounded-3xl"
      aria-labelledby="home-offers-heading"
    >
      <div className="home-offers-section__inner space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="home-offers-section__badge"
                aria-hidden
              >
                Oferta
              </span>
            </div>
            <h2
              id="home-offers-heading"
              className="text-2xl font-bold tracking-tight text-zinc-900 md:text-3xl"
            >
              Produtos em{" "}
              <span className="text-zuni-primary">Oferta</span>
            </h2>
            <p className="max-w-xl text-sm leading-relaxed text-zinc-600">
              Descontos em produtos selecionados — confira antes que acabem.
            </p>
          </div>
          <Link
            href="/ofertas"
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-zuni-primary px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-zuni-primary/20 transition hover:opacity-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zuni-primary"
          >
            Ver todas as ofertas
          </Link>
        </div>

        <OffersMarqueeRow
          products={products}
          className="home-offers-section__marquee"
        />
      </div>
    </section>
  );
}
