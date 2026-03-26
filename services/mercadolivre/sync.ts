import "server-only";

import { postgrestGet } from "@/lib/postgrest/server";
import { mlFetchListingByItemId } from "@/services/mercadolivre/importer";
import { mlImportOrUpdateProduct } from "@/services/mercadolivre/persist";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function mlSyncImportedProduct(productId: string) {
  const rows = await postgrestGet<any[]>("product_external_listings", {
    select: "external_id",
    origin: "eq.mercadolivre",
    product_id: `eq.${productId}`,
    limit: "1",
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  const externalId = row?.external_id ? String(row.external_id) : "";
  if (!externalId) {
    throw new Error("Produto não tem vínculo externo do Mercado Livre (external_id).");
  }

  const { normalized } = await mlFetchListingByItemId(externalId);
  return mlImportOrUpdateProduct({ normalized, updateIfExists: true });
}

export async function mlSyncImportedProductsBatch(productIds: string[], opts?: { delayMs?: number }) {
  const delayMs = Math.min(2000, Math.max(0, opts?.delayMs ?? 350));
  const results: { productId: string; ok: boolean; error?: string }[] = [];
  for (const id of productIds) {
    try {
      await mlSyncImportedProduct(id);
      results.push({ productId: id, ok: true });
    } catch (e) {
      results.push({ productId: id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    if (delayMs) await sleep(delayMs);
  }
  return results;
}

