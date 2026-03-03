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
  const safeTerm = term.replace(/%/g, "\\%").replace(/_/g, "\\_");

  // Buscar por título/descrição (ilike no próprio produto)
  const { data: byText } = await supabase
    .from("products")
    .select("code6, slug, title")
    .or(`title.ilike.%${safeTerm}%,description.ilike.%${safeTerm}%`)
    .order("created_at", { ascending: false })
    .limit(8);

  // Buscar categorias pelo nome e obter IDs
  const { data: categories } = await supabase
    .from("categories")
    .select("id")
    .ilike("name", `%${safeTerm}%`);
  const categoryIds = (categories ?? []).map((c: { id: string }) => c.id);

  let byCategory: { code6: string; slug: string; title: string }[] = [];
  if (categoryIds.length > 0) {
    const { data } = await supabase
      .from("products")
      .select("code6, slug, title")
      .in("category_id", categoryIds)
      .order("created_at", { ascending: false })
      .limit(8);
    byCategory = (data ?? []) as { code6: string; slug: string; title: string }[];
  }

  // Unir e remover duplicatas por code6, mantendo ordem (texto primeiro)
  const seen = new Set<string>();
  const items: { code6: string; slug: string; title: string }[] = [];
  for (const p of [...(byText ?? []), ...byCategory]) {
    const row = p as { code6: string; slug: string; title: string };
    if (seen.has(row.code6)) continue;
    seen.add(row.code6);
    items.push(row);
    if (items.length >= 8) break;
  }

  return NextResponse.json({ items });
}

