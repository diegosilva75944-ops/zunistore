import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import {
  adminMoveAffiliateExpiredToHistoryByCode6,
  adminMoveAllAffiliateExpiredProductsToHistory,
} from "@/lib/admin/db";

export const runtime = "nodejs";

/**
 * Move produtos com `affiliate_valid = false` para o histórico de deletados (affiliate_expired).
 * Não faz fetch HTTP — só alinha o que já está marcado no banco.
 *
 * Body opcional: `{ "code6": "000692" }` — tenta mover esse código após o sweep em lote (útil se um item ficou preso).
 */
export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const { moved } = await adminMoveAllAffiliateExpiredProductsToHistory();
    let targeted: { ok: boolean; reason?: string } | undefined;
    const body = await req.json().catch(() => ({})) as { code6?: string };
    const code6 = typeof body?.code6 === "string" ? body.code6.trim() : "";
    if (code6) {
      targeted = await adminMoveAffiliateExpiredToHistoryByCode6(code6);
    }
    return NextResponse.json({ ok: true, moved, targeted });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro ao mover expirados." },
      { status: 500 },
    );
  }
}
