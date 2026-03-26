import { NextResponse } from "next/server";
import { postgrestGetWithCount } from "@/lib/postgrest/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const perPageParam = parseInt(searchParams.get("perPage") ?? "20", 10);
    const perPage = ([10, 20, 50].includes(perPageParam) ? perPageParam : 20) as 10 | 20 | 50;
    const q = (searchParams.get("q") ?? "").trim();
    const status = (searchParams.get("status") ?? "").trim(); // active/inactive/any

    const offset = (page - 1) * perPage;
    const params: Record<string, string> = {
      select:
        "id,product_id,external_id,external_permalink,seller_id,seller_nickname,external_category_name,external_status,external_active,imported_at,last_synced_at,products:product_id(code6,slug,title,images,price,promo_price,is_offer,off_percent,is_active,categories:category_id(id,name))",
      origin: "eq.mercadolivre",
      order: "imported_at.desc",
      offset: String(offset),
      limit: String(perPage),
    };

    if (q) {
      const pat = encodeURIComponent("%" + q + "%");
      params.or = `(external_id.ilike.${pat},seller_nickname.ilike.${pat},products.title.ilike.${pat})`;
    }
    if (status === "active") params.external_active = "eq.true";
    if (status === "inactive") params.external_active = "eq.false";

    const { data, count } = await postgrestGetWithCount<any[]>("product_external_listings", params);
    return NextResponse.json({
      ok: true,
      items: Array.isArray(data) ? data : [],
      total: count ?? 0,
      page,
      perPage,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Erro ao listar importados." }, { status: 500 });
  }
}

