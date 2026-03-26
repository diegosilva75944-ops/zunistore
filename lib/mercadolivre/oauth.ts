import "server-only";

import { requireMercadoLivreOAuthEnv } from "./oauth-env";
import { MercadoLivreError } from "@/services/mercadolivre/errors";
import { mlTokenResponseSchema, type MlTokenResponse } from "./oauth-types";

function tokenEndpoint(): string {
  const env = requireMercadoLivreOAuthEnv();
  const base = env.MERCADOLIVRE_API_URL.replace(/\/+$/, "");
  return `${base}/oauth/token`;
}

async function postForm(body: Record<string, string>): Promise<unknown> {
  const url = tokenEndpoint();
  const form = new URLSearchParams(body);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: form.toString(),
    cache: "no-store",
  });
  const text = await res.text().catch(() => "");
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    console.error("[ml-oauth] token endpoint error", { status: res.status, body: json });
    throw new MercadoLivreError(
      res.status === 401 || res.status === 403 ? "unexpected_response" : "network",
      "Falha ao trocar/renovar token no Mercado Livre.",
      { status: res.status, details: json },
    );
  }
  return json;
}

export async function exchangeCodeForToken(code: string): Promise<MlTokenResponse> {
  const env = requireMercadoLivreOAuthEnv();
  const json = await postForm({
    grant_type: "authorization_code",
    client_id: env.MERCADOLIVRE_CLIENT_ID,
    client_secret: env.MERCADOLIVRE_CLIENT_SECRET,
    code,
    redirect_uri: env.MERCADOLIVRE_REDIRECT_URI,
  });
  const parsed = mlTokenResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error("[ml-oauth] token schema mismatch", parsed.error.issues);
    throw new MercadoLivreError("unexpected_response", "Resposta inesperada ao trocar code por token.", {
      details: parsed.error.issues,
    });
  }
  return parsed.data;
}

export async function refreshToken(refresh_token: string): Promise<MlTokenResponse> {
  const env = requireMercadoLivreOAuthEnv();
  const json = await postForm({
    grant_type: "refresh_token",
    client_id: env.MERCADOLIVRE_CLIENT_ID,
    client_secret: env.MERCADOLIVRE_CLIENT_SECRET,
    refresh_token,
  });
  const parsed = mlTokenResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error("[ml-oauth] refresh schema mismatch", parsed.error.issues);
    throw new MercadoLivreError("unexpected_response", "Resposta inesperada ao renovar token.", {
      details: parsed.error.issues,
    });
  }
  return parsed.data;
}

export function computeExpiresAt(expires_in: number): string {
  const now = Date.now();
  const ms = Math.max(1, expires_in) * 1000;
  return new Date(now + ms).toISOString();
}

