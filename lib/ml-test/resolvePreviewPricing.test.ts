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
    expect(r.pricing.discountPercent).toBeCloseTo(31.27, 2);
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

  it("fração colada 49937 + centavos 00 vira R$ 499,37 (não R$ 49.937) com original 799", () => {
    const html = `
<!DOCTYPE html><html><body>
<div class="ui-pdp-main ui-pdp-layout__main">
  <div class="ui-pdp-container__row--price">
    <span class="andes-money-amount andes-money-amount--previous">
      <span class="andes-money-amount__fraction">799</span>
      <span class="andes-money-amount__cents">00</span>
    </span>
    <span class="andes-money-amount">
      <span class="andes-money-amount__fraction">49937</span>
      <span class="andes-money-amount__cents">00</span>
    </span>
  </div>
  <button type="submit">Comprar agora</button>
</div>
</body></html>`;
    const r = resolvePreviewPricing(html, [], "html");
    expect(r.pricing.currentPrice).toBe(499.37);
    expect(r.pricing.originalPrice).toBe(799);
    expect(r.pricing.hasDiscount).toBe(true);
  });

  it("ignora primeiro row com ‘Melhor preço’ e usa o segundo na coluna principal", () => {
    const html = `
<!DOCTYPE html><html><body>
<div class="ui-pdp-main">
  <h1>Produto</h1>
  <div class="ui-pdp-container__row--price">
    Melhor preço R$ 964,90 em outra loja
  </div>
  <div class="ui-pdp-container__row--price">
    <span class="andes-money-amount andes-money-amount--previous">
      <span class="andes-money-amount__fraction">1.378</span><span class="andes-money-amount__cents">54</span>
    </span>
    <span class="andes-money-amount">
      <span class="andes-money-amount__fraction">947</span><span class="andes-money-amount__cents">51</span>
    </span>
  </div>
</div>
</body></html>`;
    const r = resolvePreviewPricing(html, [], "html");
    expect(r.pricing.currentPrice).toBe(947.51);
    expect(r.pricing.originalPrice).toBe(1378.54);
    expect(r.chosenBlock?.selector).toBe(".ui-pdp-container__row--price");
  });

  it("ignora parcela em ui-pdp-price__subtitles (ex.: 10x R$ 102,99) e usa o preço da second-line", () => {
    const html = `
<!DOCTYPE html><html><body>
<div class="ui-pdp-main">
  <div class="ui-pdp-container__row ui-pdp-container__row--price" id="price">
    <div class="ui-pdp-price__main-container">
      <s class="andes-money-amount ui-pdp-price__original-value andes-money-amount--previous">
        <span class="andes-money-amount__fraction">1.378</span>
        <span class="andes-money-amount__cents">54</span>
      </s>
      <div class="ui-pdp-price__second-line">
        <span class="andes-money-amount">
          <span class="andes-money-amount__fraction">947</span>
          <span class="andes-money-amount__cents">51</span>
        </span>
      </div>
      <div class="ui-pdp-price__subtitles" role="group">
        <p><span>10x </span><span class="andes-money-amount">
          <span class="andes-money-amount__fraction">102</span>
          <span class="andes-money-amount__cents">99</span>
        </span><span> sem juros</span></p>
      </div>
    </div>
  </div>
</div>
</body></html>`;
    const r = resolvePreviewPricing(html, [], "html");
    expect(r.pricing.currentPrice).toBe(947.51);
    expect(r.pricing.originalPrice).toBe(1378.54);
    expect(r.pricing.hasDiscount).toBe(true);
  });

  it("com riscado: vários andes ‘atuais’ no bloco — usa o maior abaixo do original (evita valor menor espúrio)", () => {
    const html = `
<!DOCTYPE html><html><body>
<div class="ui-pdp-main">
  <div class="ui-pdp-container__row--price">
    <span class="andes-money-amount andes-money-amount--previous">
      <span class="andes-money-amount__fraction">200</span>
      <span class="andes-money-amount__cents">00</span>
    </span>
    <span class="andes-money-amount">
      <span class="andes-money-amount__fraction">135</span>
      <span class="andes-money-amount__cents">00</span>
    </span>
    <span class="andes-money-amount">
      <span class="andes-money-amount__fraction">150</span>
      <span class="andes-money-amount__cents">00</span>
    </span>
  </div>
  <button>Comprar agora</button>
</div>
</body></html>`;
    const r = resolvePreviewPricing(html, [], "html");
    expect(r.pricing.currentPrice).toBe(150);
    expect(r.pricing.originalPrice).toBe(200);
    expect(r.pricing.hasDiscount).toBe(true);
  });

  it("sem previous: dois andes próximos (135 e 150) → preço único = maior", () => {
    const html = `
<!DOCTYPE html><html><body>
<div class="ui-pdp-main">
  <div class="ui-pdp-container__row--price">
    <span class="andes-money-amount">
      <span class="andes-money-amount__fraction">135</span>
      <span class="andes-money-amount__cents">00</span>
    </span>
    <span class="andes-money-amount">
      <span class="andes-money-amount__fraction">150</span>
      <span class="andes-money-amount__cents">00</span>
    </span>
  </div>
</div>
</body></html>`;
    const r = resolvePreviewPricing(html, [], "html");
    expect(r.pricing.currentPrice).toBe(150);
    expect(r.pricing.originalPrice).toBeNull();
    expect(r.pricing.hasDiscount).toBe(false);
    expect(r.pricing.displayMode).toBe("single_price");
  });

  it("sem previous: três valores (135, 150, 200) → atual = max abaixo do maior", () => {
    const html = `
<!DOCTYPE html><html><body>
<div class="ui-pdp-main">
  <div class="ui-pdp-container__row--price">
    <span class="andes-money-amount">
      <span class="andes-money-amount__fraction">135</span>
      <span class="andes-money-amount__cents">00</span>
    </span>
    <span class="andes-money-amount">
      <span class="andes-money-amount__fraction">150</span>
      <span class="andes-money-amount__cents">00</span>
    </span>
    <span class="andes-money-amount">
      <span class="andes-money-amount__fraction">200</span>
      <span class="andes-money-amount__cents">00</span>
    </span>
  </div>
</div>
</body></html>`;
    const r = resolvePreviewPricing(html, [], "html");
    expect(r.pricing.currentPrice).toBe(150);
    expect(r.pricing.originalPrice).toBe(200);
    expect(r.pricing.hasDiscount).toBe(true);
  });

  it("Pix no bloco + ‘ou R$150 em outros meios’ em subtitles → atual = 150 (não o Pix)", () => {
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
        <span>45% OFF no Pix</span>
      </div>
      <div class="ui-pdp-price__subtitles">
        <p>ou R$150 em outros meios</p>
      </div>
    </div>
  </div>
</div>
</body></html>`;
    const r = resolvePreviewPricing(html, [], "html");
    expect(r.pricing.currentPrice).toBe(150);
    expect(r.pricing.originalPrice).toBe(249.9);
    expect(r.pricing.hasDiscount).toBe(true);
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
