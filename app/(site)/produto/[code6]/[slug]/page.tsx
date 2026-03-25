import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/site-url";
import { getCategoryById, getProductByCode6, listRelatedProducts } from "@/lib/store";
import { ProductCard } from "@/components/ProductCard";
import { ProductGallery } from "@/components/ProductGallery";

export const revalidate = 300;

export async function generateMetadata(props: {
  params: Promise<{ code6: string; slug: string }>;
}): Promise<Metadata> {
  const { code6 } = await props.params;
  const product = await getProductByCode6(code6);
  if (!product) return { title: "Produto não encontrado" };

  const hasPromo = product.promo_price != null && product.promo_price < product.price;
  const finalPrice = hasPromo ? (product.promo_price as number) : product.price;
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

  return {
    title: `${title} (${product.code6})`,
    description,
    alternates: { canonical: productUrl },
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
  const { code6 } = await props.params;
  const product = await getProductByCode6(code6);
  if (!product) notFound();

  const category = await getCategoryById(product.category_id);
  const related = await listRelatedProducts({
    categoryId: product.category_id?.trim() || null,
    title: product.title,
    excludeCode6: product.code6,
    limit: 8,
  });

  const hasPromo = product.promo_price != null && product.promo_price < product.price;
  const finalPrice = hasPromo ? (product.promo_price as number) : product.price;

  const baseUrl = await getBaseUrl();
  const pageUrl = `${baseUrl}/produto/${product.code6}/${product.slug}`;

  const wa = `https://wa.me/?text=${encodeURIComponent(
    `🛒 ${product.title} — 💰 ${formatBRL(finalPrice)} 💰 — ${pageUrl}`,
  )}`;
  const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`;

  const ldJson = buildProductJsonLd(product, pageUrl);

  return (
    <div className="space-y-8">
      <nav className="text-xs text-zinc-600">
        <Link href="/" className="hover:underline">
          Início
        </Link>{" "}
        <span className="text-zinc-400">/</span>{" "}
        {category ? (
          <Link href={`/categoria/${category.slug}`} className="hover:underline">
            {category.name}
          </Link>
        ) : (
          <span>Produto</span>
        )}{" "}
        <span className="text-zinc-400">/</span> <span>{product.code6}</span>
      </nav>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl bg-white ring-1 ring-zinc-200 overflow-hidden p-2">
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

          <div className="rounded-2xl bg-white ring-1 ring-zinc-200 p-5 space-y-2">
            {hasPromo ? (
              <div className="text-sm text-zinc-500 line-through">{formatBRL(product.price)}</div>
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

            <div className="pt-3 flex flex-col gap-3">
              <a
                href={product.affiliate_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-full bg-zuni-primary px-5 py-3 text-sm font-semibold text-white hover:opacity-95 transition"
              >
                Comprar (nova aba)
              </a>
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
              <div className="pt-3 text-sm text-zinc-700">
                <span className="font-semibold text-zinc-900">
                  {product.rating != null ? product.rating.toFixed(1) : "—"}
                </span>{" "}
                <span className="text-zuni-yellow">★★★★★</span>{" "}
                <span className="text-zinc-600">
                  ({product.reviews_count ?? 0} avaliações)
                </span>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl bg-white ring-1 ring-zinc-200 p-5 space-y-4">
            <div>
              <h2 className="font-semibold mb-2">Descrição</h2>
              <div className="text-sm text-zinc-700 whitespace-pre-wrap">
                {product.description || "Sem descrição."}
              </div>
            </div>
            {product.description_detail?.trim() ? (
              <div>
                <h3 className="text-sm font-semibold text-zinc-800 mb-2">Descrição completa</h3>
                <div className="text-base md:text-lg text-zinc-800 whitespace-pre-wrap leading-relaxed">
                  {product.description_detail}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {related.length ? (
        <section
          className="rounded-2xl bg-white ring-1 ring-zinc-200 p-5 md:p-6 space-y-4"
          aria-labelledby="related-products-heading"
        >
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-100 pb-4">
            <div>
              <h2 id="related-products-heading" className="text-xl font-semibold text-zinc-900">
                Produtos Relacionados
              </h2>
              <p className="text-sm text-zinc-600 mt-1">
                {category
                  ? `Outras opções em ${category.name}`
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
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

function buildProductJsonLd(product: any, pageUrl: string) {
  const price = product.promo_price ?? product.price;
  const descFull = [product.description, product.description_detail]
    .filter((s: string) => typeof s === "string" && s.trim())
    .join("\n\n")
    .trim();
  const base: any = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    image: Array.isArray(product.images) ? product.images : [],
    description: descFull || product.description,
    sku: product.code6,
    offers: {
      "@type": "Offer",
      priceCurrency: "BRL",
      price: String(price),
      url: pageUrl,
      availability: "https://schema.org/InStock",
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

