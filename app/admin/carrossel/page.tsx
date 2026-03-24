import { adminListCarousel } from "@/lib/admin/db";
import { postgrestGet } from "@/lib/postgrest/server";
import { CarouselClient } from "@/app/admin/carrossel/carousel-client";

export const runtime = "nodejs";
export const revalidate = 0;

export default async function AdminCarrosselPage() {
  const [carousel, products] = await Promise.all([
    adminListCarousel(),
    postgrestGet<any[]>("products", {
      select: "id,code6,slug,title,images,price,promo_price,off_percent",
      order: "created_at.desc",
      limit: "200",
    }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Carrossel</h1>
        <p className="text-sm text-zinc-600">
          Selecione produtos e ordene por drag & drop. O carrossel será exibido como slider na home.
        </p>
      </div>

      <CarouselClient
        initialCarousel={carousel as any[]}
        products={(Array.isArray(products) ? products : []) as any[]}
      />
    </div>
  );
}

