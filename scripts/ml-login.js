const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

async function main() {
  const { chromium } = require("playwright");

  const outPath = process.env.ML_PLAYWRIGHT_STORAGE_STATE || ".playwright/ml-storage-state.json";
  const outAbs = path.resolve(process.cwd(), outPath);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "pt-BR",
  });
  const page = await context.newPage();

  console.log("Abrindo Mercado Livre para login manual…");
  console.log("1) Faça login na conta.");
  console.log("2) Se aparecer verificação/captcha, conclua.");
  console.log("3) Quando estiver logado e a home/página do produto carregar normalmente, volte aqui e aperte ENTER.");
  console.log(`Sessão será salva em: ${outAbs}`);

  await page.goto("https://www.mercadolivre.com.br/", { waitUntil: "domcontentloaded" });

  await new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("", () => {
      rl.close();
      resolve();
    });
  });

  await context.storageState({ path: outAbs });
  await browser.close();

  console.log("OK. Sessão salva.");
  console.log("Agora rode a aba Teste ML novamente (modo auto/headless).");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

