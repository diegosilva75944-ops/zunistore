import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { checkMercadoLivreOAuthEnv } from "@/lib/mercadolivre/oauth-env";
import { createOAuthState } from "@/lib/mercadolivre/oauth-state-store";
import { serializeError } from "@/lib/mercadolivre/oauth-debug";

export const runtime = "nodejs";

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const env = checkMercadoLivreOAuthEnv();
  if (!env.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Variáveis MERCADOLIVRE_* não configuradas.",
        details: {
          MERCADOLIVRE_CLIENT_ID: Boolean(process.env.MERCADOLIVRE_CLIENT_ID),
          MERCADOLIVRE_CLIENT_SECRET: Boolean(process.env.MERCADOLIVRE_CLIENT_SECRET),
          MERCADOLIVRE_REDIRECT_URI: process.env.MERCADOLIVRE_REDIRECT_URI ?? null,
          MERCADOLIVRE_AUTH_URL: process.env.MERCADOLIVRE_AUTH_URL ?? null,
          MERCADOLIVRE_API_URL: process.env.MERCADOLIVRE_API_URL ?? null,
        },
      },
      { status: 500 },
    );
  }

  const state = crypto.randomUUID();
  const created = await createOAuthState(state);
  if (!created.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Falha ao criar state OAuth no banco.",
        details: {
          expiresAt: created.expiresAt,
          storeError: serializeError(created.error),
        },
      },
      { status: 500 },
    );
  }

  const authUrl = new URL(env.env.MERCADOLIVRE_AUTH_URL);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", env.env.MERCADOLIVRE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", env.env.MERCADOLIVRE_REDIRECT_URI);
  authUrl.searchParams.set("state", state);
  /**
   * Sem `scope`, alguns endpoints retornam 403 (forbidden) mesmo com OAuth.
   * Pedir o mínimo necessário para leitura + refresh token.
   * Docs: https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao
   */
  authUrl.searchParams.set("scope", "read offline_access");
  authUrl.searchParams.set("prompt", "consent");

  return NextResponse.redirect(authUrl.toString());
}

