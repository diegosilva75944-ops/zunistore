import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin/auth";
import { importMercadoLivreFromPdp } from "@/services/mercadolivre/import-from-pdp";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  sourceUrl: z.string().url(),
  affiliateUrl: z.string().url(),
  affiliateCode: z.string().min(1).optional().default("ml_ext"),
});

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Informe sourceUrl e affiliateUrl válidos (URLs completas)." },
      { status: 400 },
    );
  }

  try {
    const out = await importMercadoLivreFromPdp(parsed.data);
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    console.error("[import/mercadolivre-session]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro ao importar." },
      { status: 422 },
    );
  }
}
