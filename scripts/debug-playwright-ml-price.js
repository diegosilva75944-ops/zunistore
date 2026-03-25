const { chromium } = require("playwright");

const url =
  "https://www.mercadolivre.com.br/cabo-mxt-p10xp10-5m-lilas-p-guitarra-violo-baixo-teclado/p/MLB22743210?matt_event_ts=1774470531612&matt_d2id=5184bef1-59c6-4030-8c28-357e07d005a0&matt_tracing_id=799b6384-f0ca-4ecc-bcaf-aec3d1c74c64#polycard_client=recommendations_home_affiliate-profile&reco_backend=item_decorator&reco_client=home_affiliate-profile&reco_item_pos=0&source=affiliate-profile&reco_backend_type=function&reco_id=743d18ee-4e83-4345-8b07-dbf993901ba5&tracking_id=3a6e3523-4dd5-41f4-98ec-b7049bf0e3c8&wid=MLB4314633910&sid=recos&c_id=/home/card-featured/element&c_uid=3e7d962b-322c-42b1-8fb4-aa1a458a85be";

const userAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent });
  const page = await context.newPage();

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });

  // Cookies
  try {
    const btn = page.locator('button[data-testid="action:understood-button"]');
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 2000 });
    }
  } catch {}

  await page.waitForTimeout(3000);

  const data = await page.evaluate(() => {
    const isInsideOtherSellers = (el) => {
      try {
        return !!el.closest("[class*='other-sellers']");
      } catch {
        return false;
      }
    };

    const parseAndesMoney = (el) => {
      const fraction = el.querySelector(".andes-money-amount__fraction")?.textContent?.trim();
      const cents = el.querySelector(".andes-money-amount__cents")?.textContent?.trim();
      if (!fraction) return null;
      const fractionNum = fraction.replace(/\./g, "");
      const dec = cents && /^\d{1,2}$/.test(cents) ? cents.padStart(2, "0") : "00";
      const n = parseFloat(`${fractionNum}.${dec}`);
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    const firstNotInOtherSellers = (selector) => {
      const nodes = Array.from(document.querySelectorAll(selector));
      for (const n of nodes) if (!isInsideOtherSellers(n)) return n;
      return null;
    };

    const priceRow =
      firstNotInOtherSellers(".ui-pdp-container__row--price, .ui-pdp-container__row.ui-pdp-container__row--price") ||
      null;

    if (priceRow) {
      const amountEls = Array.from(priceRow.querySelectorAll(".andes-money-amount"));
      const amounts = [];
      for (const el of amountEls) {
        const n = parseAndesMoney(el);
        if (n != null) amounts.push(n);
        if (amounts.length >= 3) break;
      }
      const price = amounts[0];
      const promoLine = amounts[1];
      const promoPrice = price != null && promoLine != null && promoLine < price ? promoLine : null;
      return { priceRow: true, amounts, price, promoLine, promoPrice };
    }

    const mainContainer =
      firstNotInOtherSellers(".ui-pdp-price__main-container") || firstNotInOtherSellers(".ui-pdp-price") || null;

    if (mainContainer) {
      const amountEls = Array.from(mainContainer.querySelectorAll(".andes-money-amount")).filter(
        (el) => !el.classList.contains("andes-money-amount--previous"),
      );
      const amounts = [];
      for (const el of amountEls) {
        const n = parseAndesMoney(el);
        if (n != null) amounts.push(n);
        if (amounts.length >= 3) break;
      }
      const line1 = amounts[0];
      const promoLine = amounts[1];
      const promoPrice = line1 != null && promoLine != null && promoLine < line1 ? promoLine : null;
      return { mainContainer: true, amounts, line1, promoLine, promoPrice };
    }

    return { found: false };
  });

  console.log(JSON.stringify(data, null, 2));
  await browser.close();
})();

