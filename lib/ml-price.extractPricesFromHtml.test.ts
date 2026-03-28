import { describe, expect, it } from "vitest";
import { extractPricesFromHtml } from "./ml-price";

describe("extractPricesFromHtml", () => {
  it("import: mesmo critério da aba ML — riscado 200 + atuais 130 e 150 → promo 150", () => {
    const html = `
<!DOCTYPE html><html><body>
<div class="ui-pdp-main">
  <div class="ui-pdp-container__row--price">
    <span class="andes-money-amount andes-money-amount--previous">
      <span class="andes-money-amount__fraction">200</span>
      <span class="andes-money-amount__cents">00</span>
    </span>
    <span class="andes-money-amount">
      <span class="andes-money-amount__fraction">130</span>
      <span class="andes-money-amount__cents">00</span>
    </span>
    <span class="andes-money-amount">
      <span class="andes-money-amount__fraction">150</span>
      <span class="andes-money-amount__cents">00</span>
    </span>
  </div>
</div>
</body></html>`;
    const r = extractPricesFromHtml(html);
    expect(r.price).toBe(200);
    expect(r.promoPrice).toBe(150);
  });

  it("poly card: anterior + dois valores em current → maior abaixo do anterior", () => {
    const html = `
<div class="poly-component__price">
  <div class="andes-money-amount andes-money-amount--previous">
    <span class="andes-money-amount__fraction">200</span>
    <span class="andes-money-amount__cents">00</span>
  </div>
  <div class="poly-price__current">
    <span class="andes-money-amount__fraction">130</span>
    <span class="andes-money-amount__cents">00</span>
    <span class="andes-money-amount__fraction">150</span>
    <span class="andes-money-amount__cents">00</span>
  </div>
</div>`;
    const r = extractPricesFromHtml(html);
    expect(r.price).toBe(200);
    expect(r.promoPrice).toBe(150);
  });
});
