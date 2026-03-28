import type { Product } from "@/lib/store";
import { RecommendationProductRail } from "@/components/home/RecommendationProductRail";

export function PopularProductsSection({
  products,
  subtitle,
  emptyMessage,
}: {
  products: Product[];
  /** Permite texto diferente quando a personalização está desligada. */
  subtitle?: string;
  emptyMessage?: string;
}) {
  return (
    <RecommendationProductRail
      title="Mais populares no site"
      subtitle={
        subtitle ??
        "Tendências gerais para todos os visitantes."
      }
      products={products}
      empty={emptyMessage ?? "Em breve traremos os destaques mais clicados do site."}
    />
  );
}
