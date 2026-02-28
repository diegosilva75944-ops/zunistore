import Image from "next/image";
import Link from "next/link";
import { Product } from "@/lib/store";

export function ProductCard({ product }: { product: Pick<Product, "code6" | "slug" | "title" | "images" | "price" | "promo_price" | "is_offer" | "off_percent" | "affiliate_url"> }) {
  const img = product.images?.[0] ?? null;
  const hasPromo = product.promo_price != null && product.promo_price < product.price;

  return (
    <div className="rounded-2xl bg-zuni-surface shadow-sm ring-1 ring-zinc-200 hover:ring-zinc-300 transition overflow-hidden flex flex-col">
      <Link href={`/produto/${product.code6}/${product.slug}`} className="block relative aspect-square bg-zinc-50">
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

        {hasPromo ? (
          <div className="absolute left-3 top-3 rounded-full bg-zuni-red text-white text-xs font-semibold px-3 py-1">
            OFF {product.off_percent}%
          </div>
        ) : null}
      </Link>

      <div className="p-4 flex-1 flex flex-col gap-3">
        <Link
          href={`/produto/${product.code6}/${product.slug}`}
          className="text-sm font-medium leading-snug line-clamp-2 hover:underline"
        >
          {product.title}
        </Link>

        <div className="mt-auto space-y-1">
          {hasPromo ? (
            <div className="text-xs text-zinc-500 line-through">
              {formatBRL(product.price)}
            </div>
          ) : null}
          <div className={`text-base font-semibold ${hasPromo ? "text-zuni-green" : "text-zinc-900"}`}>
            {formatBRL(hasPromo ? (product.promo_price as number) : product.price)}
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

