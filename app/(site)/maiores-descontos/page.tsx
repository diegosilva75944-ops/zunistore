import type { Metadata } from "next";
import { listProducts } from "@/lib/store";
import { robotsForListing } from "@/lib/seo";
import { TrackedProductCard } from "@/components/TrackedProductCard";
import { PRODUCT_CARD_GRID_CLASS } from "@/lib/ui/product-grid";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const { total } = await listProducts({ perPage: 10, page: 1, sort: "maior-desconto" });
  return {
    title: "Maiores descontos",
    description: "Produtos com maiores descontos no ZuniStore.",
    robots: robotsForListing(total, 8),
  };
}

export default async function MaioresDescontosPage() {
  const { items, total } = await listProducts({ sort: "maior-desconto", perPage: 20, page: 1 });

  return (
    <div className="space-y-6">
      <section className="zuni-site-section space-y-6" aria-labelledby="maiores-descontos-heading">
        <div>
          <h1 id="maiores-descontos-heading" className="text-2xl font-semibold">
            Maiores descontos
          </h1>
          <p className="text-sm text-zinc-600">Total: {total}</p>
        </div>
        <div className={PRODUCT_CARD_GRID_CLASS}>
          {items.map((p) => (
            <TrackedProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    </div>
  );
}

