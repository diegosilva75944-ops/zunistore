import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { extractFullDescription, preferLongerText } from "./extractDescriptions";

describe("extractDescriptions", () => {
  it("preferLongerText escolhe o texto mais longo", () => {
    expect(preferLongerText("abc", "abcdefghij")).toBe("abcdefghij");
    expect(preferLongerText("longer text here", "short")).toBe("longer text here");
    expect(preferLongerText("", "only")).toBe("only");
    expect(preferLongerText("x", "")).toBe("x");
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
});
