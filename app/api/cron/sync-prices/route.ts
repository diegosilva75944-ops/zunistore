import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { runCronMlFullReimportOne } from "@/services/mercadolivre/cron-ml-reimport";

export const runtime = "nodejs";
/** Reimportação ML (Teste ML + persist) pode acionar Playwright — tempo maior que só preço. */
export const maxDuration = 300;

export async function GET(_req: Request) {
  const result = await runCronMlFullReimportOne();
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        mode: "ml_full_reimport",
        error: result.error,
        product_id: result.product_id,
        code6: result.code6,
      },
      { status: 500 },
    );
  }
  if (result.skipped) {
    return NextResponse.json({
      ok: true,
      mode: "ml_full_reimport",
      skipped: true,
      reason: result.reason,
      total: 0,
      reimported: 0,
      deleted: 0,
      failed: 0,
    });
  }
  return NextResponse.json({
    ok: true,
    mode: "ml_full_reimport",
    skipped: false,
    product_id: result.product_id,
    code6: result.code6,
    reimported: result.reimported ? 1 : 0,
    deleted: result.deleted ? 1 : 0,
    listing_gone: result.listing_gone,
    total: 1,
    updated: result.reimported ? 1 : 0,
    failed: 0,
  });
}

export async function POST(_req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const result = await runCronMlFullReimportOne();
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        mode: "ml_full_reimport",
        error: result.error,
        product_id: result.product_id,
        code6: result.code6,
      },
      { status: 500 },
    );
  }
  if (result.skipped) {
    return NextResponse.json({
      ok: true,
      mode: "ml_full_reimport",
      skipped: true,
      reason: result.reason,
      total: 0,
      reimported: 0,
      deleted: 0,
      failed: 0,
    });
  }
  return NextResponse.json({
    ok: true,
    mode: "ml_full_reimport",
    skipped: false,
    product_id: result.product_id,
    code6: result.code6,
    reimported: result.reimported ? 1 : 0,
    deleted: result.deleted ? 1 : 0,
    listing_gone: result.listing_gone,
    total: 1,
    updated: result.reimported ? 1 : 0,
    failed: 0,
  });
}
