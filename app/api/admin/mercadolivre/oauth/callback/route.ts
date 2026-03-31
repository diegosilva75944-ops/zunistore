import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { z } from "zod";
import { consumeOAuthState } from "@/lib/mercadolivre/oauth-state-store";
import { exchangeCodeForToken, computeExpiresAt } from "@/lib/mercadolivre/oauth";
import { upsertMlToken } from "@/lib/mercadolivre/token-store";

export const runtime = "nodejs";

const schema = z.object({
  code: z.string().min(3),
  state: z.string().min(10),
});

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = schema.safeParse({
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state"),
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Callback inválido (code/state ausentes)." }, { status: 400 });
  }

  const consumed = await consumeOAuthState(parsed.data.state);
  if (!consumed.ok) {
    return NextResponse.json({ ok: false, error: `State inválido (${consumed.reason}).` }, { status: 400 });
  }

  const token = await exchangeCodeForToken(parsed.data.code);
  await upsertMlToken({
    user_id: String(token.user_id),
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    token_type: token.token_type ?? "bearer",
    scope: token.scope ?? null,
    expires_in: token.expires_in,
    expires_at: computeExpiresAt(token.expires_in),
  });

  return NextResponse.redirect("/admin/importacao?ml_oauth=ok");
}

