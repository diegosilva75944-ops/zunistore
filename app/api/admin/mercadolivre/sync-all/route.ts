import { NextResponse } from "next/server";
import { postgrestGet } from "@/lib/postgrest/server";
import { mlSyncImportedProductsBatch } from "@/services/mercadolivre/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));

    const rows = await postgrestGet<any[]>("product_external_listings", {
      select: "product_id",
      origin: "eq.mercadolivre",
      order: "last_synced_at.asc.nullsfirst,imported_at.asc",
      limit: String(limit),
    });
    const ids = (Array.isArray(rows) ? rows : []).map((r) => r.product_id).filter(Boolean);
    if (!ids.length) {
      return NextResponse.json({ ok: true, results: [], okCount: 0, failCount: 0, message: "Nenhum produto importado para sincronizar." });
    }

    const results = await mlSyncImportedProductsBatch(ids, { delayMs: 400 });
    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;
    return NextResponse.json({ ok: true, results, okCount, failCount, total: ids.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Erro ao sincronizar todos." }, { status: 500 });
  }
}

