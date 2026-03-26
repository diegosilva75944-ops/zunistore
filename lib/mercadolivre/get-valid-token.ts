import "server-only";

import { getLatestMlToken, upsertMlToken } from "./token-store";
import { refreshToken, computeExpiresAt } from "./oauth";

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
  // Estratégia single-account: usa o token mais recente.
  const row = await getLatestMlToken();
  console.log("[ml-oauth] token_lookup", { found: Boolean(row), source: "database_sql_direct" });
  if (!row?.access_token || !row?.refresh_token || !row?.expires_at || !row?.user_id) {
    throw new MercadoLivreNotAuthorizedError();
  }

  const userId = String(row.user_id);
  const tokenType = row.token_type ? String(row.token_type) : "bearer";
  const expiresAt = String(row.expires_at);
  const expiringSoon = isExpiringSoon(expiresAt);
  console.log("[ml-oauth] token_state", {
    userId,
    expiresAt,
    expiringSoon,
  });

  if (!expiringSoon) {
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
  console.log("[ml-oauth] token_refresh_success", {
    userId: String(refreshed.user_id),
    expiresIn: refreshed.expires_in,
  });

  return { user_id: String(refreshed.user_id), access_token: refreshed.access_token, token_type: refreshed.token_type ?? "bearer" };
}

