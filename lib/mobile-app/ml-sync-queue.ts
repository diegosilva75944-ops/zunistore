import "server-only";

import { postgrestGet } from "@/lib/postgrest/server";

export type MlSyncQueueItem = {
  product_id: string;
  code6: string;
  /** URL que o app deve abrir (preferência: affiliate, senão source). */
  fetch_url: string;
  source_url: string | null;
  affiliate_url: string | null;
};

/**
 * Próximos produtos ML para o app sincronizar (quem não foi atualizado há mais tempo).
 */
export async function listNextMlProductsForMobileSync(limit: number): Promise<MlSyncQueueItem[]> {
  const lim = Math.min(Math.max(1, limit), 50);
  const rows = await postgrestGet<any[]>("products", {
    select: "id,code6,source_url,affiliate_url,last_seen_at,product_external_listings!inner(origin)",
    "product_external_listings.origin": "eq.mercadolivre",
    order: "last_seen_at.asc.nullsfirst",
    limit: String(lim),
  });
  const list = Array.isArray(rows) ? rows : [];
  const out: MlSyncQueueItem[] = [];
  for (const r of list) {
    const id = String(r?.id ?? "");
    const code6 = String(r?.code6 ?? "");
    const sourceUrl = typeof r?.source_url === "string" ? r.source_url : null;
    const affiliateUrl = typeof r?.affiliate_url === "string" ? r.affiliate_url : null;
    const fetchUrl =
      affiliateUrl && affiliateUrl.trim().startsWith("http") ? affiliateUrl.trim()
      : sourceUrl && sourceUrl.trim().startsWith("http") ? sourceUrl.trim()
      : null;
    if (!id || !code6 || !fetchUrl) continue;
    out.push({
      product_id: id,
      code6,
      fetch_url: fetchUrl,
      source_url: sourceUrl,
      affiliate_url: affiliateUrl,
    });
  }
  return out;
}
