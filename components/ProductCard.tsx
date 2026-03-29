import Image from "next/image";
import Link from "next/link";
import { RatingStars } from "@/components/RatingStars";
import { Product } from "@/lib/store";

export function ProductCard({
  product,
}: {
  product: Pick<
    Product,
    | "code6"
    | "slug"
    | "title"
    | "images"
    | "price"
    | "promo_price"
    | "is_offer"
    | "off_percent"
    | "affiliate_url"
    | "rating"
    | "reviews_count"
  >;
}) {
  const img = product.images?.[0] ?? null;
  const listPrice = Number(product.price);
  const salePrice = product.promo_price == null ? null : Number(product.promo_price);
  const hasPromo = salePrice != null && Number.isFinite(listPrice) && salePrice < listPrice;

  return (
    <div className="zuni-product-card rounded-2xl transition overflow-hidden flex flex-col hover:border-zinc-300">
      <Link
        href={`/produto/${product.code6}/${product.slug}`}
        className="block relative aspect-square zuni-product-thumb-bg"
      >
        {img ? (
          <Image
            src={img}
            alt={product.title}
            fill
            className="object-contain p-3"
            sizes="(max-width: 768px) 50vw, 25vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-500">
            Sem imagem
          </div>
        )}

      </Link>

      <div className="p-4 flex-1 flex flex-col gap-3">
        <Link
          href={`/produto/${product.code6}/${product.slug}`}
          className="text-sm font-medium leading-snug line-clamp-2 hover:underline"
        >
          {product.title}
        </Link>

        {product.rating != null || (product.reviews_count != null && product.reviews_count > 0) ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
            <RatingStars rating={product.rating} starClassName="text-[11px]" />
            {product.rating != null ? (
              <span className="font-medium text-zinc-700 tabular-nums">
                {product.rating.toFixed(1).replace(".", ",")}
              </span>
            ) : null}
            {product.reviews_count != null && product.reviews_count > 0 ? (
              <span>
                {product.rating != null ? " · " : null}
                {product.reviews_count}{" "}
                {product.reviews_count === 1 ? "avaliação" : "avaliações"}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-auto space-y-1">
          {hasPromo ? (
            <div className="text-xs text-zinc-500 line-through">
              {formatBRL(listPrice)}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <div className={`text-base font-semibold ${hasPromo ? "text-zuni-green" : "text-zinc-900"}`}>
              {formatBRL(hasPromo ? (salePrice as number) : listPrice)}
            </div>
            {hasPromo ? (
              <span className="rounded-full bg-zuni-red text-white text-[10px] font-semibold px-2 py-0.5 shrink-0">
                OFF {product.off_percent}%
              </span>
            ) : null}
          </div>
        </div>

        <a
          href={product.affiliate_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-full items-center justify-center rounded-full bg-zuni-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-95 transition"
        >
          Comprar
        </a>
      </div>
    </div>
  );
}

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

