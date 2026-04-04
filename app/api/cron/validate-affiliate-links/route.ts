import { NextResponse } from "next/server";
import { postgrestGet } from "@/lib/postgrest/server";
import {
  adminMoveAllAffiliateExpiredProductsToHistory,
  adminValidateAffiliateLinksBatch,
  mergeProductIdsForAffiliateValidation,
} from "@/lib/admin/db";

export const runtime = "nodejs";
export const maxDuration = 120;

function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  if (req.headers.get("x-cron-secret") === secret) return true;
  const q = new URL(req.url).searchParams.get("secret");
  if (q === secret) return true;
  return false;
}

/**
 * Cron: valida links de afiliado em lote (mesma lógica do admin, sem cookie).
 * Exige CRON_SECRET (Authorization: Bearer, header x-cron-secret ou ?secret=).
 */
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET não configurado no servidor." },
      { status: 503 },
    );
  }
  if (!cronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(30, Math.max(1, parseInt(searchParams.get("limit") ?? "15", 10) || 15));

    const sweep = await adminMoveAllAffiliateExpiredProductsToHistory();

    let expiredRows: { id: string }[] = [];
    try {
      expiredRows = await postgrestGet<{ id: string }[]>("products", {
        select: "id",
        affiliate_valid: "eq.false",
        limit: String(limit),
      });
    } catch (e) {
      console.warn("[cron validate-affiliate-links] consulta affiliate_valid=false ignorada", e);
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
        console.warn("[cron validate-affiliate-links] fallback order created_at", e);
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
      message: `Histórico: ${sweep.moved} com flag expirado. Validados ${result.checked} link(s): ${result.valid} válido(s), ${result.invalid} inválido(s)${result.errors > 0 ? `, ${result.errors} erro(s)` : ""}.`,
    });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: "Erro ao validar links.", detail: msg }, { status: 500 });
  }
}
