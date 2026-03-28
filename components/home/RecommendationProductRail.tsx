import Link from "next/link";
import type { Product } from "@/lib/store";
import { TrackedProductCard } from "@/components/TrackedProductCard";

export function RecommendationProductRail({
  title,
  subtitle,
  products,
  empty,
}: {
  title: string;
  subtitle?: string;
  products: Product[];
  empty: string;
}) {
  if (!products.length) {
    return (
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        {subtitle ? <p className="text-sm text-zinc-600">{subtitle}</p> : null}
        <p className="text-sm text-zinc-600">{empty}</p>
        <Link href="/categorias" className="inline-block text-sm font-semibold text-zuni-primary hover:underline">
          Ver categorias
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        {subtitle ? <p className="text-sm text-zinc-600 mt-1">{subtitle}</p> : null}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {products.map((p) => (
          <TrackedProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
