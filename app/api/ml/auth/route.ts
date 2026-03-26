import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomToken } from "@/lib/crypto";
import { requireMercadoLivreOAuthEnv } from "@/lib/mercadolivre/oauth-env";
import { getAdminSession } from "@/lib/admin/auth";

export const runtime = "nodejs";

const STATE_COOKIE = "ml_oauth_state";

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const env = requireMercadoLivreOAuthEnv();
  const state = randomToken(32);

  const jar = await cookies();
  jar.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10, // 10 min
  });

  const authBase = env.MERCADOLIVRE_AUTH_URL.replace(/\/+$/, "");
  const u = new URL(authBase);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", env.MERCADOLIVRE_CLIENT_ID);
  u.searchParams.set("redirect_uri", env.MERCADOLIVRE_REDIRECT_URI);
  u.searchParams.set("state", state);

  return NextResponse.redirect(u.toString());
}

