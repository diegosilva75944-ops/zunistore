import "server-only";

import { mlGetItemDescriptionPublic, mlGetItemPublic } from "./api";
import { extractMlItemIdFromUrl } from "./parser";
import { normalizeMlPublicListing } from "./normalizer";

/**
 * Carrega e normaliza dados públicos do ML para preview/importação.
 * Não grava nada em banco (persistência entra na ETAPA 4).
 */
export async function mlFetchListingByUrl(url: string) {
  const itemId = extractMlItemIdFromUrl(url);
  const [item, desc] = await Promise.all([
    mlGetItemPublic(itemId),
    mlGetItemDescriptionPublic(itemId).catch((e) => {
      // descrição pode falhar sem impedir preview
      console.warn("[mercadolivre] descrição indisponível; continuando sem ela", e);
      return null;
    }),
  ]);
  const normalized = normalizeMlPublicListing({ item, description: desc });
  return { itemId, normalized };
}

export async function mlFetchListingByItemId(itemId: string) {
  const [item, desc] = await Promise.all([
    mlGetItemPublic(itemId),
    mlGetItemDescriptionPublic(itemId).catch((e) => {
      console.warn("[mercadolivre] descrição indisponível; continuando sem ela", e);
      return null;
    }),
  ]);
  const normalized = normalizeMlPublicListing({ item, description: desc });
  return { itemId: normalized.external_id, normalized };
}

