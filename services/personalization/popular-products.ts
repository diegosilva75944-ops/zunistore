import "server-only";

import { postgrestGet } from "@/lib/postgrest/server";

/** Soma total_score dos últimos 7 dias (UTC) por produto. */
export async function getPopularProductIds(limit: number): Promise<string[]> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 7);
  const d = since.toISOString().slice(0, 10);
  try {
    const rows = await postgrestGet<any[]>("product_popularity_daily", {
      select: "product_id,total_score",
      ref_date: `gte.${d}`,
      limit: "5000",
    });
    const scores = new Map<string, number>();
    for (const r of Array.isArray(rows) ? rows : []) {
      const pid = r.product_id as string;
      scores.set(pid, (scores.get(pid) ?? 0) + Number(r.total_score ?? 0));
    }
    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id)
      .slice(0, limit);
  } catch {
    return [];
  }
}
