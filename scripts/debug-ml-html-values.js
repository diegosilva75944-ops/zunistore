const fs = require("node:fs");

const html = fs.readFileSync("tmp-ml-sync.html", "utf8");

// Extrai todas as ocorrências de buying_option_id e lista valores xx.xx
// num raio para entender como o preço é representado no HTML do fetch.
const re = /buying_option_id\":\"([^\"]+)\"/g;
let m;
let k = 0;
const seenPos = new Set();
while ((m = re.exec(html)) && k < 10) {
  const id = m[1];
  const pos = m.index;
  if (seenPos.has(pos)) continue;
  seenPos.add(pos);

  const slice = html.slice(pos, pos + 5000);

  // Valores no contexto (xx.xx). Filtra para intervalo plausível de preço.
  const all = slice.match(/\b\d+\.\d{2}\b/g) || [];
  const uniq = Array.from(new Set(all));
  const likely = uniq
    .map((s) => Number(s))
    .filter((n) => n > 5 && n < 200)
    .sort((a, b) => a - b)
    .slice(0, 60);

  const has35 = slice.includes("35.72") || slice.includes("35,72");
  const has31 = slice.includes("31.25") || slice.includes("31,25");

  console.log(`buying_option_id=${id} pos=${pos} has35=${has35} has31=${has31}`);
  console.log(`  likely xx.xx (first 60): ${likely.join(", ")}`);

  // Também busca padrões do tipo "price": 31.xx
  const priceField = slice.match(/\"price\"\\s*:\\s*([0-9]+\\.[0-9]{2})/);
  if (priceField) console.log(`  first "price": ${priceField[1]}`);

  k++;
}

console.log("---- quick presence checks (global) ----");
const quick = ["35.72", "31.25", "35,72", "31,25", "Antes:"];
for (const t of quick) {
  console.log(`${t}: idx=${html.indexOf(t)}`);
}

