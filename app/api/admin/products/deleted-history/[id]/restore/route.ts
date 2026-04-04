import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin/auth";
import { adminRestoreProductFromDeletedHistory } from "@/lib/admin/db";

export const runtime = "nodejs";

const bodySchema = z.object({
  affiliateUrl: z.string().url(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  try {
    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Informe affiliateUrl (URL do novo link de afiliado)." },
        { status: 400 },
      );
    }
    const result = await adminRestoreProductFromDeletedHistory(id, parsed.data.affiliateUrl);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro ao restaurar." },
      { status: 500 },
    );
  }
}
