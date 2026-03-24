import { NextResponse } from "next/server";
import { postgrestGet } from "@/lib/postgrest/server";
import { adminValidateAffiliateLinksBatch } from "@/lib/admin/db";

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

    const rows = await postgrestGet<{ id: string }[]>("products", {
      select: "id",
      order: "affiliate_valid_checked_at.asc.nullsfirst",
      limit: String(limit),
    });

    const ids = (Array.isArray(rows) ? rows : []).map((r) => r.id);
    if (ids.length === 0) {
      return NextResponse.json({
        ok: true,
        checked: 0,
        valid: 0,
        invalid: 0,
        message: "Nenhum produto para validar.",
      });
    }

    const result = await adminValidateAffiliateLinksBatch(ids);
    return NextResponse.json({
      ok: true,
      ...result,
      message: `Validados ${result.checked} link(s): ${result.valid} válido(s), ${result.invalid} inválido(s).`,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Erro ao validar links." }, { status: 500 });
  }
}
