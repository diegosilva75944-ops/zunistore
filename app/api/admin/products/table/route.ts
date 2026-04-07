import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { postgrestGetWithCount } from "@/lib/postgrest/server";

export const runtime = "nodejs";

/** Colunas legíveis (sem `search_tsv` / `title_norm` geridos pelo BD). */
const SELECT =
  "id,code6,slug,title,description,description_detail,images,category_id,price,promo_price,is_offer,off_percent,rating,reviews_count,affiliate_code,affiliate_url,source_url,needs_update,last_seen_at,affiliate_valid_checked_at,affiliate_valid,is_active,created_at,updated_at,effective_price";

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));
    const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

    const { data, count } = await postgrestGetWithCount<unknown[]>("products", {
      select: SELECT,
      order: "created_at.desc",
      limit: String(limit),
      offset: String(offset),
    });

    return NextResponse.json({
      ok: true,
      items: Array.isArray(data) ? data : [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
