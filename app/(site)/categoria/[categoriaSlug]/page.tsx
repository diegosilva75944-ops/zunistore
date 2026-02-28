import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCategoryBySlug, listProducts } from "@/lib/store";
import { robotsForListing } from "@/lib/seo";
import { ProductCard } from "@/components/ProductCard";
import { PRICE_RANGES } from "@/lib/priceRanges";

export const revalidate = 300;

export async function generateMetadata(props: {
  params: Promise<{ categoriaSlug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { categoriaSlug } = await props.params;
  const category = await getCategoryBySlug(categoriaSlug);
  if (!category) return { title: "Categoria não encontrada" };

  const { total } = await listProducts({ categoryId: category.id, perPage: 10, page: 1 });
  return {
    title: category.name,
    description: `Veja produtos em ${category.name} no ZuniStore.`,
    robots: robotsForListing(total, 8),
  };
}

export default async function CategoriaPage(props: {
  params: Promise<{ categoriaSlug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { categoriaSlug } = await props.params;
  const searchParams = (await props.searchParams) ?? {};

  const category = await getCategoryBySlug(categoriaSlug);
  if (!category) notFound();

  const sort = (asString(searchParams.ord) ?? "recentes") as any;
  const perPage = (asNumber(searchParams.pp) ?? 20) as 10 | 20 | 50;
  const page = asNumber(searchParams.p) ?? 1;

  const { items, total } = await listProducts({
    categoryId: category.id,
    sort,
    perPage,
    page,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{category.name}</h1>
          <p className="text-sm text-zinc-600">Total: {total}</p>
        </div>
        <Link
          href={`/ofertas/${category.slug}`}
          className="text-sm font-semibold text-zuni-primary hover:underline"
        >
          Ver ofertas desta categoria
        </Link>
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-zinc-200 p-4 flex flex-wrap gap-2">
        {PRICE_RANGES.map((r) => (
          <Link
            key={r.slug}
            href={`/categoria/${category.slug}/${r.slug}`}
            className="text-xs px-3 py-1 rounded-full border border-zinc-200 hover:bg-zuni-purple-light"
          >
            {r.label}
          </Link>
        ))}
      </div>

      {items.length ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-white ring-1 ring-zinc-200 p-6 text-sm text-zinc-600">
          Nenhum produto nesta categoria ainda.
        </div>
      )}

      <Pagination
        basePath={`/categoria/${category.slug}`}
        searchParams={searchParams}
        page={page}
      />
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

function Pagination({
  basePath,
  searchParams,
  page,
}: {
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
  page: number;
}) {
  const prev = page <= 1 ? null : `${basePath}?${qs(searchParams, { p: String(page - 1) })}`;
  const next = `${basePath}?${qs(searchParams, { p: String(page + 1) })}`;

  return (
    <div className="flex items-center justify-between pt-2">
      <Link
        href={prev ?? "#"}
        aria-disabled={!prev}
        className={`text-sm font-semibold ${prev ? "text-zuni-primary hover:underline" : "text-zinc-400 pointer-events-none"}`}
      >
        ← Anterior
      </Link>
      <div className="text-sm text-zinc-600">
        Página <span className="font-semibold text-zinc-900">{page}</span>
      </div>
      <Link href={next} className="text-sm font-semibold text-zuni-primary hover:underline">
        Próxima →
      </Link>
    </div>
  );
}

function qs(
  searchParams: Record<string, string | string[] | undefined>,
  patch: Record<string, string>,
) {
  const url = new URL("http://local/");
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === "string") url.searchParams.set(k, v);
    else if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
  }
  for (const [k, v] of Object.entries(patch)) url.searchParams.set(k, v);
  return url.searchParams.toString();
}

