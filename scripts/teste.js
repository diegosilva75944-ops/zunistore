/**
 * Teste manual: Chromium com sessão persistente (login ML / depuração).
 * Requer: DISPLAY + XAUTHORITY (ver scripts/run-playwright-teste.sh ou source scripts/ml-playwright-x11.sh).
 * Usa o Playwright do projeto (node_modules) ou global se NODE_PATH estiver definido.
 *
 * Env:
 *   ML_USER_DATA_DIR — perfil Chromium (defeito: ../.playwright/ml-user-data)
 *   ML_TEST_URL — URL inicial (defeito: home ML)
 *   ML_PLAYWRIGHT_TESTE_WAIT_MS — ms antes de fechar (defeito: 60000)
 *   ML_PLAYWRIGHT_TESTE_NO_CLOSE=1 — não fecha (Ctrl+C para sair)
 *   ML_PLAYWRIGHT_EXECUTABLE_PATH ou PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH — Chromium do sistema (evita npx playwright install no mesmo utilizador)
 *   ML_PLAYWRIGHT_CHANNEL — chrome | chromium | msedge (alternativa ao bundle)
 */
const path = require("path");

const waitMs = Number(process.env.ML_PLAYWRIGHT_TESTE_WAIT_MS || "60000");
const userDataDir =
  process.env.ML_USER_DATA_DIR || path.join(__dirname, "..", ".playwright", "ml-user-data");
const startUrl = process.env.ML_TEST_URL || "https://www.mercadolivre.com.br/";

(async () => {
  const { chromium } = require("playwright");
  const fs = require("fs");

  fs.mkdirSync(userDataDir, { recursive: true });

  const exeFromEnv = String(
    process.env.ML_PLAYWRIGHT_EXECUTABLE_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "",
  ).trim();
  const channelRaw = String(process.env.ML_PLAYWRIGHT_CHANNEL || "").trim().toLowerCase();
  const channel =
    channelRaw === "chrome" || channelRaw === "chromium" || channelRaw === "msedge" ? channelRaw : undefined;
  const useSystemExe = exeFromEnv && fs.existsSync(exeFromEnv);
  if (useSystemExe) console.info(`[teste] executablePath=${exeFromEnv}`);
  else if (channel) console.info(`[teste] channel=${channel}`);
  else
    console.info(
      "[teste] Chromium do Playwright (bundle); se faltar binário: npx playwright install chromium ou defina ML_PLAYWRIGHT_EXECUTABLE_PATH",
    );

  const context = await chromium.launchPersistentContext(userDataDir, {
    ...(useSystemExe ? { executablePath: exeFromEnv } : channel ? { channel } : {}),
    headless: false,
    chromiumSandbox: false,
    viewport: { width: 1280, height: 800 },
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-blink-features=AutomationControlled",
    ],
    ignoreDefaultArgs: ["--enable-automation"],
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  });

  const page = await context.newPage();
  console.info(`[teste] userDataDir=${userDataDir}`);
  console.info(`[teste] Abrindo ${startUrl}`);
  await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });

  if (process.env.ML_PLAYWRIGHT_TESTE_NO_CLOSE === "1") {
    console.info("[teste] ML_PLAYWRIGHT_TESTE_NO_CLOSE=1 — janela fica aberta até Ctrl+C.");
    await new Promise(() => {});
  } else {
    console.info(`[teste] Aguardando ${waitMs}ms para login manual / depuração…`);
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 3_600_000)));
    await context.close().catch(() => {});
  }
})().catch((e) => {
  console.error("[teste]", e);
  process.exit(1);
});
