import type { Metadata } from "next";
import Link from "next/link";
import { listProducts, listSeedCategories } from "@/lib/store";
import { robotsForListing } from "@/lib/seo";
import { ProductCard } from "@/components/ProductCard";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const { total } = await listProducts({ perPage: 10, page: 1, sort: "mais-avaliados" });
  return {
    title: "Mais avaliados",
    description: "Produtos mais bem avaliados no ZuniStore.",
    robots: robotsForListing(total, 8),
  };
}

export default async function MaisAvaliadosPage() {
  const [categories, list] = await Promise.all([
    listSeedCategories(),
    listProducts({ sort: "mais-avaliados", perPage: 20, page: 1 }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Mais avaliados</h1>
          <p className="text-sm text-zinc-600">Destaques por avaliação.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {categories.slice(0, 10).map((c) => (
            <Link
              key={c.id}
              href={`/mais-avaliados/${c.slug}`}
              className="text-xs px-3 py-1 rounded-full border border-zinc-200 hover:bg-zuni-purple-light"
            >
              {c.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {list.items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}

