/**
 * Browsers Playwright são necessários em produção (ex.: Coolify) para Test ML / extração com Chromium.
 * `SKIP_PLAYWRIGHT_INSTALL=1` pula o download (imagens mínimas ou quando não há uso).
 *
 * No Linux, o Chromium do Playwright precisa de bibliotecas do sistema — usamos `chromium --with-deps`
 * (equiv. a `playwright install-deps`) para evitar "Host system is missing dependencies".
 * `SKIP_PLAYWRIGHT_LINUX_DEPS=1` força só o download do browser (build sem apt; pode falhar no runtime).
 *
 * Fora do Linux: em dev local usa-se `--with-deps`; em CI/produção não-Linux, só o pacote do browser.
 */
const { execSync } = require("child_process");

if (process.env.SKIP_PLAYWRIGHT_INSTALL === "1") {
  console.log("[postinstall] SKIP_PLAYWRIGHT_INSTALL=1 — sem download de browsers.");
  process.exit(0);
}

const isLinux = process.platform === "linux";

const useWithDeps =
  process.env.PLAYWRIGHT_WITH_DEPS === "1" ||
  (isLinux && process.env.SKIP_PLAYWRIGHT_LINUX_DEPS !== "1") ||
  (!isLinux && process.env.NODE_ENV !== "production" && process.env.CI !== "true");

const cmd = useWithDeps
  ? "npx playwright install chromium --with-deps"
  : "npx playwright install chromium";

console.log(`[postinstall] ${cmd}`);
execSync(cmd, { stdio: "inherit", env: process.env });
