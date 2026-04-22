import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/site-url";
import { getCategoryBreadcrumbTrail } from "@/lib/categories-tree";
import { getCategoryById, getSiteCategoriesFlatForNavigationCached, listRelatedProducts } from "@/lib/store";
import { loadPdpSeoContext } from "@/lib/pdp-seo-cache";
import { TrackedProductCard } from "@/components/TrackedProductCard";
import { PRODUCT_CARD_GRID_CLASS } from "@/lib/ui/product-grid";
import { ProductPageTracker } from "@/components/tracking/ProductPageTracker";
import { ProductGallery } from "@/components/ProductGallery";
import { RatingStars } from "@/components/RatingStars";
import {
  productDescriptionLooksLikeHtml,
  sanitizeProductDescriptionHtml,
  stripHtmlToPlainText,
} from "@/lib/sanitize-product-description-html";

export const revalidate = 300;

export async function generateMetadata(props: {
  params: Promise<{ code6: string; slug: string }>;
}): Promise<Metadata> {
  const { code6, slug } = await props.params;
  const { product, resolution } = await loadPdpSeoContext(code6, slug);
  if (resolution.redirectTo) {
    return { title: "Redirecionando…", robots: { index: false, follow: true } };
  }
  if (!product || resolution.status === 404) {
    return { title: "Produto não encontrado", robots: { index: false, follow: true } };
  }

  const listPriceMeta = Number(product.price);
  const salePriceMeta = product.promo_price == null ? null : Number(product.promo_price);
  const hasPromo = salePriceMeta != null && Number.isFinite(listPriceMeta) && salePriceMeta < listPriceMeta;
  const finalPrice = hasPromo ? (salePriceMeta as number) : listPriceMeta;
  const priceStr = formatBRL(finalPrice);

  const baseUrl = await getBaseUrl();
  const productUrl = `${baseUrl}/produto/${product.code6}/${product.slug}`;

  const title = product.title;
  // Sem descrição longa no preview do link — só preço destacado
  const description = `💰 ${priceStr}`;

  // Imagem principal do banco (URL já armazenada) para o preview no compartilhamento
  const mainImage = product.images?.[0];
  const ogImageUrl =
    typeof mainImage === "string" && mainImage.startsWith("http") ? mainImage : undefined;

  const robots =
    resolution.shouldIndex ? undefined : ({ index: false, follow: true } as const);

  return {
    title: `${title} (${product.code6})`,
    description,
    alternates: { canonical: productUrl },
    robots,
    openGraph: {
      title,
      description,
      url: productUrl,
      images: ogImageUrl
        ? [{ url: ogImageUrl, width: 1200, height: 630, alt: title }]
        : undefined,
      type: "website",
    },
    twitter: {
      card: ogImageUrl ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImageUrl ? [ogImageUrl] : undefined,
    },
  };
}

export default async function ProdutoPage(props: {
  params: Promise<{ code6: string; slug: string }>;
}) {
  const { code6, slug } = await props.params;
  const { product, resolution } = await loadPdpSeoContext(code6, slug);
  if (resolution.redirectTo) permanentRedirect(resolution.redirectTo);
  if (resolution.status === 404 || !product) notFound();

  const unavailable = product.is_active === false;

  const category = await getCategoryById(product.category_id);
  const categoriesFlat = await getSiteCategoriesFlatForNavigationCached();
  const categoryTrail = category ? getCategoryBreadcrumbTrail(category.id, categoriesFlat) : [];
  const related = await listRelatedProducts({
    categoryId: product.category_id?.trim() || null,
    title: product.title,
    excludeCode6: product.code6,
    limit: 8,
  });

  const listPriceMeta = Number(product.price);
  const salePriceMeta = product.promo_price == null ? null : Number(product.promo_price);
  const hasPromo = salePriceMeta != null && Number.isFinite(listPriceMeta) && salePriceMeta < listPriceMeta;
  const finalPrice = hasPromo ? (salePriceMeta as number) : listPriceMeta;

  const baseUrl = await getBaseUrl();
  const pageUrl = `${baseUrl}/produto/${product.code6}/${product.slug}`;

  const wa = `https://wa.me/?text=${encodeURIComponent(
    `🛒 ${product.title} — 💰 ${formatBRL(finalPrice)} 💰 — ${pageUrl}`,
  )}`;
  const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`;

  const ldJson = buildProductJsonLd(product, pageUrl, unavailable);

  return (
    <div className="space-y-8">
      {unavailable ? (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          <p className="font-semibold">Produto indisponível no momento</p>
          <p className="mt-1 text-amber-900/90">
            O anúncio na loja de origem não está mais disponível. Confira abaixo opções similares ainda
            ativas no site.
          </p>
        </div>
      ) : null}
      <ProductPageTracker
        product={{
          id: product.id,
          code6: product.code6,
          slug: product.slug,
          title: product.title,
          images: product.images ?? [],
          category_id: product.category_id,
          price: product.price,
          promo_price: product.promo_price,
          is_offer: product.is_offer,
          off_percent: product.off_percent,
          affiliate_url: product.affiliate_url,
          rating: product.rating,
          reviews_count: product.reviews_count,
        }}
      />
      <nav className="text-xs text-zinc-600 flex flex-wrap items-center gap-x-1 gap-y-0.5">
        <Link href="/" className="hover:underline">
          Início
        </Link>
        {categoryTrail.map((c) => (
          <span key={c.id} className="contents">
            <span className="text-zinc-400">/</span>
            <Link href={`/categoria/${c.slug}`} className="hover:underline">
              {c.name}
            </Link>
          </span>
        ))}
        {categoryTrail.length === 0 && category ? (
          <>
            <span className="text-zinc-400">/</span>
            <Link href={`/categoria/${category.slug}`} className="hover:underline">
              {category.name}
            </Link>
          </>
        ) : null}
        {!category ? (
          <>
            <span className="text-zinc-400">/</span>
            <span>Produto</span>
          </>
        ) : null}
        <span className="text-zinc-400">/</span>
        <span>{product.code6}</span>
      </nav>

      <section className="zuni-site-section grid gap-6 md:grid-cols-2 md:gap-8">
        <div className="zuni-nested-panel rounded-xl overflow-hidden p-2">
          <ProductGallery
            images={product.images ?? []}
            title={product.title}
          />
        </div>

        <div className="space-y-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              {product.title}
            </h1>
            <div className="text-sm text-zinc-600 mt-1">
              Código: <span className="font-mono font-semibold">{product.code6}</span>
            </div>
          </div>

          <div className="zuni-nested-panel rounded-xl p-5 space-y-2">
            {hasPromo ? (
              <div className="text-sm text-zinc-500 line-through">{formatBRL(listPriceMeta)}</div>
            ) : null}
            <div className={`text-3xl font-bold ${hasPromo ? "text-zuni-green" : "text-zinc-900"}`}>
              {formatBRL(finalPrice)}
            </div>
            {hasPromo ? (
              <div className="inline-flex items-center gap-2 text-sm">
                <span className="rounded-full bg-zuni-red text-white text-xs font-semibold px-3 py-1">
                  OFF {product.off_percent}%
                </span>
                <span className="text-zinc-600">
                  Promoção por tempo limitado (na loja original).
                </span>
              </div>
            ) : null}

            <p className="text-xs text-amber-950/90 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 leading-relaxed">
              Os preços exibidos aqui são informativos e podem ser alterados pelo vendedor no site original. Confira sempre o valor final na loja antes de concluir a compra.
            </p>

            <div className="pt-1 flex flex-col gap-3">
              {unavailable ? (
                <p className="text-sm text-zinc-600 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                  Link de compra oculto enquanto o produto estiver marcado como indisponível. Atualize o
                  link de afiliado no admin para reativar.
                </p>
              ) : (
                <a
                  href={product.affiliate_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-full bg-zuni-primary px-5 py-3 text-sm font-semibold text-white hover:opacity-95 transition"
                >
                  Comprar (nova aba)
                </a>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={wa}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-full border border-zinc-200 px-4 py-2 text-xs font-semibold hover:bg-zuni-purple-light transition"
                >
                  Compartilhar WhatsApp
                </a>
                <a
                  href={fb}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-full border border-zinc-200 px-4 py-2 text-xs font-semibold hover:bg-zuni-purple-light transition"
                >
                  Compartilhar Facebook
                </a>
              </div>
            </div>

            {(product.rating != null || product.reviews_count != null) ? (
              <div className="pt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-700">
                <RatingStars rating={product.rating} starClassName="text-lg" />
                <span className="font-semibold text-zinc-900 tabular-nums">
                  {product.rating != null ? product.rating.toFixed(1).replace(".", ",") : "—"}
                </span>
                <span className="text-zinc-600">
                  ({product.reviews_count ?? 0}{" "}
                  {(product.reviews_count ?? 0) === 1 ? "avaliação" : "avaliações"})
                </span>
              </div>
            ) : null}
          </div>

          {product.description?.trim() ? (
            <div className="zuni-nested-panel rounded-xl p-5 space-y-3">
              <h2 className="text-base font-semibold text-zinc-900">Informações do Produto</h2>
              <div className="text-sm text-zinc-700 space-y-1.5">
                {splitDescriptionIntoLines(product.description).map((line, i) => (
                  <p key={i} className="leading-relaxed">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {product.description_detail?.trim() ? (
        <section className="zuni-site-section space-y-4">
          <div>
            <h2 className="text-lg md:text-xl font-semibold text-zinc-900 mb-3">Descrição completa</h2>
            {productDescriptionLooksLikeHtml(product.description_detail) ? (
              <div
                className="product-description-html text-base md:text-lg text-zinc-800 leading-relaxed max-w-none [&_img]:mx-auto [&_img]:block [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-zuni-primary [&_a]:underline"
                dangerouslySetInnerHTML={{
                  __html: sanitizeProductDescriptionHtml(product.description_detail),
                }}
              />
            ) : (
              <div className="text-base md:text-lg text-zinc-800 whitespace-pre-wrap leading-relaxed">
                {product.description_detail}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {related.length ? (
        <section className="zuni-site-section space-y-4" aria-labelledby="related-products-heading">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-100 pb-4">
            <div>
              <h2 id="related-products-heading" className="text-xl font-semibold text-zinc-900">
                {unavailable ? "Produtos similares" : "Produtos Relacionados"}
              </h2>
              <p className="text-sm text-zinc-600 mt-1">
                {unavailable ?
                  category ?
                    `Sugestões ainda disponíveis em ${category.name}`
                  : "Sugestões ainda disponíveis no site"
                : category ?
                  `Outras opções em ${category.name}`
                : "Outras opções que podem te interessar"}
              </p>
            </div>
            {category ? (
              <Link
                href={`/categoria/${category.slug}`}
                className="text-sm font-semibold text-zuni-primary hover:underline shrink-0"
              >
                Ver categoria completa
              </Link>
            ) : null}
          </div>
          <div className={PRODUCT_CARD_GRID_CLASS}>
            {related.map((p) => (
              <TrackedProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      ) : null}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ldJson) }}
      />
    </div>
  );
}

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

/** Cada trecho separado por | vira uma linha (em vez de pipe inline). */
function splitDescriptionIntoLines(text: string): string[] {
  const t = String(text || "").trim();
  if (!t) return [];
  if (!t.includes("|")) return [t];
  return t.split(/\|/).map((s) => s.trim()).filter(Boolean);
}

function buildProductJsonLd(product: any, pageUrl: string, unavailable?: boolean) {
  const list = Number(product.price);
  const sale = product.promo_price == null ? null : Number(product.promo_price);
  const price = sale != null && Number.isFinite(list) && sale < list ? sale : list;
  const descRaw = [product.description, product.description_detail]
    .filter((s: string) => typeof s === "string" && s.trim())
    .join("\n\n")
    .trim();
  const descFull = stripHtmlToPlainText(descRaw) || descRaw;
  const base: any = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    image: Array.isArray(product.images) ? product.images : [],
    description: descFull || stripHtmlToPlainText(String(product.description ?? "")),
    sku: product.code6,
    offers: {
      "@type": "Offer",
      priceCurrency: "BRL",
      price: String(price),
      url: pageUrl,
      availability: unavailable
        ? "https://schema.org/OutOfStock"
        : "https://schema.org/InStock",
    },
  };

  if (product.rating != null && product.reviews_count != null) {
    base.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: String(product.rating),
      reviewCount: String(product.reviews_count),
    };
  }

  return base;
}

