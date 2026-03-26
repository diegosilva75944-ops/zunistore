import "server-only";

import { upsertMlToken } from "./token-store";
import { refreshToken, computeExpiresAt } from "./oauth";
import { postgrestGet } from "@/lib/postgrest/server";

const EXPIRY_SAFETY_SECONDS = 120;

export class MercadoLivreNotAuthorizedError extends Error {
  constructor(message = "Mercado Livre não autorizado. Acesse /api/ml/auth para autorizar.") {
    super(message);
    this.name = "MercadoLivreNotAuthorizedError";
  }
}

function isExpiringSoon(expiresAtIso: string) {
  const t = new Date(expiresAtIso).getTime();
  if (!Number.isFinite(t)) return true;
  return t - Date.now() <= EXPIRY_SAFETY_SECONDS * 1000;
}

/**
 * Retorna sempre um access_token válido. Se estiver expirando, faz refresh e persiste.
 * Por simplicidade inicial, escolhe o primeiro token salvo (single-account).
 */
export async function getValidMercadoLivreAccessToken(): Promise<{
  user_id: string;
  access_token: string;
  token_type: string;
}> {
  // A tabela tem user_id único, mas não temos um “current user” no app.
  // Estratégia: listagem limitada (1) ordenada por updated_at desc.
  const list = await postgrestGet<any[]>("mercadolivre_tokens", {
    select: "user_id,access_token,refresh_token,token_type,scope,expires_in,expires_at",
    order: "updated_at.desc",
    limit: "1",
  });
  const row = Array.isArray(list) ? list[0] : null;
  if (!row?.access_token || !row?.refresh_token || !row?.expires_at || !row?.user_id) {
    throw new MercadoLivreNotAuthorizedError();
  }

  const userId = String(row.user_id);
  const tokenType = row.token_type ? String(row.token_type) : "bearer";
  const expiresAt = String(row.expires_at);

  if (!isExpiringSoon(expiresAt)) {
    return { user_id: userId, access_token: String(row.access_token), token_type: tokenType };
  }

  console.warn("[ml-oauth] access_token expirando; renovando via refresh_token", { userId });
  const refreshed = await refreshToken(String(row.refresh_token));

  await upsertMlToken({
    user_id: String(refreshed.user_id),
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    token_type: refreshed.token_type ?? "bearer",
    scope: refreshed.scope ?? null,
    expires_in: refreshed.expires_in,
    expires_at: computeExpiresAt(refreshed.expires_in),
  });

  return { user_id: String(refreshed.user_id), access_token: refreshed.access_token, token_type: refreshed.token_type ?? "bearer" };
}

