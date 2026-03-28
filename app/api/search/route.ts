import { NextResponse } from "next/server";
import { postgrestGet, inVal } from "@/lib/postgrest/server";
import { ilikeContainsPattern } from "@/lib/postgrest/ilike";

export const runtime = "nodejs";

async function getRows<T>(
  table: string,
  params: Record<string, string>,
): Promise<T[]> {
  try {
    const data = await postgrestGet<T[]>(table, params, "anon");
    return Array.isArray(data) ? data : [];
  } catch {
    try {
      const data = await postgrestGet<T[]>(table, params, "service");
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  let term = (searchParams.get("term") ?? "").trim();
  if (term.length > 160) term = term.slice(0, 160);

  if (!term || term.length < 1) {
    return NextResponse.json({ items: [] });
  }

  const pat = ilikeContainsPattern(term);

  const [byTextRows, categoryRows] = await Promise.all([
    getRows<{ code6: string; slug: string; title: string }>("products", {
      select: "code6,slug,title",
      is_active: "eq.true",
      or: `(title.ilike.${pat},description.ilike.${pat},description_detail.ilike.${pat})`,
      order: "created_at.desc",
      limit: "12",
    }),
    getRows<{ id: string }>("categories", {
      select: "id",
      or: `(name.ilike.${pat},slug.ilike.${pat})`,
      limit: "50",
    }),
  ]);

  const categoryIds = categoryRows.map((c) => c.id);

  let byCategory: { code6: string; slug: string; title: string }[] = [];
  if (categoryIds.length > 0) {
    byCategory = await getRows("products", {
      select: "code6,slug,title",
      is_active: "eq.true",
      category_id: inVal(categoryIds),
      order: "created_at.desc",
      limit: "12",
    });
  }

  const seen = new Set<string>();
  const items: { code6: string; slug: string; title: string }[] = [];
  for (const p of [...byTextRows, ...byCategory]) {
    if (seen.has(p.code6)) continue;
    seen.add(p.code6);
    items.push(p);
    if (items.length >= 8) break;
  }

  return NextResponse.json({ items });
}
