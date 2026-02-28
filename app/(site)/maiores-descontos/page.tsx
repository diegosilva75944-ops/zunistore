import type { Metadata } from "next";
import { listProducts } from "@/lib/store";
import { robotsForListing } from "@/lib/seo";
import { ProductCard } from "@/components/ProductCard";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const { total } = await listProducts({ onlyOffers: true, perPage: 10, page: 1, sort: "maior-desconto" });
  return {
    title: "Maiores descontos",
    description: "Produtos com maiores descontos no ZuniStore.",
    robots: robotsForListing(total, 8),
  };
}

export default async function MaioresDescontosPage() {
  const { items, total } = await listProducts({ onlyOffers: true, sort: "maior-desconto", perPage: 20, page: 1 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Maiores descontos</h1>
        <p className="text-sm text-zinc-600">Total: {total}</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}

