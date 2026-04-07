import "server-only";

import { runTestMlImport } from "@/lib/ml-test";
import { isMercadoLivreProductUrl, normalizeMlFetchUrl } from "@/lib/ml-test/normalize";
import { normalizeMercadoLivreProductUrl } from "@/lib/ml-price";
import { postgrestGet, postgrestPost } from "@/lib/postgrest/server";
import { extractMlItemIdFromFirstWorkingCandidate } from "@/services/mercadolivre/ml-url-resolve";
import { extractMlItemIdFromUrl } from "@/services/mercadolivre/parser";
import { fetchPricesFromUrl, type FetchMlPriceInput } from "@/lib/ml-price";
import { buildNormalizedFromTestImport } from "@/services/mercadolivre/pdp-import-mapper";
import { mapMlNormalizedToDrafts } from "@/services/mercadolivre/mapper";
import {
  deleteConflictingExternalListingsForOtherProducts,
  mlImportOrUpdateProduct,
  patchProductMlPricesAndRatingsOnly,
} from "@/services/mercadolivre/persist";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Garante `product_external_listings` (ML) para o produto quando a URL é PDP do ML mas a linha ainda não existe
 * (dados antigos ou importação incompleta). Sem isso, `mlSyncImportedProduct` não roda.
 */
export async function ensureMercadoLivreListingRowForProduct(
  productId: string,
  sourceUrl: string | null,
  affiliateUrl: string | null,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const existing = await postgrestGet<any[]>("product_external_listings", {
    select: "id",
    origin: "eq.mercadolivre",
    product_id: `eq.${productId}`,
    limit: "1",
  });
  if (Array.isArray(existing) && existing[0]) return { ok: true };

  let externalId: string;
  try {
    externalId = await extractMlItemIdFromFirstWorkingCandidate(sourceUrl, affiliateUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: msg || "Não foi possível obter o ID do anúncio (MLB…) na URL." };
  }

  const src = sourceUrl && String(sourceUrl).trim().startsWith("http") ? String(sourceUrl) : "";
  const aff = affiliateUrl && String(affiliateUrl).trim().startsWith("http") ? String(affiliateUrl) : "";

  const permalink =
    src && isMercadoLivreProductUrl(src) ?
      normalizeMercadoLivreProductUrl(src, { keepSearch: true })
    : aff && isMercadoLivreProductUrl(aff) ?
      normalizeMercadoLivreProductUrl(aff, { keepSearch: true })
    : `https://www.mercadolivre.com.br/p/${externalId}`;

  try {
    await deleteConflictingExternalListingsForOtherProducts({
      keepProductId: productId,
      origin: "mercadolivre",
      externalId,
      externalPermalink: permalink,
    });
    await postgrestPost(
      "product_external_listings",
      {
        product_id: productId,
        origin: "mercadolivre",
        origin_tipo: "public_listing",
        external_id: externalId,
        external_permalink: permalink,
        import_mode: "admin_internal",
      },
      "service",
      { upsert: true, onConflict: "product_id", returning: false },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: msg || "Falha ao criar vínculo do anúncio." };
  }
  return { ok: true };
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
  const result = await runTestMlImport(fetchUrl, "auto", { playwrightHeaded: true });
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

/**
 * Sync pelo navegador (Playwright): atualiza **apenas** preços, promoção, % off, nota e quantidade de avaliações.
 * Não altera título, descrição, imagens nem categoria.
 * Sempre **um** `productId` por chamada (ex.: POST `/api/admin/products/[id]/sync-price` — sem paralelismo).
 */
export async function mlSyncImportedProductPricesAndRatingsOnly(productId: string) {
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
  const priceInput: FetchMlPriceInput = { sourceUrl: existingSource ?? null, affiliateUrl: existingAffiliate ?? null };

  const result = await runTestMlImport(fetchUrl, "auto", { playwrightHeaded: true });
  let idForNorm: string;
  try {
    idForNorm = extractMlItemIdFromUrl(fetchUrl);
  } catch {
    idForNorm = externalId;
  }
  const normalized = buildNormalizedFromTestImport(result, idForNorm, fetchUrl);

  let fallbackPrice: { price: number; promo_price: number | null } | null = null;
  if (
    normalized.price_current == null ||
    !Number.isFinite(normalized.price_current) ||
    normalized.price_current <= 0
  ) {
    const ml = await fetchPricesFromUrl(priceInput);
    if (ml.kind === "ok") {
      fallbackPrice = { price: ml.price, promo_price: ml.promoPrice };
    }
  }

  const { productDraft } = mapMlNormalizedToDrafts({
    normalized,
    fallbackPrice,
    affiliateUrlOverride: existingAffiliate,
    sourceUrlOverride: existingSource ?? fetchUrl,
  });

  await patchProductMlPricesAndRatingsOnly(productId, {
    price: productDraft.price,
    promo_price: productDraft.promo_price,
    is_offer: productDraft.is_offer,
    off_percent: productDraft.off_percent,
    rating: productDraft.rating,
    reviews_count: productDraft.reviews_count,
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

