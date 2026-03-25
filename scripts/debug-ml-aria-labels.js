const fs = require("fs");
const path = require("path");

const url =
  process.argv[2] ||
  "https://www.mercadolivre.com.br/cabo-mxt-p10xp10-5m-lilas-p-guitarra-violo-baixo-teclado/p/MLB22743210";

fetch(url, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131 Safari/537.36",
    "Accept-Language": "pt-BR,pt;q=0.9",
  },
})
  .then((r) => r.text())
  .then((h) => {
    const out = path.join(__dirname, "ml-fetch-sample.html");
    fs.writeFileSync(out, h.slice(0, 800000), "utf8");
    console.log("saved", out, "len", h.length);

    const re = /aria-label=["']([^"']+)["']/gi;
    const priceRe = /reais|centavos|Antes|R\$/i;
    let m;
    const hits = [];
    while ((m = re.exec(h)) !== null) {
      if (priceRe.test(m[1])) hits.push(m[1]);
    }
    console.log("--- aria-label com preço (", hits.length, ") ---");
    hits.slice(0, 80).forEach((t, i) => console.log(i + 1, t));

    const idx = h.indexOf("ui-pdp-price__main-container");
    const block = idx >= 0 ? h.slice(idx, idx + 25000) : "";
    const hits2 = [];
    let m2;
    const re2 = /aria-label=["']([^"']+)["']/gi;
    while ((m2 = re2.exec(block)) !== null) {
      if (priceRe.test(m2[1])) hits2.push(m2[1]);
    }
    console.log("\n--- só dentro de ui-pdp-price__main-container (primeiros 25k) ---");
    hits2.forEach((t, i) => console.log(i + 1, t));
  })
  .catch((e) => console.error(e));
