import "server-only";

import { extractMlItemIdFromUrl } from "./parser";
import { normalizeMlPublicListing } from "./normalizer";
import { mlGetItemAuth, mlGetItemDescriptionAuth } from "./auth-api";

export async function mlFetchListingByUrlAuth(url: string) {
  const itemId = extractMlItemIdFromUrl(url);
  const [item, desc] = await Promise.all([
    mlGetItemAuth(itemId),
    mlGetItemDescriptionAuth(itemId).catch(() => null),
  ]);
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

