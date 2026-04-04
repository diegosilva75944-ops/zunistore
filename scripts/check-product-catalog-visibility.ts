/**
 * Diagnóstico: por que um produto pode não aparecer no catálogo (lib/store.ts).
 * Uso: npx tsx scripts/check-product-catalog-visibility.ts 000751
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadDotenvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

loadDotenvFile(resolve(process.cwd(), ".env.local"));

async function main() {
  const code6 = (process.argv[2] || "").trim();
  if (!code6) {
    console.error("Informe o code6, ex: 000751");
    process.exitCode = 1;
    return;
  }

  const { postgrestGet } = await import("../lib/postgrest/fetch");

  const rows = await postgrestGet<
    {
      id: string;
      code6: string;
      title: string;
      is_active: boolean | null;
      affiliate_valid: boolean | null;
      affiliate_valid_checked_at: string | null;
      category_id: string | null;
    }[]
  >("products", {
    select: "id,code6,title,is_active,affiliate_valid,affiliate_valid_checked_at,category_id",
    code6: `eq.${code6}`,
    limit: "1",
  });

  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) {
    console.log(JSON.stringify({ encontrado: false, code6, motivo: "Não existe em products (ou code6 diferente)." }, null, 2));
    return;
  }

  /** Catálogo usa (affiliate_valid IS NULL OR affiliate_valid = true); só false some. */
  const visivel = row.is_active === true && row.affiliate_valid !== false;
  const reasons: string[] = [];
  if (row.is_active !== true) {
    reasons.push(
      `is_active deve ser true no catálogo (atual: ${JSON.stringify(row.is_active)}). Ative o produto no admin ou ajuste no banco.`,
    );
  }
  if (row.affiliate_valid === false) {
    reasons.push(
      "affiliate_valid = false (link expirado): oculto no site até novo link ou restauração do histórico.",
    );
  }

  console.log("--- Dados no banco ---");
  console.log(JSON.stringify(row, null, 2));
  console.log("\n--- Catálogo público (regras store.ts) ---");
  console.log(
    JSON.stringify(
      {
        apareceria_no_site: visivel,
        bloqueios: reasons.length ? reasons : ["Nenhum bloqueio por is_active/affiliate_valid."],
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
