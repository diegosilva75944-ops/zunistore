import "server-only";

import { cache } from "react";
import { getProductByCode6ForPdpPage } from "@/lib/store";
import { fetchProductPageStatusRpc } from "@/lib/postgrest/call-product-page-status";
import { getProductSeoResolution, type ProductSeoResolution } from "@/lib/product-seo";
import type { Product } from "@/lib/store";

export type PdpSeoContext = {
  product: (Product & {
    is_active?: boolean;
    redirect_code6?: string | null;
    redirect_slug?: string | null;
  }) | null;
  resolution: ProductSeoResolution;
};

export const loadPdpSeoContext = cache(async (code6: string, slug: string): Promise<PdpSeoContext> => {
  const [product, rpc] = await Promise.all([
    getProductByCode6ForPdpPage(code6),
    fetchProductPageStatusRpc(code6, slug),
  ]);
  const resolution = getProductSeoResolution({
    product,
    rpc,
    code6,
    urlSlug: slug,
  });
  return { product, resolution };
});
