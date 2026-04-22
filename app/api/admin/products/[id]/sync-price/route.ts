import { NextResponse } from "next/server";
import { postgrestGet, postgrestPatch, PostgrestError } from "@/lib/postgrest/server";
import {
  adminValidateProductAffiliateLink,
  markProductSoftInactive,
  recordProductPriceChange,
} from "@/lib/admin/db";
import { fetchPricesFromUrl } from "@/lib/ml-price";
import { listMercadoLivreUrlsForItemExtraction } from "@/services/mercadolivre/ml-url-resolve";
import { fetchMlPricesLikeImport } from "@/services/mercadolivre/sync-prices-like-import";
import {
  ensureMercadoLivreListingRowForProduct,
  mlSyncImportedProductPricesAndRatingsOnly,
} from "@/services/mercadolivre/sync";

export const runtime = "nodejs";
/** Reimportação ML (Teste ML + persist) pode acionar Playwright. */
export const maxDuration = 300;

/** Atualiza `affiliate_valid` / `affiliate_valid_checked_at` quando há `affiliate_url` (ignora sem link). */
async function maybeValidateAffiliate(productId: string) {
  try {
    await adminValidateProductAffiliateLink(productId);
  } catch (e) {
    console.error("sync-price: adminValidateProductAffiliateLink", e);
  }
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  try {
    const rows = await postgrestGet<any[]>("products", {
      select: "id,source_url,affiliate_url,price,promo_price",
      id: `eq.${id}`,
      limit: "1",
    });
    const row = Array.isArray(rows) ? rows[0] : null;

    if (!row) {
      return NextResponse.json(
        { ok: false, error: "Produto não encontrado." },
        { status: 404 },
      );
    }

    const sourceUrl = row.source_url as string | null;
    const affiliateUrl = row.affiliate_url as string | null;

    if (!String(sourceUrl || "").trim() && !String(affiliateUrl || "").trim()) {
      return NextResponse.json(
        { ok: false, error: "Produto sem URL de origem (source_url ou affiliate_url)." },
        { status: 400 },
      );
    }

    const listingRows = await postgrestGet<any[]>("product_external_listings", {
      select: "id",
      origin: "eq.mercadolivre",
      product_id: `eq.${id}`,
      limit: "1",
    });
    let hasMercadoLivreListing = Array.isArray(listingRows) && Boolean(listingRows[0]);

    if (!hasMercadoLivreListing) {
      const ensured = await ensureMercadoLivreListingRowForProduct(id, sourceUrl, affiliateUrl);
      if (ensured.ok) {
        hasMercadoLivreListing = true;
      } else {
        const mlCandidates = listMercadoLivreUrlsForItemExtraction(sourceUrl, affiliateUrl);
        if (mlCandidates.length > 0) {
          return NextResponse.json(
            {
              ok: false,
              mode: "ml_full_reimport",
              error: `Não foi possível preparar a reimportação ML: ${ensured.reason}`,
            },
            { status: 422 },
          );
        }
      }
    }

    if (hasMercadoLivreListing) {
      const priceUrl =
        typeof affiliateUrl === "string" && affiliateUrl.trim().startsWith("http") ?
          { sourceUrl, affiliateUrl }
        : typeof sourceUrl === "string" && sourceUrl.trim().startsWith("http") ?
          { sourceUrl, affiliateUrl }
        : null;

      if (!priceUrl) {
        return NextResponse.json(
          {
            ok: false,
            error: "Produto sem source_url/affiliate_url válidos para sincronizar o anúncio do Mercado Livre.",
          },
          { status: 400 },
        );
      }

      const quick = await fetchPricesFromUrl(priceUrl);
      if (quick.kind === "listing_gone") {
        try {
          await markProductSoftInactive(id);
        } catch (e) {
          console.error("sync-price: markProductSoftInactive", e);
          return NextResponse.json(
            {
              ok: false,
              error: "O anúncio parece não existir mais, mas não foi possível marcar o produto como inativo.",
              details: e instanceof PostgrestError ? e.details : undefined,
            },
            { status: 500 },
          );
        }
        return NextResponse.json({
          ok: true,
          mode: "ml_full_reimport",
          inactive: true,
          message:
            "Anúncio não encontrado na origem. O produto foi marcado como inativo (sai das listagens; a página continua com noindex até reativar ou apagar).",
        });
      }

      const oldPrice = Number(row.price) || 0;
      const oldPromo = row.promo_price != null ? Number(row.promo_price) : null;

      try {
        await mlSyncImportedProductPricesAndRatingsOnly(id);
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Falha ao reimportar o anúncio do Mercado Livre.";
        return NextResponse.json({ ok: false, error: message, mode: "ml_full_reimport" }, { status: 503 });
      }

      const afterRows = await postgrestGet<any[]>("products", {
        select: "price,promo_price,is_offer,off_percent",
        id: `eq.${id}`,
        limit: "1",
      });
      const after = Array.isArray(afterRows) ? afterRows[0] : null;

      if (after) {
        try {
          await recordProductPriceChange({
            productId: id,
            oldPrice,
            newPrice: Number(after.price) || 0,
            oldPromoPrice: oldPromo,
            newPromoPrice: after.promo_price != null ? Number(after.promo_price) : null,
            source: "sync_single",
          });
        } catch (e) {
          console.error("sync-price: recordProductPriceChange", e);
        }
      }

      await maybeValidateAffiliate(id);

      if (!after) {
        return NextResponse.json(
          { ok: false, error: "Não foi possível ler o produto após a sincronização." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        ok: true,
        mode: "ml_full_reimport",
        price: Number(after.price) || 0,
        promo_price: after.promo_price != null ? Number(after.promo_price) : null,
        is_offer: Boolean(after.is_offer),
        off_percent: Number(after.off_percent) || 0,
      });
    }

    let ml: Awaited<ReturnType<typeof fetchMlPricesLikeImport>>;
    try {
      ml = await fetchMlPricesLikeImport({ sourceUrl, affiliateUrl });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Falha ao buscar a página do Mercado Livre.";
      return NextResponse.json({ ok: false, error: message }, { status: 503 });
    }

    if (ml.kind === "http_error") {
      return NextResponse.json(
        {
          ok: false,
          error: `O Mercado Livre respondeu HTTP ${ml.status}. Tente de novo em alguns instantes.`,
        },
        { status: 502 },
      );
    }

    if (ml.kind === "unreadable") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Não foi possível identificar o preço nesta página. Verifique se o link ainda abre o anúncio do produto; o layout do site pode ter mudado.",
        },
        { status: 422 },
      );
    }

    if (ml.kind === "blocked") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "O Mercado Livre bloqueou a leitura automática (login/cookies ou página de erro). O sync usa o link limpo do catálogo (…/p/MLB… sem parâmetros). Atualize source_url para esse formato ou use a extensão no navegador.",
        },
        { status: 422 },
      );
    }

    if (ml.kind === "listing_gone") {
      try {
        await markProductSoftInactive(id);
      } catch (e) {
        console.error("sync-price: markProductSoftInactive", e);
        return NextResponse.json(
          {
            ok: false,
            error: "O anúncio parece não existir mais, mas não foi possível marcar o produto como inativo.",
            details: e instanceof PostgrestError ? e.details : undefined,
          },
          { status: 500 },
        );
      }
      return NextResponse.json({
        ok: true,
        mode: "price_only",
        inactive: true,
        message:
          "Anúncio não encontrado na origem. O produto foi marcado como inativo (sai das listagens; a página continua com noindex até reativar ou apagar).",
      });
    }

    const { price, promo_price: promo, is_offer, off_percent } = ml;

    const oldPrice = Number(row.price) || 0;
    const oldPromo = row.promo_price != null ? Number(row.promo_price) : null;

    try {
      await recordProductPriceChange({
        productId: id,
        oldPrice,
        newPrice: price,
        oldPromoPrice: oldPromo,
        newPromoPrice: promo ?? null,
        source: "sync_single",
      });
    } catch (e) {
      console.error("sync-price: recordProductPriceChange (preço será atualizado mesmo assim)", e);
    }

    await postgrestPatch(
      "products",
      {
        price,
        promo_price: promo,
        is_offer,
        off_percent,
        last_seen_at: new Date().toISOString(),
      },
      { id: `eq.${id}` },
    );

    await maybeValidateAffiliate(id);

    return NextResponse.json({
      ok: true,
      mode: "price_only",
      price,
      promo_price: promo,
      is_offer,
      off_percent,
    });
  } catch (e) {
    console.error("sync-price", e);
    if (e instanceof PostgrestError) {
      return NextResponse.json(
        {
          ok: false,
          error: e.message,
          details: e.details,
        },
        { status: e.status >= 400 && e.status < 600 ? e.status : 502 },
      );
    }
    const message = e instanceof Error ? e.message : "Erro interno.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
