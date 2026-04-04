/**
 * Diagnóstico: lê o produto pelo code6 no PostgREST e simula a checagem de link (fetch ML).
 *
 * Uso: npx tsx scripts/verify-product-link-by-code6.ts 000692
 *
 * Carrega variáveis de `.env.local` (não commitar segredos).
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
  const code6 = (process.argv[2] || "000692").trim();
  const { postgrestGet } = await import("../lib/postgrest/fetch");
  const { checkAffiliatePageContainsProduct } = await import("../lib/affiliate-validate");

  const rows = await postgrestGet<
    {
      id: string;
      code6: string;
      title: string;
      affiliate_url: string;
      affiliate_valid: boolean | null;
      affiliate_valid_checked_at: string | null;
    }[]
  >("products", {
    select: "id,code6,title,affiliate_url,affiliate_valid,affiliate_valid_checked_at",
    code6: `eq.${code6}`,
    limit: "1",
  });

  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) {
    console.log(JSON.stringify({ ok: false, error: "Produto não encontrado em products.", code6 }, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log("--- Estado no banco (tabela products) ---");
  console.log(
    JSON.stringify(
      {
        id: row.id,
        code6: row.code6,
        affiliate_valid: row.affiliate_valid,
        affiliate_valid_checked_at: row.affiliate_valid_checked_at,
        affiliate_url_preview: String(row.affiliate_url || "").slice(0, 120),
      },
      null,
      2,
    ),
  );

  const url = String(row.affiliate_url || "").trim();
  if (!url.startsWith("http")) {
    console.log("\n--- Checagem HTTP ---");
    console.log(JSON.stringify({ skipped: true, reason: "Sem affiliate_url http válido." }, null, 2));
    return;
  }

  console.log("\n--- Checagem HTTP (mesma lógica do admin: fetchPricesFromUrl) ---");
  const check = await checkAffiliatePageContainsProduct(url, row.title || "");
  console.log(JSON.stringify(check, null, 2));

  console.log("\n--- Efeito esperado no admin (adminValidateProductAffiliateLink) ---");
  if (row.affiliate_valid === false) {
    console.log(
      "Já está affiliate_valid=false → tentativa de validar move para deleted_products_history (affiliate_expired) sem novo fetch.",
    );
  } else if (check.valid) {
    console.log("Link considerado válido → gravaria affiliate_valid=true e affiliate_valid_checked_at=agora.");
    console.log("Permanece na listagem de produtos (não vai para Deletados).");
  } else {
    console.log("Link considerado inválido → move para deleted_products_history (affiliate_expired) e remove de products.");
  }

  console.log("\n--- Já existe no histórico de deletados (mesmo code6)? ---");
  try {
    const hist = await postgrestGet<{ id: string; deleted_at: string; reason: string }[]>(
      "deleted_products_history",
      {
        select: "id,deleted_at,reason",
        code6: `eq.${code6}`,
        order: "deleted_at.desc",
        limit: "3",
      },
    );
    const histList = Array.isArray(hist) ? hist : [];
    if (histList.length === 0) {
      console.log("Nenhum registro em deleted_products_history com este code6.");
    } else {
      console.log(JSON.stringify(histList, null, 2));
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(
      "ERRO ao consultar deleted_products_history — sem esta tabela na API PostgREST, nada vai para a aba Deletados:",
    );
    console.log(msg);
    console.log(
      "\nCorrija: aplique supabase/migrations/20250304_deleted_products_history.sql no projeto e recarregue o schema (Dashboard Supabase → Settings → API → Reload schema, ou aguarde).",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
