import "server-only";

import type { BrowserContext, Page } from "playwright";
import { accessSync, constants as fsConstants, existsSync, mkdirSync } from "node:fs";
import os from "node:os";
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

/** Normaliza valor vindo do .env (ex. `0` ou `:0`) para um DISPLAY X11 válido. */
function normalizeX11DisplayValue(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^:\d+(\.\d+)?$/.test(s)) return s;
  if (/^\d+$/.test(s)) return `:${s}`;
  if (/^[\w.-]+:\d+(\.\d+)?$/.test(s)) return s;
  if (s.startsWith(":")) return s;
  return s;
}

/** Defeito GDM + Xorg ecrã local (root/PM2 sem herança do login gráfico). */
const LINUX_DEFAULT_DISPLAY = ":1";
const LINUX_DEFAULT_GDM_XAUTHORITY = "/run/user/1000/gdm/Xauthority";

function linuxAutoX11DefaultsEnabled(): boolean {
  const v = String(process.env.ML_PLAYWRIGHT_AUTO_X11 ?? "").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  return true;
}

function gdmXauthorityCandidates(): string[] {
  const uid = String(process.env.ML_PLAYWRIGHT_GRAPHICAL_UID ?? "1000").trim();
  const custom = String(process.env.ML_PLAYWRIGHT_X11_GDM_XAUTHORITY ?? "").trim();
  const out: string[] = [];
  if (custom) out.push(custom);
  out.push(`/run/user/${uid}/gdm/Xauthority`);
  out.push(LINUX_DEFAULT_GDM_XAUTHORITY);
  return out;
}

/** Primeiro ficheiro de cookie X11 legível; senão o caminho por defeito GDM (para env explícito). */
function pickReadableXauthorityPath(): string {
  const explicit = String(process.env.ML_PLAYWRIGHT_X11_XAUTHORITY ?? "").trim();
  if (explicit) return explicit;
  const def = String(process.env.ML_PLAYWRIGHT_X11_AUTHORITY_DEFAULT ?? LINUX_DEFAULT_GDM_XAUTHORITY).trim();
  const candidates = [
    ...gdmXauthorityCandidates(),
    def,
    path.join(os.homedir(), ".Xauthority"),
    ...(typeof process.getuid === "function" && process.getuid() === 0 ? ["/root/.Xauthority"] : []),
  ];
  const seen = new Set<string>();
  for (const p of candidates) {
    if (!p || seen.has(p)) continue;
    seen.add(p);
    if (!existsSync(p)) continue;
    try {
      accessSync(p, fsConstants.R_OK);
      return p;
    } catch {
      /* */
    }
  }
  return def || LINUX_DEFAULT_GDM_XAUTHORITY;
}

function linuxX11SessionAccessible(): boolean {
  const xa = String(process.env.XAUTHORITY ?? "").trim();
  if (!xa) return false;
  if (!existsSync(xa)) return false;
  try {
    accessSync(xa, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function logPlaywrightX11Env(label: string): void {
  if (process.platform !== "linux") return;
  syncX11DisplayFromEnv();
  const uid = typeof process.getuid === "function" ? process.getuid() : -1;
  const euid = typeof process.geteuid === "function" ? process.geteuid() : -1;
  const ok = linuxX11SessionAccessible();
  const w = String(process.env.WAYLAND_DISPLAY ?? "").trim();
  console.info(
    `[ml-playwright] ${label} DISPLAY=${process.env.DISPLAY ?? ""} XAUTHORITY=${process.env.XAUTHORITY ?? ""} WAYLAND_DISPLAY=${w || "—"} uid=${uid} euid=${euid} xAccessible=${ok}`,
  );
}

/**
 * Sincroniza DISPLAY / XAUTHORITY (GDM, root, PM2). Não sobrescreve DISPLAY já definido (ex.: SSH).
 */
function syncX11DisplayFromEnv(): void {
  if (process.platform !== "linux") return;
  let d = String(process.env.DISPLAY ?? "").trim();
  if (!d) {
    const fromEnv = String(
      process.env.ML_PLAYWRIGHT_X11_DISPLAY ?? process.env.ML_PLAYWRIGHT_DISPLAY ?? "",
    ).trim();
    if (fromEnv) {
      const resolved = normalizeX11DisplayValue(fromEnv);
      if (resolved) process.env.DISPLAY = resolved;
    }
  }
  d = String(process.env.DISPLAY ?? "").trim();
  if (!d && linuxAutoX11DefaultsEnabled()) {
    const raw = String(process.env.ML_PLAYWRIGHT_X11_DISPLAY_DEFAULT ?? LINUX_DEFAULT_DISPLAY).trim();
    const resolved = normalizeX11DisplayValue(raw || LINUX_DEFAULT_DISPLAY);
    if (resolved) process.env.DISPLAY = resolved;
  }
  let xa = String(process.env.XAUTHORITY ?? "").trim();
  if (!xa) {
    if (linuxAutoX11DefaultsEnabled()) {
      process.env.XAUTHORITY = pickReadableXauthorityPath();
    } else {
      const fb = String(process.env.ML_PLAYWRIGHT_X11_XAUTHORITY ?? "").trim();
      process.env.XAUTHORITY = fb || path.join(os.homedir(), ".Xauthority");
    }
  }
}

/** `env` explícito para o processo do Chromium (SSH/root/herança); só strings (Playwright). */
function playwrightBrowserEnv(): Record<string, string> {
  syncX11DisplayFromEnv();
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function looksLikeX11OrDisplayError(msg: string): boolean {
  return /Missing X server|missing x server|\$DISPLAY|cannot open display|X11|BadValue|Authorization|Xauthority|Xvfb|Gtk-WARNING.*cannot open display|No protocol specified/i.test(
    msg,
  );
}

/**
 * Aplica variáveis X11 do .env antes de logar `DISPLAY` ou abrir o Chromium (idempotente).
 */
export function applyPlaywrightLinuxDisplayEnv(): void {
  syncX11DisplayFromEnv();
}

/**
 * Chromium com janela (headed): Wayland, ou X11 com DISPLAY + cookie legível (root precisa de XAUTHORITY GDM).
 */
export function hasDisplayForHeadedChromium(): boolean {
  syncX11DisplayFromEnv();
  const p = process.platform;
  if (p === "darwin" || p === "win32") return true;
  const w = String(process.env.WAYLAND_DISPLAY ?? "").trim();
  if (w) return true;
  if (p !== "linux") {
    const d = String(process.env.DISPLAY ?? "").trim();
    return Boolean(d);
  }
  const d = String(process.env.DISPLAY ?? "").trim();
  if (!d) return false;
  return linuxX11SessionAccessible();
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

async function runPlaywrightFetchOnce(
  url: string,
  useHeadless: boolean,
  opts?: PlaywrightFetchOpts,
): Promise<PlaywrightFetchResult> {
  const { chromium } = await import("playwright");

  applyPlaywrightLinuxDisplayEnv();
  logPlaywrightX11Env("launchPersistentContext");
  const headless = !hasDisplayForHeadedChromium() ? true : useHeadless;
  const waitUntil = opts?.waitUntil ?? "domcontentloaded";
  const settleMs = opts?.settleMs ?? postGotoSettleMs();
  const launchExtra = playwrightExecutableOrChannel();
  const browserEnv = playwrightBrowserEnv();

  const storageStatePath = process.env.ML_PLAYWRIGHT_STORAGE_STATE || DEFAULT_STORAGE_STATE_PATH;
  const userDataDir = process.env.ML_PLAYWRIGHT_USER_DATA_DIR || DEFAULT_USER_DATA_DIR;

  const contextBase = {
    ...launchExtra,
    headless,
    env: browserEnv,
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
      await context.close().catch(() => {});
    }
  }

  const browser = await chromium.launch({
    headless,
    env: browserEnv,
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
    await browser.close().catch(() => {});
  }
}

async function runPlaywrightFetch(
  url: string,
  useHeadless: boolean,
  opts?: PlaywrightFetchOpts,
): Promise<PlaywrightFetchResult> {
  try {
    let result = await runPlaywrightFetchOnce(url, useHeadless, opts);
    const errText = result.ok ? "" : result.error;
    if (!result.ok && !useHeadless && looksLikeX11OrDisplayError(errText)) {
      console.warn("[ml-playwright] Falha ao ligar ao servidor X11; a repetir em headless.");
      result = await runPlaywrightFetchOnce(url, true, opts);
    }
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    let result: PlaywrightFetchResult = { ok: false, error: `Playwright: ${msg}` };
    if (!useHeadless && looksLikeX11OrDisplayError(msg)) {
      console.warn("[ml-playwright] Exceção X11; a repetir em headless.");
      try {
        result = await runPlaywrightFetchOnce(url, true, opts);
      } catch (e2) {
        const m2 = e2 instanceof Error ? e2.message : String(e2);
        result = { ok: false, error: `Playwright: ${m2}` };
      }
    }
    return result;
  }
}

function snapshotLooksLikeProduct(lastUrl: string, lastHtml: string): boolean {
  if (!lastUrl || !lastHtml) return false;
  if (isBlockedUrl(lastUrl)) return false;
  if (isMlBlockedOrLoginHtml(lastHtml)) return false;
  return hasMlProductPageSignals(lastHtml);
}

async function runPlaywrightHeadedInteractive(url: string): Promise<PlaywrightFetchResult> {
  applyPlaywrightLinuxDisplayEnv();
  logPlaywrightX11Env("interactive");
  if (!hasDisplayForHeadedChromium()) {
    return {
      ok: false,
      error:
        "Playwright (interativo): Linux sem DISPLAY/Wayland ou XAUTHORITY ilegível — não é possível abrir janela. " +
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
      env: playwrightBrowserEnv(),
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
      await context.close().catch(() => {});
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const hint =
      /browserType\.launch|Target page|closed|has been closed/i.test(msg) && !/DISPLAY/i.test(msg) ?
        ""
      : /DISPLAY|Missing X server|gtk/i.test(msg) ?
        " (Linux: DISPLAY=:1 e XAUTHORITY GDM; scripts/run.sh ou xhost +SI:localuser:root)"
      : "";
    return {
      ok: false,
      error: `Playwright (interativo): ${msg}${hint}`,
    };
  }
}

export type FetchHtmlWithPlaywrightOptions = {
  /**
   * `false` = Chromium com janela (import/sync; no Linux costuma ser **X11** com `DISPLAY=:0`).
   * `true` = forçar headless. `undefined` = `ML_PLAYWRIGHT_HEADLESS` / defeito.
   */
  headless?: boolean;
};

function strictHeadedWhenNoDisplay(): boolean {
  const v = String(process.env.ML_PLAYWRIGHT_STRICT_HEADED ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function resolveFetchHeadless(opts?: FetchHtmlWithPlaywrightOptions): boolean {
  if (opts?.headless === true) return true;
  if (opts?.headless === false) {
    if (!hasDisplayForHeadedChromium()) {
      console.warn(
        "[ml-playwright] Modo gráfico pedido (headless=false) mas sem sessão gráfica no processo Node (X11: DISPLAY; Wayland: WAYLAND_DISPLAY) — a usar headless. " +
          "Servidor X11: defina DISPLAY=:0 no systemd ou ML_PLAYWRIGHT_X11_DISPLAY=:0 no .env; opcional ML_PLAYWRIGHT_X11_XAUTHORITY. " +
          "ML_PLAYWRIGHT_STRICT_HEADED=1 falha em vez de fallback.",
      );
      return true;
    }
    return false;
  }
  return shouldRunHeadless();
}

/** Mesma lógica que `fetchHtmlWithPlaywright` usa para decidir headless (útil para mensagens de debug). */
export function getEffectivePlaywrightHeadless(opts?: FetchHtmlWithPlaywrightOptions): boolean {
  return resolveFetchHeadless(opts);
}

/**
 * Abre o Chromium (headless ou com janela), obtém o HTML e fecha o browser no `finally` de cada contexto.
 * Com `headless: false`, não abre segunda janela interativa no fim — só uma sessão gráfica por chamada.
 */
export async function fetchHtmlWithPlaywright(
  url: string,
  opts?: FetchHtmlWithPlaywrightOptions,
): Promise<PlaywrightFetchResult> {
  if (opts?.headless === false && !hasDisplayForHeadedChromium() && strictHeadedWhenNoDisplay()) {
    return {
      ok: false,
      error:
        "Modo gráfico pedido mas não há sessão gráfica visível no processo Node (X11: DISPLAY; Wayland: WAYLAND_DISPLAY). Servidor X11: DISPLAY=:0 no systemd ou ML_PLAYWRIGHT_X11_DISPLAY=:0 no .env; opcional ML_PLAYWRIGHT_X11_XAUTHORITY. Reinicie o Next.js ou remova ML_PLAYWRIGHT_STRICT_HEADED.",
    };
  }
  const headless = resolveFetchHeadless(opts);
  let last = await runPlaywrightFetch(url, headless, undefined);

  if (isPlaywrightResultUsable(last)) {
    return last;
  }

  const blockedHtml =
    last.ok && (isMlBlockedOrLoginHtml(last.html) || isBlockedUrl(last.finalUrl));
  const blockedErr = !last.ok && looksLikePlaywrightBlockError(last.error);

  if (blockedHtml || blockedErr) {
    const settle = Math.max(postGotoSettleMs(), 4500);
    const second = await runPlaywrightFetch(url, headless, { waitUntil: "load", settleMs: settle });
    if (isPlaywrightResultUsable(second)) {
      return second;
    }
    last = second;
  }

  if (!headless) {
    return last;
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
