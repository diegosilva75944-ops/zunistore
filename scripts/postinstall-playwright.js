/**
 * Playwright + Chromium só são necessários para testes/admin local.
 * Em Docker/Coolify (NODE_ENV=production, CI, etc.) isso quebra ou estoura timeout no build.
 */
const { execSync } = require("child_process");

const skip =
  process.env.SKIP_PLAYWRIGHT_INSTALL === "1" ||
  process.env.CI === "true" ||
  process.env.NODE_ENV === "production";

if (skip) {
  console.log(
    "[postinstall] Pulando Playwright (defina SKIP_PLAYWRIGHT_INSTALL=0 em dev se quiser forçar).",
  );
  process.exit(0);
}

execSync("npx playwright install chromium --with-deps", {
  stdio: "inherit",
  env: process.env,
});
