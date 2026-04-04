import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { postgrestGet } from "@/lib/postgrest/server";
import {
  adminMoveAllAffiliateExpiredProductsToHistory,
  adminValidateAffiliateLinksBatch,
  mergeProductIdsForAffiliateValidation,
} from "@/lib/admin/db";

export const runtime = "nodejs";
/** Lote (ex.: 20) × fetch ML (~até 45s cada) — precisa folga para não cortar no Vercel/host. */
export const maxDuration = 300;

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));

    const sweep = await adminMoveAllAffiliateExpiredProductsToHistory();

    let expiredRows: { id: string }[] = [];
    try {
      expiredRows = await postgrestGet<{ id: string }[]>("products", {
        select: "id",
        affiliate_valid: "eq.false",
        limit: String(limit),
      });
    } catch (e) {
      console.warn("[validate-affiliate-links] consulta affiliate_valid=false ignorada", e);
    }
    const expiredIds = (Array.isArray(expiredRows) ? expiredRows : []).map((r) => r.id).filter(Boolean);
    const need = Math.max(0, limit - expiredIds.length);

    let queueRows: { id: string }[] = [];
    if (need > 0) {
      try {
        queueRows = await postgrestGet<{ id: string }[]>("products", {
          select: "id",
          order: "affiliate_valid_checked_at.asc.nullsfirst",
          limit: String(Math.min(need * 4, 100)),
        });
      } catch (e) {
        console.warn("[validate-affiliate-links] order por affiliate_valid_checked_at falhou, usando created_at", e);
        queueRows = await postgrestGet<{ id: string }[]>("products", {
          select: "id",
          order: "created_at.desc",
          limit: String(Math.min(need * 4, 100)),
        });
      }
    }

    const ids = mergeProductIdsForAffiliateValidation(expiredIds, queueRows, limit);
    if (ids.length === 0) {
      return NextResponse.json({
        ok: true,
        checked: 0,
        valid: 0,
        invalid: 0,
        errors: 0,
        message: "Nenhum produto para validar.",
      });
    }

    const result = await adminValidateAffiliateLinksBatch(ids);
    return NextResponse.json({
      ok: true,
      sweptFromExpiredFlag: sweep.moved,
      ...result,
      message: `Histórico: ${sweep.moved} produto(s) com link já marcado expirado. Validados ${result.checked} link(s): ${result.valid} válido(s), ${result.invalid} expirado(s)${result.errors > 0 ? `, ${result.errors} erro(s) interno(s)` : ""}.`,
    });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: "Erro ao validar links.", detail: msg },
      { status: 500 },
    );
  }
}
