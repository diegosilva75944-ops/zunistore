import "server-only";

import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

export type PlaywrightFetchResult =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; error: string };

const PLAYWRIGHT_TIMEOUT_MS = 75_000;
const DEFAULT_STORAGE_STATE_PATH = ".playwright/ml-storage-state.json";
const DEFAULT_USER_DATA_DIR = ".playwright/ml-user-data";

function shouldRunHeadless(): boolean {
  const v = String(process.env.ML_PLAYWRIGHT_HEADLESS ?? "").trim().toLowerCase();
  if (!v) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  if (["1", "true", "yes", "on"].includes(v)) return true;
  return true;
}

/**
 * Fallback headless: renderiza a página como no navegador.
 * Pode falhar em ambientes serverless sem browser — o erro volta em `error`.
 */
export async function fetchHtmlWithPlaywright(url: string): Promise<PlaywrightFetchResult> {
  try {
    const { chromium } = await import("playwright");
    const headless = shouldRunHeadless();

    const storageStatePath = process.env.ML_PLAYWRIGHT_STORAGE_STATE || DEFAULT_STORAGE_STATE_PATH;
    const userDataDir = process.env.ML_PLAYWRIGHT_USER_DATA_DIR || DEFAULT_USER_DATA_DIR;

    // Preferir perfil persistente: ML tende a aceitar melhor do que só cookies.
    if (userDataDir) {
      const absDir = path.resolve(process.cwd(), userDataDir);
      mkdirSync(absDir, { recursive: true });
      const context = await chromium.launchPersistentContext(absDir, {
        headless,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        locale: "pt-BR",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      });
      try {
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
        await context.close();
      }
    }

    const browser = await chromium.launch({
      headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
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
