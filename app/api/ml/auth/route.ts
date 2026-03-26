import { NextResponse } from "next/server";
import { randomToken } from "@/lib/crypto";
import { checkMercadoLivreOAuthEnv } from "@/lib/mercadolivre/oauth-env";
import { getAdminSession } from "@/lib/admin/auth";
import { createOAuthState } from "@/lib/mercadolivre/oauth-state-store";

export const runtime = "nodejs";

const STATE_COOKIE = "ml_oauth_state";

export async function GET() {
  const debug = process.env.NODE_ENV !== "production";
  try {
    console.log("[ml-oauth][auth] enter");

    const envExists = {
      MERCADOLIVRE_CLIENT_ID: Boolean(process.env.MERCADOLIVRE_CLIENT_ID),
      MERCADOLIVRE_CLIENT_SECRET: Boolean(process.env.MERCADOLIVRE_CLIENT_SECRET),
      MERCADOLIVRE_REDIRECT_URI: Boolean(process.env.MERCADOLIVRE_REDIRECT_URI),
      MERCADOLIVRE_AUTH_URL: Boolean(process.env.MERCADOLIVRE_AUTH_URL),
      MERCADOLIVRE_API_URL: Boolean(process.env.MERCADOLIVRE_API_URL),
    };
    console.log("[ml-oauth][auth] env_exists", envExists);

    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
    }

    const checked = checkMercadoLivreOAuthEnv();
    if (!checked.ok) {
      console.error("[ml-oauth][auth] invalid_env");
      return NextResponse.json(
        { success: false, error: "Variáveis de ambiente do Mercado Livre ausentes ou inválidas" },
        { status: 500 },
      );
    }
    const env = checked.env;

    console.log("[ml-oauth][auth] generating_state:start");
    const state = randomToken(32);
    console.log("[ml-oauth][auth] generating_state:done", {
      statePreview: state.slice(0, 6) + "…" + state.slice(-4),
    });

    console.log("[ml-oauth][auth] persist_state:start");
    const persisted = await createOAuthState(state);
    console.log("[ml-oauth][auth] persist_state:done", {
      ok: persisted.ok,
      expiresAt: persisted.expiresAt,
    });
    if (!persisted.ok) {
      // Não bloqueia o redirect: cookie ainda protege CSRF e evita "quebrar" o fluxo quando a migration não foi aplicada.
      console.error("[ml-oauth][auth] persist_state_failed", persisted.error);
    }

    const authBase = env.MERCADOLIVRE_AUTH_URL.replace(/\/+$/, "");
    const u = new URL(authBase);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("client_id", env.MERCADOLIVRE_CLIENT_ID);
    u.searchParams.set("redirect_uri", env.MERCADOLIVRE_REDIRECT_URI);
    u.searchParams.set("state", state);
    console.log("[ml-oauth][auth] authorization_url", u.toString());

    const res = NextResponse.redirect(u.toString());
    console.log("[ml-oauth][auth] set_cookie:start");
    res.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/ml",
      maxAge: 60 * 10,
    });
    console.log("[ml-oauth][auth] set_cookie:done");

    if (debug) {
      const setCookie = res.headers.get("set-cookie");
      console.log("[ml-oauth][auth] set-cookie_header", setCookie ? setCookie.slice(0, 220) + "…" : null);
      console.log("[ml-oauth][auth] redirect_uri", env.MERCADOLIVRE_REDIRECT_URI);
    }

    return res;
  } catch (e) {
    console.error("[ml-oauth][auth] error", e);
    const message = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json(
      { success: false, error: "Falha ao iniciar OAuth do Mercado Livre", detail: debug ? message : undefined },
      { status: 500 },
    );
  }
}

