import "server-only";

import type { BrowserContext, Page } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import { hasMlProductPageSignals, isMlBlockedOrLoginHtml, ML_FETCH_HEADERS } from "./fetchHtml";

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
  /** Reduz fingerprint de automação (Chromium / Playwright). */
  "--disable-blink-features=AutomationControlled",
] as const;

const PLAYWRIGHT_IGNORE_DEFAULT_ARGS = ["--enable-automation"] as const;

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

/** Ordem: variável de ambiente (se existir no disco) → caminhos típicos Linux (Snap antes de /usr). */
const LINUX_CHROMIUM_FALLBACKS = [
  "/snap/bin/chromium",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
] as const;

function chromiumExecutableCandidates(preferred: string): string[] {
  const out: string[] = [];
  const p = preferred.trim();
  if (p) out.push(p);
  if (process.platform === "linux") {
    for (const f of LINUX_CHROMIUM_FALLBACKS) {
      if (!out.includes(f)) out.push(f);
    }
  }
  return out;
}

/**
 * Resolve o binário real; se `ML_PLAYWRIGHT_EXECUTABLE_PATH` apontar para ficheiro inexistente,
 * tenta fallbacks (ex. Ubuntu Snap em `/snap/bin/chromium`).
 */
function resolveSystemChromiumExecutablePath(): string | undefined {
  const preferred = String(
    process.env.ML_PLAYWRIGHT_EXECUTABLE_PATH ||
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
      "",
  ).trim();

  for (const candidate of chromiumExecutableCandidates(preferred)) {
    if (!candidate) continue;
    try {
      if (existsSync(candidate)) {
        if (preferred && candidate !== preferred) {
          console.warn(
            `[ml-playwright] Chromium: ${JSON.stringify(preferred)} não existe; a usar ${candidate}. ` +
              `Atualize ML_PLAYWRIGHT_EXECUTABLE_PATH se quiser fixar o caminho.`,
          );
        }
        return candidate;
      }
    } catch {
      /* */
    }
  }

  if (preferred) {
    console.warn(
      `[ml-playwright] Chromium não encontrado em ${JSON.stringify(preferred)} nem nos fallbacks; ` +
        `a usar o Chromium empacotado pelo Playwright (instale snap ou ajuste o caminho).`,
    );
  }
  return undefined;
}

function playwrightExecutableOrChannel(): { executablePath?: string; channel?: "chrome" | "chromium" | "msedge" } {
  const resolved = resolveSystemChromiumExecutablePath();
  if (resolved) return { executablePath: resolved };
  const ch = String(process.env.ML_PLAYWRIGHT_CHANNEL ?? "").trim().toLowerCase();
  if (ch === "chrome" || ch === "chromium" || ch === "msedge") return { channel: ch };
  return {};
}

function mlPlaywrightUserAgentAndPlatform(): { userAgent: string; secChUaPlatform: string } {
  const custom = String(process.env.ML_PLAYWRIGHT_USER_AGENT ?? "").trim();
  if (custom) {
    return {
      userAgent: custom,
      secChUaPlatform: process.platform === "linux" ? '"Linux"' : '"Windows"',
    };
  }
  if (process.platform === "linux") {
    return {
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      secChUaPlatform: '"Linux"',
    };
  }
  return {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    secChUaPlatform: '"Windows"',
  };
}

function mlExtraHttpHeaders(): Record<string, string> {
  const { userAgent, secChUaPlatform } = mlPlaywrightUserAgentAndPlatform();
  return {
    ...ML_FETCH_HEADERS,
    "User-Agent": userAgent,
    "sec-ch-ua-platform": secChUaPlatform,
  };
}

function mlViewport() {
  return { width: 1365, height: 900 };
}

function mlSkipWarmup(): boolean {
  return ["1", "true", "yes", "on"].includes(String(process.env.ML_PLAYWRIGHT_SKIP_WARMUP ?? "").trim().toLowerCase());
}

function isMercadoLivreHost(url: string): boolean {
  return /mercadolivre\.com|mercadolibre\.com|meli\.la/i.test(url);
}

/**
 * Mesma sessão: home ML primeiro (cookies/contexto), depois PDP — reduz redirecionamentos para account-verification.
 */
async function warmMercadoLivreHome(page: Page, settleMs: number): Promise<void> {
  try {
    await page.goto("https://www.mercadolivre.com.br/", {
      waitUntil: "domcontentloaded",
      timeout: 35_000,
    });
    const w = Math.min(2500, Math.max(600, settleMs));
    await new Promise((r) => setTimeout(r, w));
  } catch {
    /* continua para a PDP */
  }
}

/** Ordem: URL original → sem query → permalink curto produto.mercadolivre.com.br/MLB-dígitos */
function mlPdpUrlVariants(url: string): string[] {
  const seen = new Set<string>();
  const add = (u: string) => {
    const t = String(u || "").trim();
    if (t) seen.add(t);
  };
  add(url);
  try {
    const u = new URL(url);
    if (!isMercadoLivreHost(u.href)) return [...seen];
    const noQuery = `${u.origin}${u.pathname}`;
    add(noQuery);
    const m = u.pathname.match(/MLB[_-](\d{6,})/i);
    if (m) {
      add(`https://produto.mercadolivre.com.br/MLB-${m[1]}`);
    }
  } catch {
    /* */
  }
  return [...seen];
}

async function attachMlStealth(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
}

async function snapshotAfterGoto(
  page: Page,
  targetUrl: string,
  waitUntil: "domcontentloaded" | "load",
  settleMs: number,
  withWarmup: boolean,
): Promise<PlaywrightFetchResult> {
  if (withWarmup && isMercadoLivreHost(targetUrl) && !mlSkipWarmup()) {
    await warmMercadoLivreHome(page, settleMs);
  }
  await page.goto(targetUrl, {
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
    const launchExtra = playwrightExecutableOrChannel();

    const storageStatePath = process.env.ML_PLAYWRIGHT_STORAGE_STATE || DEFAULT_STORAGE_STATE_PATH;
    const userDataDir = process.env.ML_PLAYWRIGHT_USER_DATA_DIR || DEFAULT_USER_DATA_DIR;

    const contextBase = {
      ...launchExtra,
      headless,
      args: [...CHROMIUM_SERVER_ARGS],
      ignoreDefaultArgs: [...PLAYWRIGHT_IGNORE_DEFAULT_ARGS],
      locale: "pt-BR" as const,
      viewport: mlViewport(),
      userAgent: mlPlaywrightUserAgentAndPlatform().userAgent,
      extraHTTPHeaders: mlExtraHttpHeaders(),
      timezoneId: "America/Sao_Paulo",
    };

    if (userDataDir) {
      const absDir = path.resolve(process.cwd(), userDataDir);
      mkdirSync(absDir, { recursive: true });
      const context = await chromium.launchPersistentContext(absDir, contextBase);
      try {
        await attachMlStealth(context);
        let last: PlaywrightFetchResult = { ok: false, error: "Playwright: sem resultado" };
        for (const tryUrl of mlPdpUrlVariants(url)) {
          const page = await context.newPage();
          try {
            last = await snapshotAfterGoto(page, tryUrl, waitUntil, settleMs, true);
            if (isPlaywrightResultUsable(last)) return last;
          } finally {
            await page.close().catch(() => {});
          }
        }
        return last;
      } finally {
        await context.close();
      }
    }

    const browser = await chromium.launch({
      headless,
      ...launchExtra,
      args: [...CHROMIUM_SERVER_ARGS],
      ignoreDefaultArgs: [...PLAYWRIGHT_IGNORE_DEFAULT_ARGS],
    });
    try {
      const context = await browser.newContext({
        userAgent: mlPlaywrightUserAgentAndPlatform().userAgent,
        locale: "pt-BR",
        viewport: mlViewport(),
        extraHTTPHeaders: mlExtraHttpHeaders(),
        timezoneId: "America/Sao_Paulo",
        storageState: existsSync(storageStatePath) ? storageStatePath : undefined,
      });
      await attachMlStealth(context);
      let last: PlaywrightFetchResult = { ok: false, error: "Playwright: sem resultado" };
      for (const tryUrl of mlPdpUrlVariants(url)) {
        const page = await context.newPage();
        try {
          last = await snapshotAfterGoto(page, tryUrl, waitUntil, settleMs, true);
          if (isPlaywrightResultUsable(last)) return last;
        } finally {
          await page.close().catch(() => {});
        }
      }
      return last;
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

async function runPlaywrightHeadedInteractive(url: string): Promise<PlaywrightFetchResult> {
  if (!hasDisplayForHeadedChromium()) {
    return {
      ok: false,
      error:
        "Playwright (interativo): Linux sem DISPLAY/Wayland — não é possível abrir janela. " +
        "Use headless com perfil já logado (ML_PLAYWRIGHT_USER_DATA_DIR ou ML_PLAYWRIGHT_STORAGE_STATE). " +
        "Defina ML_PLAYWRIGHT_EXECUTABLE_PATH para o Chromium do sistema se o bundle Playwright for bloqueado.",
    };
  }
  try {
    const { chromium } = await import("playwright");
    const userDataDir = process.env.ML_PLAYWRIGHT_USER_DATA_DIR || DEFAULT_USER_DATA_DIR;
    const absDir = path.resolve(process.cwd(), userDataDir);
    mkdirSync(absDir, { recursive: true });

    const maxWait = interactiveTimeoutMs();
    const deadline = Date.now() + maxWait;
    const launchExtra = playwrightExecutableOrChannel();

    console.warn(
      `[ml-playwright] Abrindo janela para login/verificação do Mercado Livre. ` +
        `Aguarde o anúncio carregar; pode fechar a janela quando o produto estiver visível (até ${Math.round(maxWait / 1000)}s).`,
    );

    const context = await chromium.launchPersistentContext(absDir, {
      ...launchExtra,
      headless: false,
      args: [...CHROMIUM_SERVER_ARGS],
      ignoreDefaultArgs: [...PLAYWRIGHT_IGNORE_DEFAULT_ARGS],
      locale: "pt-BR",
      viewport: mlViewport(),
      userAgent: mlPlaywrightUserAgentAndPlatform().userAgent,
      extraHTTPHeaders: mlExtraHttpHeaders(),
      timezoneId: "America/Sao_Paulo",
    });
    await attachMlStealth(context);

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

      const tryUrls = mlPdpUrlVariants(url);
      for (const u of tryUrls) {
        const snap = await snapshotAfterGoto(page, u, "domcontentloaded", Math.max(postGotoSettleMs(), 1500), true);
        if (snap.ok && isPlaywrightResultUsable(snap)) {
          return snap;
        }
        await capture();
        if (snapshotLooksLikeProduct(lastUrl, lastHtml)) {
          return { ok: true, html: lastHtml, finalUrl: lastUrl };
        }
      }

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

export async function fetchHtmlWithPlaywright(url: string): Promise<PlaywrightFetchResult> {
  const headlessFirst = shouldRunHeadless();
  let last = await runPlaywrightFetch(url, headlessFirst);

  if (isPlaywrightResultUsable(last)) {
    return last;
  }

  const blockedHtml =
    last.ok && (isMlBlockedOrLoginHtml(last.html) || isBlockedUrl(last.finalUrl));
  const blockedErr = !last.ok && looksLikePlaywrightBlockError(last.error);

  if (
    !hasDisplayForHeadedChromium() &&
    headlessFirst &&
    (blockedHtml || blockedErr)
  ) {
    const settle = Math.max(postGotoSettleMs(), 4500);
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
    (last.ok && (isMlBlockedOrLoginHtml(last.html) || isBlockedUrl(last.finalUrl))) ||
    (!last.ok && looksLikePlaywrightBlockError(last.error));

  if (!needsRetry) {
    return last;
  }

  return runPlaywrightHeadedInteractive(url);
}
