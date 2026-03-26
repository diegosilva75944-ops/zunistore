import { NextResponse } from "next/server";
import { randomToken } from "@/lib/crypto";
import { requireMercadoLivreOAuthEnv } from "@/lib/mercadolivre/oauth-env";
import { getAdminSession } from "@/lib/admin/auth";
import { createOAuthState } from "@/lib/mercadolivre/oauth-state-store";

export const runtime = "nodejs";

const STATE_COOKIE = "ml_oauth_state";

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const env = requireMercadoLivreOAuthEnv();
  const state = randomToken(32);

  // Persiste server-side (mais robusto que só cookie) e depois seta cookie no redirect response.
  await createOAuthState(state);

  const authBase = env.MERCADOLIVRE_AUTH_URL.replace(/\/+$/, "");
  const u = new URL(authBase);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", env.MERCADOLIVRE_CLIENT_ID);
  u.searchParams.set("redirect_uri", env.MERCADOLIVRE_REDIRECT_URI);
  u.searchParams.set("state", state);

  const res = NextResponse.redirect(u.toString());
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/ml", // garante envio no callback
    maxAge: 60 * 10,
  });

  const debug = process.env.NODE_ENV !== "production";
  if (debug) {
    console.log("[ml-oauth][auth] state_generated", {
      statePreview: state.slice(0, 6) + "…" + state.slice(-4),
      redirect_uri: env.MERCADOLIVRE_REDIRECT_URI,
    });
    const setCookie = res.headers.get("set-cookie");
    console.log("[ml-oauth][auth] set-cookie", setCookie ? setCookie.slice(0, 140) + "…" : null);
  }

  return res;
}

