import { NextResponse } from "next/server";
import { z } from "zod";
import { importMercadoLivreFromPdp } from "@/services/mercadolivre/import-from-pdp";
import { assertMobileAppAuthorized, MobileAppAuthError } from "@/lib/mobile-app/auth";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  sourceUrl: z.string().url(),
  affiliateUrl: z.string().url(),
  affiliateCode: z.string().min(1).optional().default("ml_mobile"),
});

export async function POST(req: Request) {
  try {
    assertMobileAppAuthorized(req);
    const json = await req.json().catch(() => null);
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Informe sourceUrl e affiliateUrl válidos." },
        { status: 400 },
      );
    }

    const out = await importMercadoLivreFromPdp(parsed.data);
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    if (e instanceof MobileAppAuthError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    console.error("[mobile/v1/import]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro ao importar." },
      { status: 422 },
    );
  }
}
