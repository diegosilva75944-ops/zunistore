/**
 * Smoke test: valida Chromium do Playwright no mesmo ambiente do deploy (Docker/Coolify).
 * Uso: node scripts/test-playwright.js
 */
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto("about:blank");
    console.log("Playwright Chromium OK");
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
