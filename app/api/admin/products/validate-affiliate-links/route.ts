import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import {
  adminMoveAllAffiliateExpiredProductsToHistory,
  adminValidateAffiliateLinksBatch,
  pickAffiliateValidationProductIds,
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

    const ids = await pickAffiliateValidationProductIds(limit);
    if (ids.length === 0) {
      return NextResponse.json({
        ok: true,
        checked: 0,
        valid: 0,
        invalid: 0,
        errors: 0,
        transient: 0,
        message: "Nenhum produto para validar.",
      });
    }

    const result = await adminValidateAffiliateLinksBatch(ids);
    return NextResponse.json({
      ok: true,
      sweptFromExpiredFlag: sweep.moved,
      ...result,
      message: `Histórico: ${sweep.moved} produto(s) com link já marcado expirado. Validados ${result.checked} link(s): ${result.valid} válido(s), ${result.invalid} expirado(s)${result.transient > 0 ? `, ${result.transient} adiado(s) (bloqueio/rate limit)` : ""}${result.errors > 0 ? `, ${result.errors} erro(s) interno(s)` : ""}.`,
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
