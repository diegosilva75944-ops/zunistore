import { Suspense } from "react";
import { adminListCategories } from "@/lib/admin/db";
import { ProductsClient } from "@/app/admin/produtos/products-client";
import { SitePageLoader } from "@/components/SitePageLoader";

export const runtime = "nodejs";
export const revalidate = 0;

export default async function AdminProdutosPage() {
  const categories = await adminListCategories();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Produtos</h1>
        <p className="text-sm text-zinc-600">
          Filtre por nome, código ou categoria. Selecione produtos para ações em massa.
        </p>
      </div>

      <Suspense fallback={<SitePageLoader />}>
        <ProductsClient categories={categories} />
      </Suspense>
    </div>
  );
}

