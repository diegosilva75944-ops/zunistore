import { NextResponse } from "next/server";
import { z } from "zod";
import { postgrestGet, postgrestPatch } from "@/lib/postgrest/server";
import { sha256Hex } from "@/lib/crypto";
import { importMercadoLivreFromPdp } from "@/services/mercadolivre/import-from-pdp";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function withCors(res: NextResponse) {
  Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

const schema = z.object({
  /** URL da página do produto no Mercado Livre */
  sourceUrl: z.string().url(),
  /** Link de afiliado (botão Comprar) */
  affiliateUrl: z.string().url(),
  affiliateCode: z.string().min(1).optional().default("ml_ext"),
});

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) {
      return withCors(NextResponse.json({ ok: false, error: "Token ausente." }, { status: 401 }));
    }
    const rawToken = m[1].trim();
    if (!rawToken) {
      return withCors(NextResponse.json({ ok: false, error: "Token ausente." }, { status: 401 }));
    }

    const tokenHash = sha256Hex(rawToken);

    const tokenRows = await postgrestGet<any[]>("admin_tokens", {
      select: "id,active",
      token_hash: `eq.${tokenHash}`,
      limit: "1",
    });
    const tokenRow = Array.isArray(tokenRows) ? tokenRows[0] : null;

    if (!tokenRow || !tokenRow.active) {
      return withCors(NextResponse.json({ ok: false, error: "Token inválido ou revogado." }, { status: 401 }));
    }

    await postgrestPatch(
      "admin_tokens",
      { last_used_at: new Date().toISOString() },
      { id: `eq.${tokenRow.id}` },
    );

    const json = await req.json().catch(() => null);
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return withCors(NextResponse.json({ ok: false, error: "Payload inválido: informe sourceUrl e affiliateUrl." }, { status: 400 }));
    }

    try {
      const out = await importMercadoLivreFromPdp(parsed.data);
      return withCors(NextResponse.json({ ok: true, ...out }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao importar.";
      if (
        /Não consegui extrair|Informe uma URL|não parece ser do Mercado Livre|invalid_link|invalid_item_id/i.test(
          msg,
        )
      ) {
        return withCors(NextResponse.json({ ok: false, error: msg }, { status: 400 }));
      }
      throw e;
    }
  } catch (e) {
    console.error("[import/mercadolivre]", e);
    return withCors(
      NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "Erro interno ao importar." },
        { status: 500 },
      ),
    );
  }
}
