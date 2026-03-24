import { NextResponse } from "next/server";
import { postgrestGet, inVal } from "@/lib/postgrest/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const term = (searchParams.get("term") ?? "").trim();

  if (!term || term.length < 2) {
    return NextResponse.json({ items: [] });
  }

  const pat = encodeURIComponent("%" + term.replace(/%/g, "\\%").replace(/_/g, "\\_") + "%");

  const byText = await postgrestGet<any[]>("products", {
    select: "code6,slug,title",
    or: `(title.ilike.${pat},description.ilike.${pat})`,
    order: "created_at.desc",
    limit: "8",
  }, "anon");

  const categories = await postgrestGet<any[]>("categories", {
    select: "id",
    name: `ilike.${pat}`,
  }, "anon");
  const categoryIds = (Array.isArray(categories) ? categories : []).map((c) => c.id);

  let byCategory: { code6: string; slug: string; title: string }[] = [];
  if (categoryIds.length > 0) {
    const data = await postgrestGet<any[]>("products", {
      select: "code6,slug,title",
      category_id: inVal(categoryIds),
      order: "created_at.desc",
      limit: "8",
    }, "anon");
    byCategory = Array.isArray(data) ? data : [];
  }

  const seen = new Set<string>();
  const items: { code6: string; slug: string; title: string }[] = [];
  for (const p of [...(Array.isArray(byText) ? byText : []), ...byCategory]) {
    const row = p as { code6: string; slug: string; title: string };
    if (seen.has(row.code6)) continue;
    seen.add(row.code6);
    items.push(row);
    if (items.length >= 8) break;
  }

  return NextResponse.json({ items });
}

