import "server-only";

import { extractMlItemIdFromUrl } from "./parser";
import { normalizeMlPublicListing } from "./normalizer";
import { mlGetItemAuth, mlGetItemDescriptionAuth, mlResolveProductToItemAuth } from "./auth-api";
import { MercadoLivreApiError } from "@/lib/mercadolivre/client";
import { MercadoLivreError } from "./errors";

export async function mlFetchListingByUrlAuth(url: string) {
  const extracted = extractMlItemIdFromUrl(url);
  console.log("[ml-importer] url_extracted_item", { url, extracted });
  let itemId = extracted;
  let item;
  try {
    item = await mlGetItemAuth(itemId);
  } catch (e) {
    const isCatalogProductUrl = /\/p\/MLB\d{6,}/i.test(url);
    const notFound = e instanceof MercadoLivreApiError && e.externalStatus === 404;
    if (isCatalogProductUrl && notFound) {
      console.log("[ml-importer] trying_catalog_product_resolution", { productId: extracted });
      const resolved = await mlResolveProductToItemAuth(extracted);
      if (!resolved) {
        throw new MercadoLivreError(
          "not_found",
          "Esse link é de produto de catálogo e não encontrei anúncio ativo para importar.",
        );
      }
      console.log("[ml-importer] catalog_resolved_item", { productId: extracted, itemId: resolved });
      itemId = resolved;
      item = await mlGetItemAuth(itemId);
    } else {
      throw e;
    }
  }
  const desc = await mlGetItemDescriptionAuth(itemId).catch(() => null);
  const normalized = normalizeMlPublicListing({ item, description: desc });
  return { itemId, normalized };
}

export async function mlFetchListingByItemIdAuth(itemId: string) {
  const [item, desc] = await Promise.all([
    mlGetItemAuth(itemId),
    mlGetItemDescriptionAuth(itemId).catch(() => null),
  ]);
  const normalized = normalizeMlPublicListing({ item, description: desc });
  return { itemId: normalized.external_id, normalized };
}

