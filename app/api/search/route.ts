import { NextResponse } from "next/server";
import { postgrestGet, inVal } from "@/lib/postgrest/server";

export const runtime = "nodejs";

/** Padrão ilike %term% já escapado para URL (PostgREST). */
function ilikePattern(term: string): string {
  const escaped = term.replace(/%/g, "\\%").replace(/_/g, "\\_");
  return encodeURIComponent("%" + escaped + "%");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  let term = (searchParams.get("term") ?? "").trim();
  if (term.length > 160) term = term.slice(0, 160);

  if (!term || term.length < 2) {
    return NextResponse.json({ items: [] });
  }

  const pat = ilikePattern(term);

  const [byTextRows, categoryRows] = await Promise.all([
    postgrestGet<any[]>(
      "products",
      {
        select: "code6,slug,title",
        is_active: "eq.true",
        or: `(title.ilike.${pat},description.ilike.${pat},description_detail.ilike.${pat})`,
        order: "created_at.desc",
        limit: "12",
      },
      "anon",
    ),
    postgrestGet<any[]>(
      "categories",
      {
        select: "id",
        or: `(name.ilike.${pat},slug.ilike.${pat})`,
        limit: "50",
      },
      "anon",
    ),
  ]);

  const categoryIds = (Array.isArray(categoryRows) ? categoryRows : []).map((c) => c.id);

  let byCategory: { code6: string; slug: string; title: string }[] = [];
  if (categoryIds.length > 0) {
    const data = await postgrestGet<any[]>(
      "products",
      {
        select: "code6,slug,title",
        is_active: "eq.true",
        category_id: inVal(categoryIds),
        order: "created_at.desc",
        limit: "12",
      },
      "anon",
    );
    byCategory = Array.isArray(data) ? data : [];
  }

  const seen = new Set<string>();
  const items: { code6: string; slug: string; title: string }[] = [];
  for (const p of [...(Array.isArray(byTextRows) ? byTextRows : []), ...byCategory]) {
    const row = p as { code6: string; slug: string; title: string };
    if (seen.has(row.code6)) continue;
    seen.add(row.code6);
    items.push(row);
    if (items.length >= 8) break;
  }

  return NextResponse.json({ items });
}
