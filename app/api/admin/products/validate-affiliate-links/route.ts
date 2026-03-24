import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { postgrestGet } from "@/lib/postgrest/server";
import { adminValidateAffiliateLinksBatch } from "@/lib/admin/db";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));

    const rows = await postgrestGet<any[]>("products", {
      select: "id",
      order: "affiliate_valid_checked_at.asc.nullsfirst",
      limit: String(limit),
    });

    const ids = (Array.isArray(rows) ? rows : []).map((r) => r.id);
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, checked: 0, valid: 0, invalid: 0, message: "Nenhum produto para validar." });
    }

    const result = await adminValidateAffiliateLinksBatch(ids);
    return NextResponse.json({
      ok: true,
      ...result,
      message: `Validados ${result.checked} link(s): ${result.valid} válido(s), ${result.invalid} expirado(s).`,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: "Erro ao validar links." },
      { status: 500 },
    );
  }
}
