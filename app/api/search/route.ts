import { NextResponse } from "next/server";
import { postgrestGet, inVal } from "@/lib/postgrest/server";
import { ilikeContainsPattern } from "@/lib/postgrest/ilike";
import { collectDescendantCategoryIds } from "@/lib/categories-tree";
import { applyAffiliateVisibleToProductParams } from "@/lib/store";

export const runtime = "nodejs";

function isAffiliateFilterError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /42703|affiliate_valid|PGRST204|does not exist|column/i.test(msg);
}

async function getRows<T>(table: string, params: Record<string, string>): Promise<T[]> {
  const run = async (p: Record<string, string>): Promise<T[]> => {
    try {
      const data = await postgrestGet<T[]>(table, p, "anon");
      return Array.isArray(data) ? data : [];
    } catch (e) {
      try {
        const data = await postgrestGet<T[]>(table, p, "service");
        return Array.isArray(data) ? data : [];
      } catch {
        throw e;
      }
    }
  };
  try {
    const p = { ...params };
    applyAffiliateVisibleToProductParams(p);
    return await run(p);
  } catch (e) {
    if (isAffiliateFilterError(e)) {
      try {
        return await run(params);
      } catch {
        return [];
      }
    }
    return [];
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
      is_offer: "eq.true",
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
    const flatCats = await getRows<{ id: string; parent_id: string | null }>("categories", {
      select: "id,parent_id",
      limit: "8000",
    });
    const expanded = new Set<string>();
    for (const cid of categoryIds) {
      for (const x of collectDescendantCategoryIds(cid, flatCats)) expanded.add(x);
    }
    const allIds = [...expanded];
    if (allIds.length > 0) {
      byCategory = await getRows("products", {
        select: "code6,slug,title",
        is_active: "eq.true",
        is_offer: "eq.true",
        category_id: inVal(allIds),
        order: "created_at.desc",
        limit: "12",
      });
    }
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
