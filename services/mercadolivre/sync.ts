import "server-only";

import { runTestMlImport } from "@/lib/ml-test/pipeline";
import { normalizeMlFetchUrl } from "@/lib/ml-test/normalize";
import { postgrestGet } from "@/lib/postgrest/server";
import { extractMlItemIdFromUrl } from "@/services/mercadolivre/parser";
import { buildNormalizedFromTestImport } from "@/services/mercadolivre/pdp-import-mapper";
import { mlImportOrUpdateProduct } from "@/services/mercadolivre/persist";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function mlSyncImportedProduct(productId: string) {
  const rows = await postgrestGet<any[]>("product_external_listings", {
    select: "external_id,external_permalink",
    origin: "eq.mercadolivre",
    product_id: `eq.${productId}`,
    limit: "1",
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  const externalId = row?.external_id ? String(row.external_id) : "";
  if (!externalId) {
    throw new Error("Produto não tem vínculo externo do Mercado Livre (external_id).");
  }

  const permalink =
    row?.external_permalink && String(row.external_permalink).startsWith("http") ?
      String(row.external_permalink)
    : `https://www.mercadolivre.com.br/p/${externalId}`;

  const prodRows = await postgrestGet<any[]>("products", {
    select: "affiliate_url,source_url",
    id: `eq.${productId}`,
    limit: "1",
  });
  const prod = Array.isArray(prodRows) ? prodRows[0] : null;
  const existingAffiliate =
    prod?.affiliate_url && String(prod.affiliate_url).startsWith("http") ?
      String(prod.affiliate_url)
    : undefined;
  const existingSource =
    prod?.source_url && String(prod.source_url).startsWith("http") ?
      String(prod.source_url)
    : undefined;

  const fetchUrl = normalizeMlFetchUrl(permalink, { keepSearch: true });
  const result = await runTestMlImport(fetchUrl, "auto");
  let idForNorm: string;
  try {
    idForNorm = extractMlItemIdFromUrl(fetchUrl);
  } catch {
    idForNorm = externalId;
  }
  const normalized = buildNormalizedFromTestImport(result, idForNorm, fetchUrl);

  return mlImportOrUpdateProduct({
    normalized,
    updateIfExists: true,
    htmlCategoryPath: result.categoryPath,
    htmlCategoryName: result.categoryName,
    descriptionShort: result.shortDescription,
    descriptionDetail: result.fullDescription,
    affiliateUrl: existingAffiliate,
    sourceUrl: existingSource ?? fetchUrl,
  });
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

