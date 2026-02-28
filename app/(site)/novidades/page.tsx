import type { Metadata } from "next";
import { listProducts } from "@/lib/store";
import { robotsForListing } from "@/lib/seo";
import { ProductCard } from "@/components/ProductCard";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const { total } = await listProducts({ perPage: 10, page: 1, sort: "recentes" });
  return {
    title: "Novidades",
    description: "Últimos produtos adicionados no ZuniStore.",
    robots: robotsForListing(total, 8),
  };
}

export default async function NovidadesPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = (await props.searchParams) ?? {};
  const page = asNumber(searchParams.p) ?? 1;
  const perPage = (asNumber(searchParams.pp) ?? 20) as 10 | 20 | 50;

  const { items, total } = await listProducts({
    sort: "recentes",
    page,
    perPage,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Novidades</h1>
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

