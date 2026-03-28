import { describe, expect, it } from "vitest";
import { extractMlItemIdFromUrl } from "@/services/mercadolivre/parser";

describe("extractMlItemIdFromUrl", () => {
  it("extrai MLB do fragmento wid em link /up/ (reco PDP)", () => {
    const url =
      "https://www.mercadolivre.com.br/04-potes-de-vidro-hermetico-forno-refratario-vidro-marmita/up/MLBU3780251531#polycard_client=x&wid=MLB4470085695&sid=recos";
    expect(extractMlItemIdFromUrl(url)).toBe("MLB4470085695");
  });

  it("extrai MLB clássico no path", () => {
    expect(
      extractMlItemIdFromUrl("https://produto.mercadolivre.com.br/MLB-4470085695-potes-_JM"),
    ).toBe("MLB4470085695");
  });

  it("extrai de pdp_filters com item_id", () => {
    const u =
      "https://www.mercadolivre.com.br/x/p/MLB19907986?pdp_filters=item_id%3AMLB5368821480";
    expect(extractMlItemIdFromUrl(u)).toBe("MLB5368821480");
  });
});
