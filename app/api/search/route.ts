import { NextResponse } from "next/server";
import { getSupabaseAnonServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const term = (searchParams.get("term") ?? "").trim();

  if (!term || term.length < 2) {
    return NextResponse.json({ items: [] });
  }

  const supabase = getSupabaseAnonServerClient();
  const { data } = await supabase
    .from("products")
    .select("code6, slug, title, categories:category_id (name)")
    .or(`title.ilike.%${term}%,description.ilike.%${term}%,categories.name.ilike.%${term}%`)
    .order("created_at", { ascending: false })
    .limit(8);

  const items =
    (data ?? []).map((p: any) => ({
      code6: p.code6 as string,
      slug: p.slug as string,
      title: p.title as string,
    })) ?? [];

  return NextResponse.json({ items });
}

