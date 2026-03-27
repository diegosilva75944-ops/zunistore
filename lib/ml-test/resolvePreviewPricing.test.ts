import { describe, expect, it } from "vitest";
import { resolvePreviewPricing } from "./resolvePreviewPricing";

function andesHtml(
  previousFraction: string,
  previousCents: string,
  currentFraction: string,
  currentCents: string,
  opts?: { mainClass?: string },
): string {
  const main = opts?.mainClass ?? "ui-pdp-main ui-pdp-layout__main";
  return `
<!DOCTYPE html>
<html><body>
<div class="${main}">
  <h1>Produto teste</h1>
  <div class="ui-pdp-container__row--price">
    <span class="andes-money-amount andes-money-amount--previous">
      <span class="andes-money-amount__fraction">${previousFraction}</span>
      <span class="andes-money-amount__cents">${previousCents}</span>
    </span>
    <span class="andes-money-amount">
      <span class="andes-money-amount__fraction">${currentFraction}</span>
      <span class="andes-money-amount__cents">${currentCents}</span>
    </span>
  </div>
  <button type="submit">Comprar agora</button>
</div>
</body></html>`;
}

describe("resolvePreviewPricing", () => {
  it("CASO real: original riscado + promocional no bloco vencedor", () => {
    const html = andesHtml("1.378", "54", "947", "51");
    const r = resolvePreviewPricing(html, [], "html");
    expect(r.pricing.currentPrice).toBe(947.51);
    expect(r.pricing.originalPrice).toBe(1378.54);
    expect(r.pricing.hasDiscount).toBe(true);
    expect(r.pricing.displayMode).toBe("discounted_price");
    expect(r.pricing.discountPercent).toBe(31);
    expect(r.chosenBlock?.selector).toBe(".ui-pdp-container__row--price");
  });

  it("CASO 1: um único preço visível no bloco", () => {
    const html = `
<!DOCTYPE html><html><body>
<div class="ui-pdp-main">
  <div class="ui-pdp-container__row--price">
    <span class="andes-money-amount">
      <span class="andes-money-amount__fraction">589</span>
      <span class="andes-money-amount__cents">00</span>
    </span>
  </div>
  <button>Comprar agora</button>
</div>
</body></html>`;
    const r = resolvePreviewPricing(html, [], "html");
    expect(r.pricing.currentPrice).toBe(589);
    expect(r.pricing.originalPrice).toBeNull();
    expect(r.pricing.hasDiscount).toBe(false);
    expect(r.pricing.displayMode).toBe("single_price");
  });

  it("CASO 2 sem classe previous: dois andes distintos → menor=atual, maior=original", () => {
    const html = `
<!DOCTYPE html><html><body>
<div class="ui-pdp-main">
  <div class="ui-pdp-container__row--price">
    <span class="andes-money-amount">
      <span class="andes-money-amount__fraction">1.378</span>
      <span class="andes-money-amount__cents">54</span>
    </span>
    <span class="andes-money-amount">
      <span class="andes-money-amount__fraction">947</span>
      <span class="andes-money-amount__cents">51</span>
    </span>
  </div>
</div>
</body></html>`;
    const r = resolvePreviewPricing(html, [], "html");
    expect(r.pricing.currentPrice).toBe(947.51);
    expect(r.pricing.originalPrice).toBe(1378.54);
    expect(r.pricing.hasDiscount).toBe(true);
  });
});
