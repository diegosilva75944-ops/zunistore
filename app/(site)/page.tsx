import Link from "next/link";
import { Suspense } from "react";
import { siteCategorySelectOptionsWithPath } from "@/lib/categoriesSelect";
import {
  getSiteCategoriesFlatForNavigationCached,
  getSiteSettings,
  listCarouselProducts,
  listProducts,
} from "@/lib/store";
import { HomeAllProductsScroll } from "@/components/home/HomeAllProductsScroll";
import { HomeTodosProdutosFilterForm } from "@/components/home/HomeTodosProdutosFilterForm";
import { TrackedProductCard } from "@/components/TrackedProductCard";
import { PRODUCT_CARD_GRID_CLASS } from "@/lib/ui/product-grid";
import { HeroSlider } from "@/components/HeroSlider";
import { HomeRecommendationSections } from "@/components/home/HomeRecommendationSections";
import { HomeOffersSection } from "@/components/home/HomeOffersSection";
import { parseHomePerPage } from "@/lib/ui/home-listing";
import { shuffleDailyOrder } from "@/lib/dailyShuffle";

export const revalidate = 60;

export default async function Home(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = (await props.searchParams) ?? {};

  const categorySlug = asString(searchParams.categoria);
  const min = asNumber(searchParams.min);
  const max = asNumber(searchParams.max);
  const sort = (asString(searchParams.ord) ?? "recentes") as any;
  const perPage = parseHomePerPage(searchParams.pp);
  const page = asNumber(searchParams.p) ?? 1;

  const [carousel, categoriesRaw, offers, siteSettings] = await Promise.all([
    listCarouselProducts(),
    getSiteCategoriesFlatForNavigationCached(),
    listProducts({ perPage: 15, page: 1, sort: "maior-desconto" }),
    getSiteSettings(),
  ]);
  const offersBeforeHero = siteSettings?.offers_section_position === "before_hero";

  const categoryId = categorySlug ? categoriesToId(categoriesRaw, categorySlug) : null;
  const categorySelectOptions = siteCategorySelectOptionsWithPath(categoriesRaw);
  const all = await listProducts({ categoryId, min, max, sort, perPage, page });

  const heroSection = (
    <section className="zuni-site-section space-y-4" aria-labelledby="home-hero-heading">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 id="home-hero-heading" className="text-2xl md:text-3xl font-semibold tracking-tight">
            ZuniStore
          </h1>
          <p className="text-sm text-zinc-600">
            Encontre ofertas e produtos em destaque. Ao comprar, você será redirecionado para a loja original.
          </p>
        </div>
        <Link
          href="/ofertas"
          className="text-sm font-semibold text-zuni-primary hover:underline shrink-0"
        >
          Ver todas as ofertas
        </Link>
      </div>

      <HeroSlider items={carousel} />
    </section>
  );

  const offersSection = (
    <HomeOffersSection products={shuffleDailyOrder(offers.items)} />
  );

  return (
    <div className="space-y-10">
      <Suspense fallback={null}>
        <HomeAllProductsScroll />
      </Suspense>
      {offersBeforeHero ? offersSection : null}
      {heroSection}
      {!offersBeforeHero ? offersSection : null}

      <HomeRecommendationSections />

      <section
        id="todos-produtos"
        className="zuni-site-section space-y-4 scroll-mt-28 md:scroll-mt-32"
        tabIndex={-1}
        aria-labelledby="todos-produtos-heading"
      >
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <h2 id="todos-produtos-heading" className="text-xl font-semibold">
            Todos os Produtos
          </h2>
          <div className="text-sm text-zinc-600">
            Total: <span className="font-semibold text-zinc-900">{all.total}</span>
          </div>
        </div>

        <HomeTodosProdutosFilterForm className="zuni-nested-panel grid gap-3 md:grid-cols-5 rounded-2xl p-4">
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-zinc-700">Categoria</label>
            <select
              name="categoria"
              defaultValue={categorySlug ?? ""}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Todas</option>
              {categorySelectOptions.map((o) => (
                <option key={o.id} value={o.slug}>
                  {o.label}
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
                <option value="12">12</option>
                <option value="24">24</option>
                <option value="36">36</option>
              </select>
            </div>
            <button
              type="submit"
              className="rounded-full bg-zuni-primary px-5 py-2 text-sm font-semibold text-white hover:opacity-95"
            >
              Aplicar filtros
            </button>
          </div>
        </HomeTodosProdutosFilterForm>

        {all.items.length ? (
          <div className={PRODUCT_CARD_GRID_CLASS}>
            {all.items.map((p) => (
              <TrackedProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <div className="zuni-nested-panel rounded-2xl p-6 text-sm text-zinc-600">
            Nenhum produto encontrado com esses filtros.
          </div>
        )}

        <div className="flex items-center justify-between">
          <Link
            href={`${withParam(searchParams, { p: String(Math.max(1, page - 1)) })}#todos-produtos`}
            aria-disabled={page <= 1}
            scroll={false}
            className={`text-sm font-semibold ${page <= 1 ? "text-zinc-400 pointer-events-none" : "text-zuni-primary hover:underline"}`}
          >
            ← Anterior
          </Link>
          <div className="text-sm text-zinc-600">
            Página <span className="font-semibold text-zinc-900">{page}</span>
          </div>
          <Link
            href={`${withParam(searchParams, { p: String(page + 1) })}#todos-produtos`}
            scroll={false}
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

