import { describe, expect, it } from "vitest";
import { extractPricesFromHtml } from "./ml-price";

describe("extractPricesFromHtml", () => {
  it("import: Pix 135 + ‘em outros meios’ 150 → promo 150, original 249,90", () => {
    const html = `
<!DOCTYPE html><html><body>
<div class="ui-pdp-main">
  <div class="ui-pdp-container__row--price">
    <div class="ui-pdp-price__main-container">
      <s class="andes-money-amount andes-money-amount--previous" aria-label="Antes: 249 reais com 90 centavos">
        <span class="andes-money-amount__fraction">249</span>
        <span class="andes-money-amount__cents">90</span>
      </s>
      <div class="ui-pdp-price__second-line">
        <span class="andes-money-amount">
          <span class="andes-money-amount__fraction">135</span>
          <span class="andes-money-amount__cents">00</span>
        </span>
      </div>
      <div class="ui-pdp-price__subtitles"><p>ou R$150 em outros meios</p></div>
    </div>
  </div>
</div>
</body></html>`;
    const r = extractPricesFromHtml(html);
    expect(r.price).toBe(249.9);
    expect(r.promoPrice).toBe(150);
  });

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
