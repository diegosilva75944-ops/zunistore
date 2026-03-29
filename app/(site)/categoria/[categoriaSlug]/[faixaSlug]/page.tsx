import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCategoryBySlug, listProducts } from "@/lib/store";
import { getPriceRangeBySlug } from "@/lib/priceRanges";
import { robotsForListing } from "@/lib/seo";
import { TrackedProductCard } from "@/components/TrackedProductCard";
import { PRODUCT_CARD_GRID_CLASS } from "@/lib/ui/product-grid";
import { CategoryVisitTracker } from "@/components/tracking/CategoryVisitTracker";

export const revalidate = 300;

export async function generateMetadata(props: {
  params: Promise<{ categoriaSlug: string; faixaSlug: string }>;
}): Promise<Metadata> {
  const { categoriaSlug, faixaSlug } = await props.params;
  const category = await getCategoryBySlug(categoriaSlug);
  const range = getPriceRangeBySlug(faixaSlug);
  if (!category || !range) return { title: "Página não encontrada" };

  const { total } = await listProducts({
    categoryId: category.id,
    min: range.min,
    max: range.max,
    perPage: 10,
    page: 1,
  });

  return {
    title: `${category.name} — ${range.label}`,
    description: `Produtos em ${category.name} na faixa: ${range.label}.`,
    robots: robotsForListing(total, 8),
  };
}

export default async function FaixaCategoriaPage(props: {
  params: Promise<{ categoriaSlug: string; faixaSlug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { categoriaSlug, faixaSlug } = await props.params;
  const searchParams = (await props.searchParams) ?? {};
  const category = await getCategoryBySlug(categoriaSlug);
  const range = getPriceRangeBySlug(faixaSlug);
  if (!category || !range) notFound();

  const page = asNumber(searchParams.p) ?? 1;
  const perPage = (asNumber(searchParams.pp) ?? 20) as 10 | 20 | 50;

  const { items, total } = await listProducts({
    categoryId: category.id,
    min: range.min,
    max: range.max,
    page,
    perPage,
    sort: "menor-preco",
  });

  return (
    <div className="space-y-6">
      <CategoryVisitTracker categoryId={category.id} />
      <section className="zuni-site-section space-y-6" aria-labelledby="faixa-heading">
        <nav className="text-xs text-zinc-600">
          <Link href="/" className="hover:underline">
            Início
          </Link>{" "}
          <span className="text-zinc-400">/</span>{" "}
          <Link href={`/categoria/${category.slug}`} className="hover:underline">
            {category.name}
          </Link>{" "}
          <span className="text-zinc-400">/</span> <span>{range.label}</span>
        </nav>

        <div>
          <h1 id="faixa-heading" className="text-2xl font-semibold">
            {category.name} — {range.label}
          </h1>
          <p className="text-sm text-zinc-600">Total: {total}</p>
        </div>

        {items.length ? (
          <div className={PRODUCT_CARD_GRID_CLASS}>
            {items.map((p) => (
              <TrackedProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-zinc-50/80 dark:bg-zinc-900/40 ring-1 ring-zinc-200/80 dark:ring-zinc-700/60 p-6 text-sm text-zinc-600">
            Nenhum produto nesta faixa.
          </div>
        )}

        <Pagination basePath={`/categoria/${category.slug}/${range.slug}`} searchParams={searchParams} page={page} />
      </section>
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

