import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCategoryBySlug, listProducts } from "@/lib/store";
import { robotsForListing } from "@/lib/seo";
import { TrackedProductCard } from "@/components/TrackedProductCard";
import { PRODUCT_CARD_GRID_CLASS } from "@/lib/ui/product-grid";

export const revalidate = 300;

export async function generateMetadata(props: {
  params: Promise<{ categoriaSlug: string }>;
}): Promise<Metadata> {
  const { categoriaSlug } = await props.params;
  const category = await getCategoryBySlug(categoriaSlug);
  if (!category) return { title: "Categoria não encontrada" };
  const { total } = await listProducts({ categoryId: category.id, sort: "mais-avaliados", perPage: 10, page: 1 });
  return {
    title: `Mais avaliados — ${category.name}`,
    description: `Produtos mais avaliados em ${category.name}.`,
    robots: robotsForListing(total, 8),
  };
}

export default async function MaisAvaliadosCategoriaPage(props: {
  params: Promise<{ categoriaSlug: string }>;
}) {
  const { categoriaSlug } = await props.params;
  const category = await getCategoryBySlug(categoriaSlug);
  if (!category) notFound();

  const { items, total } = await listProducts({
    categoryId: category.id,
    sort: "mais-avaliados",
    perPage: 20,
    page: 1,
  });

  return (
    <div className="space-y-6">
      <section className="zuni-site-section space-y-6" aria-labelledby="mais-avaliados-cat-heading">
        <nav className="text-xs text-zinc-600">
          <Link href="/" className="hover:underline">
            Início
          </Link>{" "}
          <span className="text-zinc-400">/</span>{" "}
          <Link href="/mais-avaliados" className="hover:underline">
            Mais avaliados
          </Link>{" "}
          <span className="text-zinc-400">/</span> <span>{category.name}</span>
        </nav>

        <div>
          <h1 id="mais-avaliados-cat-heading" className="text-2xl font-semibold">
            Mais avaliados — {category.name}
          </h1>
          <p className="text-sm text-zinc-600">Total: {total}</p>
        </div>

        <div className={PRODUCT_CARD_GRID_CLASS}>
          {items.map((p) => (
            <TrackedProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    </div>
  );
}

