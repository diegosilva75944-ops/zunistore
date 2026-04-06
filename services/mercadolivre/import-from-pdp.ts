import "server-only";

import { normalizeMlFetchUrl } from "@/lib/ml-test/normalize";
import { runTestMlImport } from "@/lib/ml-test";
import { extractMlItemIdFromUrlWithRedirects } from "@/services/mercadolivre/ml-url-resolve";
import { buildNormalizedFromTestImport } from "@/services/mercadolivre/pdp-import-mapper";
import { mlImportOrUpdateProduct, type MlImportResult } from "@/services/mercadolivre/persist";

export type MercadoLivrePdpImportInput = {
  sourceUrl: string;
  affiliateUrl: string;
  affiliateCode?: string;
};

export type MercadoLivrePdpImportResponse = {
  code6: string;
  slug: string;
  productUrl: string;
  action: MlImportResult["action"];
};

/**
 * Pipeline único: test import (auto) + persist — usado pela API com token (extensão) e pela API com sessão admin.
 */
export async function importMercadoLivreFromPdp(
  input: MercadoLivrePdpImportInput,
): Promise<MercadoLivrePdpImportResponse> {
  const affiliateCode = input.affiliateCode?.trim() || "ml_ext";
  const fetchUrl = normalizeMlFetchUrl(input.sourceUrl, { keepSearch: true });
  const result = await runTestMlImport(fetchUrl, "auto", { playwrightHeaded: true });
  const externalId = await extractMlItemIdFromUrlWithRedirects(input.sourceUrl.trim());
  const normalized = buildNormalizedFromTestImport(result, externalId, fetchUrl);
  const importResult = await mlImportOrUpdateProduct({
    normalized,
    updateIfExists: true,
    htmlCategoryPath: result.categoryPath,
    htmlCategoryName: result.categoryName,
    affiliateUrl: input.affiliateUrl,
    sourceUrl: fetchUrl,
    affiliateCode,
    descriptionShort: result.shortDescription,
    descriptionDetail: result.fullDescription,
  });
  const productUrl = `/produto/${importResult.code6}/${importResult.slug}`;
  return {
    code6: importResult.code6,
    slug: importResult.slug,
    productUrl,
    action: importResult.action,
  };
}
