import { describe, expect, it } from "vitest";
import { normalizeMlFetchUrl, resolveMlCatalogUrlForServerFetch } from "./normalize";

describe("resolveMlCatalogUrlForServerFetch — wid no hash vs /p/MLB no path", () => {
  it("reescreve para produto.mercadolivre.com.br/MLB-{wid} quando wid difere do MLB do path", () => {
    const raw =
      "https://www.mercadolivre.com.br/cadeira-de-escritorio/p/MLB32068338#polycard_client=x&wid=MLB4519212879&sid=recos";
    expect(resolveMlCatalogUrlForServerFetch(raw)).toBe(
      "https://produto.mercadolivre.com.br/MLB-4519212879",
    );
  });

  it("normalizeMlFetchUrl mantém pathname estável após reescrita", () => {
    const raw =
      "https://www.mercadolivre.com.br/foo/p/MLB32068338#wid=MLB4519212879";
    expect(normalizeMlFetchUrl(raw)).toBe("https://produto.mercadolivre.com.br/MLB-4519212879");
  });
});
