import type { Product } from "@/lib/store";
import { RecommendationProductRail } from "@/components/home/RecommendationProductRail";

export function PersonalizedProductsSection({ products }: { products: Product[] }) {
  return (
    <RecommendationProductRail
      title="Mais procurados para você"
      subtitle="Combinamos buscas, categorias visitadas, cliques e visualizações."
      products={products}
    />
  );
}
