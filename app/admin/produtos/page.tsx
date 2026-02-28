import { adminListCategories, adminListProducts } from "@/lib/admin/db";
import { ProductsClient } from "@/app/admin/produtos/products-client";

export const runtime = "nodejs";
export const revalidate = 0;

export default async function AdminProdutosPage() {
  const [categories, list] = await Promise.all([
    adminListCategories(),
    adminListProducts({ page: 1, perPage: 50 }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Produtos</h1>
        <p className="text-sm text-zinc-600">
          Selecione produtos para ações em massa.
        </p>
      </div>

      <ProductsClient categories={categories} initialItems={list.items} />
    </div>
  );
}

