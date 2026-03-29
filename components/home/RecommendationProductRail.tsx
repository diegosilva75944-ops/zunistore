import type { Product } from "@/lib/store";
import { PRODUCT_CARD_GRID_CLASS } from "@/lib/ui/product-grid";
import { TrackedProductCard } from "@/components/TrackedProductCard";

export function RecommendationProductRail({
  title,
  subtitle,
  products,
}: {
  title: string;
  subtitle?: string;
  products: Product[];
}) {
  if (!products.length) return null;

  return (
    <section className="zuni-site-section space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        {subtitle ? <p className="text-sm text-zinc-600 mt-1">{subtitle}</p> : null}
      </div>
      <div className={PRODUCT_CARD_GRID_CLASS}>
        {products.map((p) => (
          <TrackedProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
