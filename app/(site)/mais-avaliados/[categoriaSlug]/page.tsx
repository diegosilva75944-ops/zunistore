import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCategoryBySlug, listProducts } from "@/lib/store";
import { robotsForListing } from "@/lib/seo";
import { ProductCard } from "@/components/ProductCard";

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
      <nav className="text-xs text-zinc-600">
        <Link href="/" className="hover:underline">Início</Link>{" "}
        <span className="text-zinc-400">/</span>{" "}
        <Link href="/mais-avaliados" className="hover:underline">Mais avaliados</Link>{" "}
        <span className="text-zinc-400">/</span> <span>{category.name}</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">Mais avaliados — {category.name}</h1>
        <p className="text-sm text-zinc-600">Total: {total}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}

