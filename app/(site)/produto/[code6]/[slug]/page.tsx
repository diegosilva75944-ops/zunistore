import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getOptionalEnv } from "@/lib/env";
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

  const title = `${product.title} (${product.code6})`;
  const description =
    product.description?.slice(0, 155) ||
    "Veja detalhes do produto e compre no site original (nova aba).";

  const env = getOptionalEnv();
  const url =
    env?.NEXT_PUBLIC_SITE_URL
      ? `${env.NEXT_PUBLIC_SITE_URL}/produto/${product.code6}/${product.slug}`
      : undefined;

  const ogImage = product.images?.[0] ?? undefined;

  return {
    title,
    description,
    alternates: url ? { canonical: url } : undefined,
    openGraph: {
      title,
      description,
      url,
      images: ogImage ? [{ url: ogImage }] : undefined,
      type: "website",
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
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
    categoryId: product.category_id,
    title: product.title,
    excludeCode6: product.code6,
    limit: 8,
  });

  const hasPromo = product.promo_price != null && product.promo_price < product.price;
  const finalPrice = hasPromo ? (product.promo_price as number) : product.price;

  const env = getOptionalEnv();
  const pageUrl =
    env?.NEXT_PUBLIC_SITE_URL
      ? `${env.NEXT_PUBLIC_SITE_URL}/produto/${product.code6}/${product.slug}`
      : `/produto/${product.code6}/${product.slug}`;

  const wa = `https://wa.me/?text=${encodeURIComponent(
    `Confira: ${product.title} por ${formatBRL(finalPrice)} — ${pageUrl}`,
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

          <div className="rounded-2xl bg-white ring-1 ring-zinc-200 p-5">
            <h2 className="font-semibold mb-2">Descrição</h2>
            <div className="text-sm text-zinc-700 whitespace-pre-wrap">
              {product.description || "Sem descrição."}
            </div>
          </div>
        </div>
      </section>

      {related.length ? (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Relacionados</h2>
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
  const base: any = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    image: Array.isArray(product.images) ? product.images : [],
    description: product.description,
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

