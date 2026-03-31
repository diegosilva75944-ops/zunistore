const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

async function main() {
  const { chromium } = require("playwright");

  const outPath = process.env.ML_PLAYWRIGHT_STORAGE_STATE || ".playwright/ml-storage-state.json";
  const userDataDir = process.env.ML_PLAYWRIGHT_USER_DATA_DIR || ".playwright/ml-user-data";
  const outAbs = path.resolve(process.cwd(), outPath);
  const userDataAbs = path.resolve(process.cwd(), userDataDir);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.mkdirSync(userDataAbs, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataAbs, {
    headless: false,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "pt-BR",
  });
  const page = context.pages()[0] || (await context.newPage());

  console.log("Abrindo Mercado Livre para login manual…");
  console.log("1) Faça login na conta.");
  console.log("2) Se aparecer verificação/captcha, conclua.");
  console.log("3) Quando estiver logado, você pode fechar a janela (X) OU voltar aqui e apertar ENTER.");
  console.log(`Sessão será salva em: ${outAbs}`);
  console.log(`Perfil persistente (userDataDir): ${userDataAbs}`);

  await page.goto("https://www.mercadolivre.com.br/", { waitUntil: "domcontentloaded" });

  // Salva quando você apertar ENTER ou quando fechar a janela.
  // Importante: sem timeout — login/captcha pode demorar.
  await Promise.race([
    new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question("", () => {
        rl.close();
        resolve();
      });
    }),
    page.waitForEvent("close", { timeout: 0 }),
  ]);

  await context.storageState({ path: outAbs });
  await context.close();

  console.log("OK. Sessão salva.");
  console.log("Agora rode a aba Teste ML novamente (modo auto/headless).");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

