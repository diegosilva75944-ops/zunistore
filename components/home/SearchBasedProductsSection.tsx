import type { Product } from "@/lib/store";
import { RecommendationProductRail } from "@/components/home/RecommendationProductRail";

export function SearchBasedProductsSection({ products }: { products: Product[] }) {
  return (
    <RecommendationProductRail
      title="Baseado nas suas buscas"
      subtitle="Produtos alinhados aos termos que você mais pesquisou."
      products={products}
      empty="Quando você buscar por produtos, montamos esta lista automaticamente."
    />
  );
}
