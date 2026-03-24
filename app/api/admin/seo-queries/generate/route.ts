import { NextResponse } from "next/server";
import { postgrestGet, postgrestPost, postgrestRpc } from "@/lib/postgrest/server";
import { makeSeoQueryFromPhrase, ngrams, tokenizePtBr } from "@/lib/admin/seo-suggest";

export const runtime = "nodejs";

export async function POST() {
  const products = await postgrestGet<any[]>("products", {
    select: "title",
    limit: "1000",
  });
  const titles = (Array.isArray(products) ? products : []).map((p) => String(p.title || "")).filter(Boolean);

  const freq = new Map<string, number>();
  for (const title of titles) {
    const tokens = tokenizePtBr(title);
    for (const phrase of [...ngrams(tokens, 2), ...ngrams(tokens, 3)]) {
      freq.set(phrase, (freq.get(phrase) ?? 0) + 1);
    }
  }

  const candidates = Array.from(freq.entries())
    .filter(([phrase, count]) => phrase.length >= 8 && count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 150)
    .map(([phrase]) => phrase);

  const chosen = candidates.slice(0, 120);
  const created: { slug: string; count: number; indexable: boolean }[] = [];

  for (const phrase of chosen) {
    const base = makeSeoQueryFromPhrase(phrase);
    const terms = base.query_terms;

    const c = await postgrestRpc<number>("count_products_for_terms", {
      _terms: terms,
      _category: null,
    });
    const count = typeof c === "number" ? c : 0;
    const indexable = count >= 12;

    await postgrestPost("seo_queries", {
      slug: base.slug,
      title: base.title,
      description: base.description,
      query_terms: terms,
      category_id: null,
      is_indexable: indexable,
      min_results: 8,
    }, "service", { upsert: true, onConflict: "slug" });

    created.push({ slug: base.slug, count, indexable });
  }

  return NextResponse.json({ ok: true, createdCount: created.length, created });
}
