import { adminListCategories } from "@/lib/admin/db";
import { ProductsClient } from "@/app/admin/produtos/products-client";

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

      <ProductsClient categories={categories} />
    </div>
  );
}

