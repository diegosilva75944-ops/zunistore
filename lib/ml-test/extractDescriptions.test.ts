import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import {
  extractFullDescription,
  extractShortDescriptionFromHighlightedSpecs,
  preferLongerText,
} from "./extractDescriptions";

describe("extractDescriptions", () => {
  it("preferLongerText escolhe o texto mais longo", () => {
    expect(preferLongerText("abc", "abcdefghij")).toBe("abcdefghij");
    expect(preferLongerText("longer text here", "short")).toBe("longer text here");
    expect(preferLongerText("", "only")).toBe("only");
    expect(preferLongerText("x", "")).toBe("x");
  });

  it("extractFullDescription preserva HTML com imagens no bloco de descrição", () => {
    const html = `
<!DOCTYPE html><html><body>
<div class="ui-pdp-collapsable__container">
  <div id="description" class="ui-pdp-description">
    <div class="ui-pdp-description__content">
      <p>Texto antes.</p>
      <img src="https://http2.mlstatic.com/desc.jpg" alt="Infográfico" />
      <p>Texto depois.</p>
    </div>
  </div>
</div>
</body></html>`;
    const $ = load(html);
    const out = extractFullDescription($);
    expect(out).toContain("<img");
    expect(out).toContain("https://http2.mlstatic.com/desc.jpg");
    expect(out).toContain("Texto antes");
  });

  it("extractFullDescription junta parágrafos do bloco #description", () => {
    const html = `
<!DOCTYPE html><html><body>
<div class="ui-pdp-collapsable__container">
  <div id="description" class="ui-pdp-description">
    <p data-testid="content" class="ui-pdp-description__content">Primeiro parágrafo longo da descrição.</p>
    <p data-testid="content" class="ui-pdp-description__content">Segundo parágrafo com detalhes.</p>
  </div>
</div>
</body></html>`;
    const $ = load(html);
    const out = extractFullDescription($);
    expect(out).toContain("Primeiro parágrafo");
    expect(out).toContain("Segundo parágrafo");
    expect(out.split(/\n\n/).length).toBeGreaterThanOrEqual(2);
  });

  it("extractShortDescriptionFromHighlightedSpecs lê a lista de destaques", () => {
    const html = `
<!DOCTYPE html><html><body>
<ul class="ui-vpp-highlighted-specs__features-list">
  <li><span>Voltagem: 127V</span></li>
  <li><span>Potência: 1900 W</span></li>
</ul>
</body></html>`;
    const $ = load(html);
    const out = extractShortDescriptionFromHighlightedSpecs($);
    expect(out).toContain("127V");
    expect(out).toContain("1900");
  });
});
