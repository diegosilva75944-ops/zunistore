import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin/auth";
import { exchangeCodeForToken, computeExpiresAt } from "@/lib/mercadolivre/oauth";
import { upsertMlToken } from "@/lib/mercadolivre/token-store";

export const runtime = "nodejs";

const STATE_COOKIE = "ml_oauth_state";

const querySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    code: searchParams.get("code"),
    state: searchParams.get("state"),
  });
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Callback inválido (code/state ausentes)." }, { status: 400 });
  }

  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value ?? "";
  // limpar sempre, para evitar replay
  jar.set(STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  if (!expected || parsed.data.state !== expected) {
    return NextResponse.json({ success: false, error: "State inválido. Tente autorizar novamente." }, { status: 400 });
  }

  const token = await exchangeCodeForToken(parsed.data.code);
  const userId = String(token.user_id);

  await upsertMlToken({
    user_id: userId,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    token_type: token.token_type ?? "bearer",
    scope: token.scope ?? null,
    expires_in: token.expires_in,
    expires_at: computeExpiresAt(token.expires_in),
  });

  // redireciona de volta pro admin
  return NextResponse.redirect(new URL("/admin/mercadolivre", req.url));
}

