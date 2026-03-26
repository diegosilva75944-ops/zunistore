/**
 * Valida parseMlAriaLabelReaisCentavos + extractPricesFromHtml com HTML sintético
 * (aria-label correto vs fraction/cents “errados” no SSR).
 */
import {
  extractPricesFromHtml,
  parseMlAriaLabelReaisCentavos,
  extractAriaLabelPriceSequenceFromFragment,
} from "../lib/ml-price";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function main() {
  assert(parseMlAriaLabelReaisCentavos("35 reais com 72 centavos") === 35.72, "plain aria");
  assert(parseMlAriaLabelReaisCentavos("Antes: 35 reais com 72 centavos") === 35.72, "Antes aria");
  assert(parseMlAriaLabelReaisCentavos("Antes: 1.035 reais com 50 centavos") === 1035.5, "milhar");

  const frag = `
<div class="ui-pdp-price__main-container">
  <span class="andes-money-amount andes-money-amount--previous" role="img" aria-label="35 reais com 72 centavos">
    <span class="andes-money-amount__fraction">30</span>
    <span class="andes-money-amount__cents andes-money-amount__cents--superscript-36">64</span>
  </span>
  <span class="andes-money-amount" aria-label="31 reais com 25 centavos">
    <span class="andes-money-amount__fraction">28</span>
    <span class="andes-money-amount__cents">69</span>
  </span>
</div>`;
  const seq = extractAriaLabelPriceSequenceFromFragment(frag);
  assert(seq.length === 2 && seq[0] === 35.72 && seq[1] === 31.25, `seq=${JSON.stringify(seq)}`);

  const html = `<!DOCTYPE html><html><body>
${frag}
</body></html>`;
  const r = extractPricesFromHtml(html);
  assert(r.price === 35.72 && r.promoPrice === 31.25, `extractPricesFromHtml=${JSON.stringify(r)}`);

  const noAriaWrongFrac = `<!DOCTYPE html><html><body>
<div class="ui-pdp-price__main-container">
  <meta itemprop="price" content="359" />
  <span class="andes-money-amount">
    <span class="andes-money-amount__fraction">999</span>
    <span class="andes-money-amount__cents">99</span>
  </span>
</div>
</body></html>`;
  const r2 = extractPricesFromHtml(noAriaWrongFrac);
  assert(
    r2.price === 359 && r2.promoPrice === null,
    `itemprop quando só fraction errado: ${JSON.stringify(r2)}`,
  );

  const antesMetaWrong = `<!DOCTYPE html><html><body>
<div class="ui-pdp-price__main-container">
  <meta itemprop="price" content="359" />
  <span role="img" aria-label="Antes: 499 reais com 90 centavos"></span>
  <span class="andes-money-amount">
    <span class="andes-money-amount__fraction">999</span>
    <span class="andes-money-amount__cents">99</span>
  </span>
</div>
</body></html>`;
  const r3 = extractPricesFromHtml(antesMetaWrong);
  assert(
    r3.price === 499.9 && r3.promoPrice === 359,
    `Antes + itemprop com fraction SSR errado: ${JSON.stringify(r3)}`,
  );

  console.log(
    "OK: aria-label; itemprop em dessincronia com fraction; Antes+itemprop com SSR errado.",
  );
}

main();
