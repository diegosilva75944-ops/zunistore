import "server-only";

import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import { hasMlProductPageSignals, isMlBlockedOrLoginHtml } from "./fetchHtml";

export type PlaywrightFetchResult =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; error: string };

const PLAYWRIGHT_TIMEOUT_MS = 75_000;
const DEFAULT_STORAGE_STATE_PATH = ".playwright/ml-storage-state.json";
const DEFAULT_USER_DATA_DIR = ".playwright/ml-user-data";

const CHROMIUM_SERVER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
] as const;

/**
 * Chromium com janela (headed) exige X11 ou Wayland no Linux. Em Docker/servidor típico não há DISPLAY —
 * nesse caso forçamos sempre headless e não chamamos o modo interativo (evita "Missing X server").
 */
function hasDisplayForHeadedChromium(): boolean {
  const p = process.platform;
  if (p === "darwin" || p === "win32") return true;
  const d = String(process.env.DISPLAY ?? "").trim();
  const w = String(process.env.WAYLAND_DISPLAY ?? "").trim();
  return Boolean(d || w);
}

function postGotoSettleMs(): number {
  const raw = String(process.env.ML_PLAYWRIGHT_POST_GOTO_MS ?? "").trim();
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0) return Math.min(n, 60_000);
  return 2000;
}

function shouldRunHeadless(): boolean {
  const v = String(process.env.ML_PLAYWRIGHT_HEADLESS ?? "").trim().toLowerCase();
  if (!v) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  if (["1", "true", "yes", "on"].includes(v)) return true;
  return true;
}

/**
 * Por defeito: só com `next dev` (NODE_ENV=development) abre janela no bloqueio.
 * Em `next start` ou produção use `ML_PLAYWRIGHT_HEADED_ON_BLOCK=1`.
 */
function shouldOpenHeadedOnBlock(): boolean {
  if (!hasDisplayForHeadedChromium()) return false;
  const v = String(process.env.ML_PLAYWRIGHT_HEADED_ON_BLOCK ?? "").trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(v)) return false;
  if (["1", "true", "yes", "on"].includes(v)) return true;
  return process.env.NODE_ENV === "development";
}

function interactiveTimeoutMs(): number {
  const raw = String(process.env.ML_PLAYWRIGHT_INTERACTIVE_TIMEOUT_MS ?? "").trim();
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 10_000) return Math.min(n, 1_800_000);
  return 600_000;
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

type PlaywrightFetchOpts = {
  waitUntil?: "domcontentloaded" | "load";
  settleMs?: number;
};

async function runPlaywrightFetch(
  url: string,
  headlessRequested: boolean,
  opts?: PlaywrightFetchOpts,
): Promise<PlaywrightFetchResult> {
  try {
    const { chromium } = await import("playwright");

    const headless = !hasDisplayForHeadedChromium() ? true : headlessRequested;
    const waitUntil = opts?.waitUntil ?? "domcontentloaded";
    const settleMs = opts?.settleMs ?? postGotoSettleMs();

    const storageStatePath = process.env.ML_PLAYWRIGHT_STORAGE_STATE || DEFAULT_STORAGE_STATE_PATH;
    const userDataDir = process.env.ML_PLAYWRIGHT_USER_DATA_DIR || DEFAULT_USER_DATA_DIR;

    if (userDataDir) {
      const absDir = path.resolve(process.cwd(), userDataDir);
      mkdirSync(absDir, { recursive: true });
      const context = await chromium.launchPersistentContext(absDir, {
        headless,
        args: [...CHROMIUM_SERVER_ARGS],
        locale: "pt-BR",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      });
      try {
        const page = await context.newPage();
        await page.goto(url, {
          waitUntil,
          timeout: PLAYWRIGHT_TIMEOUT_MS,
        });
        await new Promise((r) => setTimeout(r, settleMs));
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
      args: [...CHROMIUM_SERVER_ARGS],
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
        waitUntil,
        timeout: PLAYWRIGHT_TIMEOUT_MS,
      });
      await new Promise((r) => setTimeout(r, settleMs));
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

function snapshotLooksLikeProduct(lastUrl: string, lastHtml: string): boolean {
  if (!lastUrl || !lastHtml) return false;
  if (isBlockedUrl(lastUrl)) return false;
  if (isMlBlockedOrLoginHtml(lastHtml)) return false;
  return hasMlProductPageSignals(lastHtml);
}

/**
 * Chromium visível: o utilizador conclui login/verificação ML; ao carregar a PDP ou ao fechar a janela
 * após o produto visível, devolvemos o HTML (último snapshot válido).
 */
async function runPlaywrightHeadedInteractive(url: string): Promise<PlaywrightFetchResult> {
  if (!hasDisplayForHeadedChromium()) {
    return {
      ok: false,
      error:
        "Playwright (interativo): Linux sem DISPLAY/Wayland — não é possível abrir janela. " +
        "Use headless com perfil já logado (ML_PLAYWRIGHT_USER_DATA_DIR ou ML_PLAYWRIGHT_STORAGE_STATE). " +
        "Em servidor, não defina ML_PLAYWRIGHT_HEADED_ON_BLOCK=1 nem ML_PLAYWRIGHT_HEADLESS=0 sem Xvfb.",
    };
  }
  try {
    const { chromium } = await import("playwright");
    const userDataDir = process.env.ML_PLAYWRIGHT_USER_DATA_DIR || DEFAULT_USER_DATA_DIR;
    const absDir = path.resolve(process.cwd(), userDataDir);
    mkdirSync(absDir, { recursive: true });

    const maxWait = interactiveTimeoutMs();
    const deadline = Date.now() + maxWait;

    console.warn(
      `[ml-playwright] Abrindo janela para login/verificação do Mercado Livre. ` +
        `Aguarde o anúncio carregar; pode fechar a janela quando o produto estiver visível (até ${Math.round(maxWait / 1000)}s).`,
    );

    const context = await chromium.launchPersistentContext(absDir, {
      headless: false,
      args: [...CHROMIUM_SERVER_ARGS],
      locale: "pt-BR",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    });

    let lastHtml = "";
    let lastUrl = "";

    try {
      const page = await context.newPage();

      const capture = async () => {
        try {
          if (page.isClosed()) return;
          lastUrl = page.url();
          lastHtml = await page.content();
        } catch {
          /* navegação em curso */
        }
      };

      page.on("load", () => {
        void capture();
      });
      page.on("framenavigated", () => {
        void capture();
      });

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: PLAYWRIGHT_TIMEOUT_MS,
      });
      await new Promise((r) => setTimeout(r, 1500));
      await capture();

      while (Date.now() < deadline) {
        try {
          if (page.isClosed()) {
            if (snapshotLooksLikeProduct(lastUrl, lastHtml)) {
              return { ok: true, html: lastHtml, finalUrl: lastUrl };
            }
            return {
              ok: false,
              error:
                "Playwright: janela fechada antes de carregar o anúncio. Conclua a verificação na conta, aguarde a página do produto e só então feche a janela.",
            };
          }

          const finalUrl = page.url();
          const html = await page.content();
          lastHtml = html;
          lastUrl = finalUrl;

          if (!isBlockedUrl(finalUrl) && !isMlBlockedOrLoginHtml(html) && hasMlProductPageSignals(html)) {
            await new Promise((r) => setTimeout(r, 1000));
            if (page.isClosed()) {
              if (snapshotLooksLikeProduct(lastUrl, lastHtml)) {
                return { ok: true, html: lastHtml, finalUrl: lastUrl };
              }
              break;
            }
            const h2 = await page.content();
            const u2 = page.url();
            if (
              !isBlockedUrl(u2) &&
              !isMlBlockedOrLoginHtml(h2) &&
              hasMlProductPageSignals(h2)
            ) {
              return { ok: true, html: h2, finalUrl: u2 };
            }
          }
        } catch {
          if (snapshotLooksLikeProduct(lastUrl, lastHtml)) {
            return { ok: true, html: lastHtml, finalUrl: lastUrl };
          }
          break;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }

      if (snapshotLooksLikeProduct(lastUrl, lastHtml)) {
        return { ok: true, html: lastHtml, finalUrl: lastUrl };
      }

      return {
        ok: false,
        error: `Playwright: tempo esgotado (${Math.round(maxWait / 1000)}s) sem obter a página do produto. Verifique login e tente de novo.`,
      };
    } finally {
      await context.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const hint =
      /browserType\.launch|Target page|closed|has been closed/i.test(msg) && !/DISPLAY/i.test(msg) ?
        ""
      : /DISPLAY|Missing X server|gtk/i.test(msg) ?
        " (Linux: precisa de sessão gráfica, ex.: DISPLAY=:0 ou X11/Wayland)"
      : "";
    return {
      ok: false,
      error: `Playwright (interativo): ${msg}${hint}`,
    };
  }
}

/**
 * 1) Tenta fetch rápido (headless por defeito).
 * 2) Se bloquear e `shouldOpenHeadedOnBlock()`, abre janela interativa (também após falha com ML_PLAYWRIGHT_HEADLESS=0).
 */
export async function fetchHtmlWithPlaywright(url: string): Promise<PlaywrightFetchResult> {
  const headlessFirst = shouldRunHeadless();
  let last = await runPlaywrightFetch(url, headlessFirst);

  if (isPlaywrightResultUsable(last)) {
    return last;
  }

  /** Servidor sem X11: segunda passagem com load + espera maior (ML hidrata devagar; perfil logado ajuda). */
  if (
    !hasDisplayForHeadedChromium() &&
    headlessFirst &&
    last.ok &&
    isMlBlockedOrLoginHtml(last.html)
  ) {
    const settle = Math.max(postGotoSettleMs(), 3500);
    const second = await runPlaywrightFetch(url, true, { waitUntil: "load", settleMs: settle });
    if (isPlaywrightResultUsable(second)) {
      return second;
    }
    last = second;
  }

  if (!shouldOpenHeadedOnBlock()) {
    return last;
  }

  const needsRetry =
    (last.ok && isMlBlockedOrLoginHtml(last.html)) ||
    (!last.ok && looksLikePlaywrightBlockError(last.error));

  if (!needsRetry) {
    return last;
  }

  return runPlaywrightHeadedInteractive(url);
}
