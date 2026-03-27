import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { extractGalleryImages } from "./extractImages";

describe("extractGalleryImages", () => {
  it("deduplica e prefere variante -O sobre -L (mesmo ID)", () => {
    const base =
      "https://http2.mlstatic.com/D_NQ_NP_724354-MLA99989590201_112025";
    const html = `
<div class="ui-pdp-gallery">
  <figure class="ui-pdp-gallery__figure">
    <img src="${base}-L.webp"
         data-zoom="${base}-O.webp" />
  </figure>
</div>`;
    const $ = load(html);
    const imgs = extractGalleryImages($);
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toContain("-O.webp");
  });

  it("não duplica por data-zoom + src + srcset do mesmo slide", () => {
    const id = "111-MLA11111111111_010101";
    const html = `
<div class="ui-pdp-gallery">
  <figure class="ui-pdp-gallery__figure">
    <img
      src="https://http2.mlstatic.com/D_NQ_NP_${id}-L.webp"
      data-zoom="https://http2.mlstatic.com/D_NQ_NP_${id}-O.webp"
      srcset="https://http2.mlstatic.com/D_NQ_NP_${id}-M.webp 1x, https://http2.mlstatic.com/D_NQ_NP_${id}-O.webp 2x"
    />
  </figure>
</div>`;
    const $ = load(html);
    const imgs = extractGalleryImages($);
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toContain("-O.webp");
  });
});
