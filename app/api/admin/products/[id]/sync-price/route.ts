import { NextResponse } from "next/server";
import { postgrestGet, postgrestPatch, PostgrestError } from "@/lib/postgrest/server";
import { fetchPricesFromUrl, type FetchMlPriceResult } from "@/lib/ml-price";
import { moveProductToDeletedHistoryAndDelete, recordProductPriceChange } from "@/lib/admin/db";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    const sourceUrl = (row as any).source_url as string | null;
    const affiliateUrl = (row as any).affiliate_url as string | null;

    if (!String(sourceUrl || "").trim() && !String(affiliateUrl || "").trim()) {
      return NextResponse.json(
        { ok: false, error: "Produto sem URL de origem (source_url ou affiliate_url)." },
        { status: 400 },
      );
    }

    let ml: FetchMlPriceResult;
    try {
      ml = await fetchPricesFromUrl({ sourceUrl, affiliateUrl });
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
        await moveProductToDeletedHistoryAndDelete(id, "sync_not_found");
      } catch (e) {
        console.error("sync-price: moveProductToDeletedHistoryAndDelete", e);
        return NextResponse.json(
          {
            ok: false,
            error:
              "O anúncio parece não existir mais, mas não foi possível salvar no histórico de deletados.",
            details: e instanceof PostgrestError ? e.details : undefined,
          },
          { status: 500 },
        );
      }
      return NextResponse.json({
        ok: true,
        deleted: true,
        message:
          "Produto não encontrado na URL. Removido da listagem e do site e salvo no histórico de deletados.",
      });
    }

    const { price, promoPrice: promo } = ml;
    const is_offer = promo != null && promo < price;
    const off_percent = is_offer
      ? Math.min(100, Math.max(0, Math.round((1 - promo! / price) * 100)))
      : 0;

    const oldPrice = Number((row as any).price) || 0;
    const oldPromo =
      (row as any).promo_price != null ? Number((row as any).promo_price) : null;

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
        promo_price: promo ?? null,
        is_offer,
        off_percent,
        last_seen_at: new Date().toISOString(),
      },
      { id: `eq.${id}` },
    );

    return NextResponse.json({
      ok: true,
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
