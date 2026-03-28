import { NextResponse } from "next/server";
import { z } from "zod";
import { clearPersonalizationSession } from "@/services/personalization/clear-session";

export const runtime = "nodejs";

const schema = z.object({
  sessionId: z.string().uuid(),
});

/** Limpa histórico da sessão no servidor (localStorage é limpo no cliente). */
export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "sessionId inválido." }, { status: 400 });
    }
    await clearPersonalizationSession(parsed.data.sessionId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[personalization/clear]", e);
    return NextResponse.json({ ok: false, error: "Falha ao limpar." }, { status: 500 });
  }
}
