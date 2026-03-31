import "server-only";

import { existsSync } from "node:fs";

export type PlaywrightFetchResult =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; error: string };

const PLAYWRIGHT_TIMEOUT_MS = 75_000;
const DEFAULT_STORAGE_STATE_PATH = ".playwright/ml-storage-state.json";

/**
 * Fallback headless: renderiza a página como no navegador.
 * Pode falhar em ambientes serverless sem browser — o erro volta em `error`.
 */
export async function fetchHtmlWithPlaywright(url: string): Promise<PlaywrightFetchResult> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      const storageStatePath = process.env.ML_PLAYWRIGHT_STORAGE_STATE || DEFAULT_STORAGE_STATE_PATH;
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        locale: "pt-BR",
        storageState: existsSync(storageStatePath) ? storageStatePath : undefined,
      });
      const page = await context.newPage();
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: PLAYWRIGHT_TIMEOUT_MS,
      });
      await new Promise((r) => setTimeout(r, 1200));
      const html = await page.content();
      const finalUrl = page.url();
      if (/\/gz\/account-verification\b|captcha/i.test(finalUrl)) {
        return {
          ok: false,
          error: `Playwright: bloqueado (finalUrl=${finalUrl})`,
        };
      }
      return { ok: true, html, finalUrl };
    } finally {
      await browser.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `Playwright: ${msg}`,
    };
  }
}
