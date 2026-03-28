/**
 * Browsers Playwright são necessários em produção (ex.: Coolify) para Test ML / extração com Chromium.
 * `SKIP_PLAYWRIGHT_INSTALL=1` pula o download (imagens mínimas ou quando não há uso).
 * Em produção/CI usamos `playwright install chromium` **sem** `--with-deps` para evitar `apt` pesado
 * e timeout no build; o pacote do Playwright traz dependências empacotadas na maioria dos SOs.
 */
const { execSync } = require("child_process");

if (process.env.SKIP_PLAYWRIGHT_INSTALL === "1") {
  console.log("[postinstall] SKIP_PLAYWRIGHT_INSTALL=1 — sem download de browsers.");
  process.exit(0);
}

const useWithDeps =
  process.env.PLAYWRIGHT_WITH_DEPS === "1" ||
  (process.env.NODE_ENV !== "production" && process.env.CI !== "true");

const cmd = useWithDeps
  ? "npx playwright install chromium --with-deps"
  : "npx playwright install chromium";

console.log(`[postinstall] ${cmd}`);
execSync(cmd, { stdio: "inherit", env: process.env });
