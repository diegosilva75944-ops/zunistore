import Link from "next/link";
import { listCarouselProducts, listProducts, listSeedCategories } from "@/lib/store";
import { ProductCard } from "@/components/ProductCard";

export const revalidate = 60;

export default async function Home(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = (await props.searchParams) ?? {};

  const categorySlug = asString(searchParams.categoria);
  const min = asNumber(searchParams.min);
  const max = asNumber(searchParams.max);
  const sort = (asString(searchParams.ord) ?? "recentes") as any;
  const perPage = (asNumber(searchParams.pp) ?? 20) as 10 | 20 | 50;
  const page = asNumber(searchParams.p) ?? 1;

  const [carousel, categories, offers] = await Promise.all([
    listCarouselProducts(),
    listSeedCategories(),
    listProducts({ onlyOffers: true, perPage: 10, page: 1, sort: "maior-desconto" }),
  ]);

  const categoryId = categorySlug ? categoriesToId(categories, categorySlug) : null;
  const all = await listProducts({ categoryId, min, max, sort, perPage, page });

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              ZuniStore
            </h1>
            <p className="text-sm text-zinc-600">
              Encontre ofertas e produtos em destaque. Ao comprar, você será redirecionado para a loja original.
            </p>
          </div>
          <Link
            href="/ofertas"
            className="text-sm font-semibold text-zuni-primary hover:underline"
          >
            Ver todas as ofertas
          </Link>
        </div>

        {carousel.length ? (
          <div className="grid gap-4 md:grid-cols-3">
            {carousel.slice(0, 6).map((c) => (
              <Link
                key={c.id}
                href={`/produto/${c.product.code6}/${c.product.slug}`}
                className="rounded-2xl bg-white ring-1 ring-zinc-200 hover:ring-zinc-300 transition overflow-hidden flex"
              >
                <div className="p-4 flex-1">
                  <div className="text-xs text-zinc-500 mb-1">Destaque</div>
                  <div className="font-semibold leading-snug line-clamp-2">
                    {c.product.title}
                  </div>
                  <div className="mt-3 text-sm font-semibold text-zuni-green">
                    {formatBRL(c.product.promo_price ?? c.product.price)}
                  </div>
                  {c.product.promo_price != null && c.product.promo_price < c.product.price ? (
                    <div className="mt-1 text-xs text-zuni-red font-semibold">
                      OFF {c.product.off_percent}%
                    </div>
                  ) : null}
                </div>
                <div className="w-28 bg-zuni-purple-light flex items-center justify-center text-xs font-semibold text-zuni-primary">
                  {c.size}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-white ring-1 ring-zinc-200 p-6 text-sm text-zinc-600">
            Sem destaques no carrossel ainda.
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-semibold">Produtos em Oferta</h2>
          <Link href="/ofertas" className="text-sm text-zuni-primary hover:underline">
            Ver mais
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {offers.items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <h2 className="text-xl font-semibold">Todos os Produtos</h2>
          <div className="text-sm text-zinc-600">
            Total: <span className="font-semibold text-zinc-900">{all.total}</span>
          </div>
        </div>

        <form className="grid gap-3 md:grid-cols-5 rounded-2xl bg-white ring-1 ring-zinc-200 p-4">
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-zinc-700">Categoria</label>
            <select
              name="categoria"
              defaultValue={categorySlug ?? ""}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Todas</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-700">Min (R$)</label>
            <input
              name="min"
              defaultValue={min ?? ""}
              inputMode="numeric"
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-700">Max (R$)</label>
            <input
              name="max"
              defaultValue={max ?? ""}
              inputMode="numeric"
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-700">Ordenação</label>
            <select
              name="ord"
              defaultValue={sort}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              <option value="recentes">Recentes</option>
              <option value="menor-preco">Menor preço</option>
              <option value="maior-desconto">Maior desconto</option>
              <option value="mais-avaliados">Mais avaliados</option>
              <option value="maior-preco">Maior preço</option>
            </select>
          </div>

          <div className="md:col-span-5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-zinc-700">Paginação</label>
              <select
                name="pp"
                defaultValue={String(perPage)}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
            </div>
            <button className="rounded-full bg-zuni-primary px-5 py-2 text-sm font-semibold text-white hover:opacity-95">
              Aplicar filtros
            </button>
          </div>
        </form>

        {all.items.length ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {all.items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-white ring-1 ring-zinc-200 p-6 text-sm text-zinc-600">
            Nenhum produto encontrado com esses filtros.
          </div>
        )}

        <div className="flex items-center justify-between">
          <Link
            href={withParam(searchParams, { p: String(Math.max(1, page - 1)) })}
            aria-disabled={page <= 1}
            className={`text-sm font-semibold ${page <= 1 ? "text-zinc-400 pointer-events-none" : "text-zuni-primary hover:underline"}`}
          >
            ← Anterior
          </Link>
          <div className="text-sm text-zinc-600">
            Página <span className="font-semibold text-zinc-900">{page}</span>
          </div>
          <Link
            href={withParam(searchParams, { p: String(page + 1) })}
            className="text-sm font-semibold text-zuni-primary hover:underline"
          >
            Próxima →
          </Link>
        </div>
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

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function withParam(
  searchParams: Record<string, string | string[] | undefined>,
  patch: Record<string, string>,
) {
  const url = new URL("http://local/");
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === "string") url.searchParams.set(k, v);
    else if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
  }
  for (const [k, v] of Object.entries(patch)) url.searchParams.set(k, v);
  return `/?${url.searchParams.toString()}`;
}

function categoriesToId(categories: { id: string; slug: string }[], slug: string) {
  return categories.find((c) => c.slug === slug)?.id ?? null;
}

