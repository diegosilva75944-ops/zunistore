import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { checkMercadoLivreOAuthEnv } from "@/lib/mercadolivre/oauth-env";
import { createOAuthState } from "@/lib/mercadolivre/oauth-state-store";

export const runtime = "nodejs";

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const env = checkMercadoLivreOAuthEnv();
  if (!env.ok) {
    return NextResponse.json({ ok: false, error: "Variáveis MERCADOLIVRE_* não configuradas." }, { status: 500 });
  }

  const state = crypto.randomUUID();
  const created = await createOAuthState(state);
  if (!created.ok) {
    return NextResponse.json({ ok: false, error: "Falha ao criar state OAuth no banco." }, { status: 500 });
  }

  const authUrl = new URL(env.env.MERCADOLIVRE_AUTH_URL);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", env.env.MERCADOLIVRE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", env.env.MERCADOLIVRE_REDIRECT_URI);
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString());
}

