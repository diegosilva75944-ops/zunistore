// eslint-disable-next-line @typescript-eslint/no-var-requires
const { extractMercadoLivrePrices } = require("../lib/mercadolivre/price-extractor");

function runCase(name: string, html: string) {
  const result = extractMercadoLivrePrices(html);
  console.log(name, result);
}

const htmlSemPromocao = `
<html><body>
  <h1>Produto X</h1>
  <div class="ui-pdp-container__row--price">
    <div class="ui-pdp-price__main-container">R$ 3.199,90</div>
    <div class="ui-pdp-price__second-line">em 10x sem juros de R$ 319,99</div>
  </div>
</body></html>
`;

const htmlComRiscado = `
<html><body>
  <h1>Produto Y</h1>
  <div class="ui-pdp-container__row--price">
    <span class="andes-money-amount--previous">R$ 1.299,90</span>
    <div class="ui-pdp-price__main-container">R$ 999,90</div>
    <span>23% OFF</span>
  </div>
</body></html>
`;

const htmlComParcelamento = `
<html><body>
  <h1>Produto Z</h1>
  <div class="ui-pdp-price__main-container">R$ 245,55</div>
  <div class="poly-price__installments">12x de R$ 20,46 sem juros</div>
</body></html>
`;

const htmlComSecundarios = `
<html><body>
  <h1>Produto W</h1>
  <div>Preço por litro: R$ 9,99</div>
  <div>Cupom de R$ 20,00</div>
  <div class="ui-pdp-container__row--price">
    <div class="ui-pdp-price__main-container">R$ 499,00</div>
  </div>
</body></html>
`;

runCase("sem_promocao", htmlSemPromocao);
runCase("com_riscado", htmlComRiscado);
runCase("com_parcelamento", htmlComParcelamento);
runCase("com_secundarios", htmlComSecundarios);

const htmlComBlocosAntesEOffers = `
<html><body>
  <div class="ui-pdp-container__row--price">
    <s class="andes-money-amount ui-pdp-price__part ui-pdp-price__original-value andes-money-amount--previous andes-money-amount--cents-superscript andes-money-amount--compact"
      style="font-size:16px" role="img"
      aria-label="Antes: 1000 reais com 70 centavos"
      aria-roledescription="Valor"
      data-andes-money-amount="true"
      data-andes-money-amount-size="16">
      <span class="andes-money-amount__currency" aria-hidden="true" data-andes-money-amount-currency="true"><span class="andes-money-amount__currency-symbol">R$</span></span>
      <span class="andes-money-amount__fraction" aria-hidden="true" data-andes-money-amount-fraction="true">1.000</span>
      <span class="andes-visually-hidden" aria-hidden="true">,</span>
      <span class="andes-money-amount__cents andes-money-amount__cents--superscript-16" style="font-size:10px;margin-top:1px" aria-hidden="true" data-andes-money-amount-cents="true">70</span>
    </s>

    <span class="andes-money-amount ui-pdp-price__part andes-money-amount--cents-superscript andes-money-amount--compact"
      style="font-size:36px" itemprop="offers" itemscope itemtype="http://schema.org/Offer"
      role="img" aria-label="720 reais com 90 centavos" aria-roledescription="Valor"
      data-andes-money-amount="true" data-andes-money-amount-size="36">
      <meta itemprop="price" content="720.90">
      <span class="andes-money-amount__currency" itemprop="priceCurrency" aria-hidden="true" data-andes-money-amount-currency="true">
        <span class="andes-money-amount__currency-symbol">R$</span>
      </span>
      <span class="andes-money-amount__fraction" aria-hidden="true" data-andes-money-amount-fraction="true">720</span>
      <span class="andes-visually-hidden" aria-hidden="true">,</span>
      <span class="andes-money-amount__cents andes-money-amount__cents--superscript-36" style="font-size:18px;margin-top:4px" aria-hidden="true" data-andes-money-amount-cents="true">90</span>
    </span>
  </div>
</body></html>
`;

runCase("blocos_antes_offers_meta", htmlComBlocosAntesEOffers);

