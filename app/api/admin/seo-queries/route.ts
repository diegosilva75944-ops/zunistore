import { NextResponse } from "next/server";
import { postgrestGet } from "@/lib/postgrest/server";

export const runtime = "nodejs";

export async function GET() {
  const data = await postgrestGet<any[]>("seo_queries", {
    select: "id,slug,title,description,query_terms,category_id,is_indexable,min_results,created_at,updated_at",
    order: "created_at.desc",
    limit: "500",
  });
  return NextResponse.json({ ok: true, items: Array.isArray(data) ? data : [] });
}

