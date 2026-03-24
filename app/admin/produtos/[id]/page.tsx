import { notFound } from "next/navigation";
import Link from "next/link";
import { adminListCategories } from "@/lib/admin/db";
import { postgrestGet } from "@/lib/postgrest/server";
import { ProductEditClient } from "@/app/admin/produtos/[id]/product-edit-client";

export const runtime = "nodejs";
export const revalidate = 0;

export default async function AdminProdutoEditPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const rows = await postgrestGet<any[]>("products", {
    select: "id,code6,slug,title,description,images,category_id,price,promo_price,affiliate_url,source_url,rating,reviews_count",
    id: `eq.${id}`,
    limit: "1",
  });
  const data = Array.isArray(rows) ? rows[0] : null;

  if (!data) notFound();

  const categories = await adminListCategories();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Editar produto</h1>
          <p className="text-sm text-zinc-600">
            Código: <span className="font-mono font-semibold">{(data as any).code6}</span>
          </p>
        </div>
        <Link
          href={`/produto/${(data as any).code6}/${(data as any).slug}`}
          className="text-sm font-semibold text-zuni-primary hover:underline"
          target="_blank"
        >
          Abrir no site
        </Link>
      </div>

      <ProductEditClient product={data as any} categories={categories as any} />
    </div>
  );
}

