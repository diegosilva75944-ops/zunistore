import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSeoQueryBySlug, searchProductsByTerms } from "@/lib/store";
import { ProductCard } from "@/components/ProductCard";

export const revalidate = 300;

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const q = await getSeoQueryBySlug(slug);
  if (!q) return { title: "Busca não encontrada" };

  const { total } = await searchProductsByTerms({
    terms: q.query_terms,
    categoryId: q.category_id,
    perPage: 10,
    page: 1,
    sort: "recentes",
  });

  const index = q.is_indexable && total >= (q.min_results ?? 8);
  return {
    title: q.title,
    description: q.description,
    robots: { index, follow: true },
  };
}

export default async function BuscarPage(props: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await props.params;
  const searchParams = (await props.searchParams) ?? {};
  const page = asNumber(searchParams.p) ?? 1;
  const perPage = (asNumber(searchParams.pp) ?? 20) as 10 | 20 | 50;

  const q = await getSeoQueryBySlug(slug);
  if (!q) notFound();

  const { items, total } = await searchProductsByTerms({
    terms: q.query_terms,
    categoryId: q.category_id,
    page,
    perPage,
    sort: "recentes",
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{q.title}</h1>
        <p className="text-sm text-zinc-600">{q.description}</p>
        <p className="text-xs text-zinc-500 mt-1">Resultados: {total}</p>
      </div>

      {items.length ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-white ring-1 ring-zinc-200 p-6 text-sm text-zinc-600">
          Nenhum resultado para esta busca.
        </div>
      )}
    </div>
  );
}

function asString(v: unknown) {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0];
  return undefined;
}

function asNumber(v: unknown) {
  const s = asString(v);
  if (!s) return undefined;
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

