import type { Metadata } from "next";
import { listProducts } from "@/lib/store";
import { robotsForListing } from "@/lib/seo";
import { ProductCard } from "@/components/ProductCard";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const { total } = await listProducts({ onlyOffers: true, perPage: 10, page: 1 });
  return {
    title: "Ofertas",
    description: "Confira as melhores ofertas no ZuniStore.",
    robots: robotsForListing(total, 8),
  };
}

export default async function OfertasPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = (await props.searchParams) ?? {};
  const page = asNumber(searchParams.p) ?? 1;
  const perPage = (asNumber(searchParams.pp) ?? 20) as 10 | 20 | 50;

  const { items, total } = await listProducts({
    onlyOffers: true,
    sort: "maior-desconto",
    page,
    perPage,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ofertas</h1>
        <p className="text-sm text-zinc-600">Total: {total}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>

      <Pagination basePath="/ofertas" searchParams={searchParams} page={page} />
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
      <a
        href={prev ?? "#"}
        aria-disabled={!prev}
        className={`text-sm font-semibold ${prev ? "text-zuni-primary hover:underline" : "text-zinc-400 pointer-events-none"}`}
      >
        ← Anterior
      </a>
      <div className="text-sm text-zinc-600">
        Página <span className="font-semibold text-zinc-900">{page}</span>
      </div>
      <a href={next} className="text-sm font-semibold text-zuni-primary hover:underline">
        Próxima →
      </a>
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

