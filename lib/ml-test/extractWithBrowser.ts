import "server-only";

import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import { isMlBlockedOrLoginHtml } from "./fetchHtml";

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

/** Se 1: após falha headless ou HTML de login, abre Chromium visível e aguarda o utilizador. */
function shouldOpenHeadedOnBlock(): boolean {
  const v = String(process.env.ML_PLAYWRIGHT_HEADED_ON_BLOCK ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(v);
}

function interactiveTimeoutMs(): number {
  const raw = String(process.env.ML_PLAYWRIGHT_INTERACTIVE_TIMEOUT_MS ?? "").trim();
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 10_000) return Math.min(n, 1_800_000);
  return 300_000;
}

function isBlockedUrl(url: string): boolean {
  return /\/gz\/account-verification\b|captcha/i.test(url);
}

function looksLikePlaywrightBlockError(err: string): boolean {
  return /bloqueado|captcha|account-verification/i.test(err);
}

function isPlaywrightResultUsable(r: PlaywrightFetchResult): boolean {
  if (!r.ok) return false;
  if (isBlockedUrl(r.finalUrl)) return false;
  if (isMlBlockedOrLoginHtml(r.html)) return false;
  return true;
}

async function runPlaywrightFetch(url: string, headless: boolean): Promise<PlaywrightFetchResult> {
  try {
    const { chromium } = await import("playwright");

    const storageStatePath = process.env.ML_PLAYWRIGHT_STORAGE_STATE || DEFAULT_STORAGE_STATE_PATH;
    const userDataDir = process.env.ML_PLAYWRIGHT_USER_DATA_DIR || DEFAULT_USER_DATA_DIR;

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
        if (isBlockedUrl(finalUrl)) {
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
      if (isBlockedUrl(finalUrl)) {
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

/**
 * Chromium visível + polling até o HTML deixar de ser parede de login/captcha (ou timeout).
 * Reutiliza o mesmo userDataDir para persistir cookies após login.
 */
async function runPlaywrightHeadedInteractive(url: string): Promise<PlaywrightFetchResult> {
  try {
    const { chromium } = await import("playwright");
    const userDataDir = process.env.ML_PLAYWRIGHT_USER_DATA_DIR || DEFAULT_USER_DATA_DIR;
    const absDir = path.resolve(process.cwd(), userDataDir);
    mkdirSync(absDir, { recursive: true });

    const maxWait = interactiveTimeoutMs();
    const deadline = Date.now() + maxWait;

    console.warn(
      `[ml-playwright] Abrindo navegador visível (até ${Math.round(maxWait / 1000)}s). Conclua login ou captcha na janela.`,
    );

    const context = await chromium.launchPersistentContext(absDir, {
      headless: false,
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
      await new Promise((r) => setTimeout(r, 1500));

      while (Date.now() < deadline) {
        const finalUrl = page.url();
        const html = await page.content();
        if (!isBlockedUrl(finalUrl) && !isMlBlockedOrLoginHtml(html)) {
          await new Promise((r) => setTimeout(r, 1200));
          const html2 = await page.content();
          const finalUrl2 = page.url();
          if (!isBlockedUrl(finalUrl2) && !isMlBlockedOrLoginHtml(html2)) {
            return { ok: true, html: html2, finalUrl: finalUrl2 };
          }
        }
        await new Promise((r) => setTimeout(r, 2000));
      }

      return {
        ok: false,
        error: `Playwright: tempo esgotado (${Math.round(maxWait / 1000)}s) aguardando desbloqueio (login/captcha).`,
      };
    } finally {
      await context.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `Playwright (interativo): ${msg}`,
    };
  }
}

/**
 * Renderiza a PDP no Playwright. Se `ML_PLAYWRIGHT_HEADED_ON_BLOCK=1` e o primeiro passo
 * (headless) falhar por bloqueio ou devolver HTML de login, abre janela visível e espera.
 */
export async function fetchHtmlWithPlaywright(url: string): Promise<PlaywrightFetchResult> {
  const headlessFirst = shouldRunHeadless();
  const first = await runPlaywrightFetch(url, headlessFirst);

  if (isPlaywrightResultUsable(first)) {
    return first;
  }

  if (!shouldOpenHeadedOnBlock()) {
    return first;
  }

  if (!headlessFirst) {
    return first;
  }

  const needsRetry =
    (first.ok && isMlBlockedOrLoginHtml(first.html)) ||
    (!first.ok && looksLikePlaywrightBlockError(first.error));

  if (!needsRetry) {
    return first;
  }

  return runPlaywrightHeadedInteractive(url);
}
