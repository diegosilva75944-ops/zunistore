import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { listProducts, type ProductSort } from "@/lib/store";
import { TrackedProductCard } from "@/components/TrackedProductCard";
import { PRODUCT_CARD_GRID_CLASS } from "@/lib/ui/product-grid";
import { BuscarQueryTracker } from "@/components/tracking/BuscarQueryTracker";

export const revalidate = 60;

export async function generateMetadata(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const searchParams = (await props.searchParams) ?? {};
  const q = (asString(searchParams.q) ?? "").trim();
  if (!q) {
    return { title: "Busca", robots: { index: false, follow: true } };
  }
  return {
    title: `Busca: ${q}`,
    description: `Resultados da busca por «${q}» no ZuniStore.`,
    robots: { index: false, follow: true },
  };
}

const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: "recentes", label: "Recentes" },
  { value: "menor-preco", label: "Menor preço" },
  { value: "maior-preco", label: "Maior preço" },
  { value: "maior-desconto", label: "Maior desconto" },
  { value: "mais-avaliados", label: "Mais avaliados" },
];

export default async function BuscarResultadosPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = (await props.searchParams) ?? {};
  const q = (asString(searchParams.q) ?? "").trim();
  const page = asNumber(searchParams.p) ?? 1;
  const perPage = (asNumber(searchParams.pp) ?? 20) as 10 | 20 | 50;
  const sort = (asString(searchParams.ord) ?? "recentes") as ProductSort;

  if (!q) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Busca</h1>
        <p className="text-sm text-zinc-600">
          Use a caixa de busca no topo do site para pesquisar por título, descrição ou categoria.
        </p>
        <Link href="/" className="text-sm font-semibold text-zuni-primary hover:underline">
          ← Voltar ao início
        </Link>
      </div>
    );
  }

  const { items, total } = await listProducts({
    q,
    page,
    perPage,
    sort: SORT_OPTIONS.some((o) => o.value === sort) ? sort : "recentes",
  });

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <BuscarQueryTracker />
      </Suspense>
      <div>
        <h1 className="text-2xl font-semibold">Resultados da busca</h1>
        <p className="text-sm text-zinc-600 mt-1">
          Termo: <span className="font-medium text-zinc-900">«{q}»</span> · {total} produto
          {total === 1 ? "" : "s"}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-600">Ordenar:</span>
        {SORT_OPTIONS.map((o) => (
          <Link
            key={o.value}
            href={`/buscar?${qs(searchParams, { q, ord: o.value, p: "1" })}`}
            className={`rounded-full px-3 py-1 border ${
              sort === o.value
                ? "border-zuni-primary bg-zuni-purple-light text-zuni-primary font-medium"
                : "border-zinc-200 hover:bg-zinc-50"
            }`}
          >
            {o.label}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-600">Por página:</span>
        {([10, 20, 50] as const).map((n) => (
          <Link
            key={n}
            href={`/buscar?${qs(searchParams, { q, pp: String(n), p: "1" })}`}
            className={`rounded-full px-3 py-1 border ${
              perPage === n
                ? "border-zuni-primary bg-zuni-purple-light font-medium"
                : "border-zinc-200 hover:bg-zinc-50"
            }`}
          >
            {n}
          </Link>
        ))}
      </div>

      {items.length ? (
        <div className={PRODUCT_CARD_GRID_CLASS}>
          {items.map((p) => (
            <TrackedProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-white ring-1 ring-zinc-200 p-6 text-sm text-zinc-600">
          Nenhum produto encontrado para «{q}». Tente outras palavras ou confira as{" "}
          <Link href="/categorias" className="text-zuni-primary font-medium hover:underline">
            categorias
          </Link>
          .
        </div>
      )}

      {total > 0 ? <Pagination searchParams={searchParams} page={page} /> : null}
    </div>
  );
}

function Pagination({
  searchParams,
  page,
}: {
  searchParams: Record<string, string | string[] | undefined>;
  page: number;
}) {
  const prev = page <= 1 ? null : `/buscar?${qs(searchParams, { p: String(page - 1) })}`;
  const next = `/buscar?${qs(searchParams, { p: String(page + 1) })}`;

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
