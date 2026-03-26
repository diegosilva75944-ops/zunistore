import { extractMercadoLivrePrices } from "@/lib/mercadolivre/price-extractor";

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

