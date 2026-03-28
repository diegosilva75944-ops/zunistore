import type { Product } from "@/lib/store";
import { RecommendationProductRail } from "@/components/home/RecommendationProductRail";

export function PopularProductsSection({
  products,
  subtitle,
}: {
  products: Product[];
  /** Permite texto diferente quando a personalização está desligada. */
  subtitle?: string;
}) {
  return (
    <RecommendationProductRail
      title="Mais populares no site"
      subtitle={subtitle ?? "Tendências gerais para todos os visitantes."}
      products={products}
    />
  );
}
