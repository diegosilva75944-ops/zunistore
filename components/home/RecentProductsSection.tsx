import type { Product } from "@/lib/store";
import { RecommendationProductRail } from "@/components/home/RecommendationProductRail";

export function RecentProductsSection({ products }: { products: Product[] }) {
  return (
    <RecommendationProductRail
      title="Você viu recentemente"
      subtitle="Até 12 itens neste dispositivo, sem repetição."
      products={products}
    />
  );
}
