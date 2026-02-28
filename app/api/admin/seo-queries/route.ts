import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = getSupabaseServiceRoleClient();
  const { data } = await supabase
    .from("seo_queries")
    .select("id, slug, title, description, query_terms, category_id, is_indexable, min_results, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(500);
  return NextResponse.json({ ok: true, items: data ?? [] });
}

