import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { CarouselClient } from "@/app/admin/carrossel/carousel-client";

export const runtime = "nodejs";
export const revalidate = 0;

export default async function AdminCarrosselPage() {
  const supabase = getSupabaseServiceRoleClient();

  const [{ data: carousel }, { data: products }] = await Promise.all([
    supabase
      .from("carousel_items")
      .select("id, product_id, sort_order, size, products:product_id (id, code6, slug, title, images)")
      .order("sort_order", { ascending: true }),
    supabase
      .from("products")
      .select("id, code6, slug, title, images")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Carrossel</h1>
        <p className="text-sm text-zinc-600">
          Selecione produtos, ordene por drag & drop e defina o tamanho (S/M/G).
        </p>
      </div>

      <CarouselClient
        initialCarousel={(carousel ?? []) as any[]}
        products={(products ?? []) as any[]}
      />
    </div>
  );
}

